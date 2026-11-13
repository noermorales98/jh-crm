import { z } from "zod";
import { cuidSchema } from "@/src/lib/validation/common";
import { leadMessageCreateSchema, serviceCaseNoteCreateSchema } from "@/src/lib/validation/notes";
import { CASE_ROUTE_PATTERN } from "@/src/lib/routes/case-routes";
import * as notes from "@/src/server/notes";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Herramientas de escritura de notas (T020). Reflejan `src/actions/notes.ts`: mismo
 * permiso, mismos esquemas (compartidos en `src/lib/validation/notes`) y mismo servicio.
 * Las notas no se borran en la app, así que aquí tampoco hay herramienta de borrado.
 */

const noteSummary = (note: { id: string; body: string; createdAt: Date; author: { name: string | null } }) => ({
  id: note.id,
  body: note.body,
  createdAt: note.createdAt.toISOString(),
  authorName: note.author.name,
});

const clientNoteInput = z.object({
  clientId: cuidSchema.describe("Id del cliente (lead) al que se agrega la nota."),
  opportunityId: cuidSchema.optional().describe("Id de una oportunidad de ese cliente, si la nota se refiere a ella."),
  body: leadMessageCreateSchema.shape.body.describe("Texto de la nota, hasta 5000 caracteres."),
});

const clientPaths = (clientId: string): RevalidateTarget[] => [
  `/crm/clientes/${clientId}`,
  `/crm/clientes/${clientId}/notas`,
  `/crm/clientes/${clientId}/actividad`,
];

const agregarNotaCliente = defineTool({
  name: "agregar_nota_cliente",
  title: "Agregar nota a un cliente",
  description:
    "Agrega una nota de texto a la ficha de un cliente. Úsala cuando la persona pida dejar constancia de algo sobre un cliente: una llamada, un acuerdo o un dato a recordar. Queda firmada por quien conectó Claude.",
  inputSchema: clientNoteInput,
  permission: "clients.edit",
  kind: "write",
  run: async (ctx, input) => {
    const note = await notes.createClientNote(ctx, {
      clientId: input.clientId,
      body: input.body,
      opportunityId: input.opportunityId,
    });
    return { ...noteSummary(note), clientId: input.clientId, href: `/crm/clientes/${input.clientId}/notas` };
  },
  audit: (_input, result) => ({ entityType: "Note", entityId: (result as { id: string }).id }),
  revalidate: (_result, input) => clientPaths(input.clientId),
});

const caseNoteInput = z
  .object({
    caseId: cuidSchema.optional().describe("Id del caso de crédito (use este o serviceCaseId)."),
    serviceCaseId: cuidSchema.optional().describe("Id del caso de servicio / expediente (use este o caseId)."),
    body: serviceCaseNoteCreateSchema.shape.body.describe("Texto de la nota, hasta 5000 caracteres."),
  })
  .refine((d) => Boolean(d.caseId || d.serviceCaseId), { message: "Indica el expediente de la nota." });

const agregarNotaCaso = defineTool({
  name: "agregar_nota_caso",
  title: "Agregar nota a un caso",
  description:
    "Agrega una nota de texto al expediente de un caso (de crédito o de servicio). Úsala cuando la persona pida anotar algo en un caso concreto; indica caseId o serviceCaseId.",
  inputSchema: caseNoteInput,
  permission: "cases.manage",
  kind: "write",
  run: async (ctx, input) => {
    const note = await notes.createServiceCaseNote(ctx, {
      caseId: input.caseId,
      serviceCaseId: input.serviceCaseId,
      body: input.body,
    });
    return { ...noteSummary(note), clientId: note.clientId, href: `/crm/clientes/${note.clientId}/notas` };
  },
  audit: (_input, result) => ({ entityType: "Note", entityId: (result as { id: string }).id }),
  revalidate: (result, input) => {
    const clientId = (result as { clientId: string }).clientId;
    const paths: RevalidateTarget[] = [];
    if (input.caseId) paths.push({ path: CASE_ROUTE_PATTERN, type: "layout" });
    if (input.serviceCaseId) paths.push(`/crm/expedientes/${input.serviceCaseId}`);
    return [...paths, ...clientPaths(clientId)];
  },
});

const agregarMensajeLead = defineTool({
  name: "agregar_mensaje_lead",
  title: "Agregar mensaje a un lead",
  description:
    "Agrega un mensaje o nota al historial de un lead del embudo de oportunidades. Úsala cuando la persona quiera registrar lo que dijo o pidió un lead; puedes ligarlo a una oportunidad con opportunityId.",
  inputSchema: clientNoteInput,
  permission: "opportunities.manage",
  kind: "write",
  run: async (ctx, input) => {
    const note = await notes.createClientNote(ctx, {
      clientId: input.clientId,
      body: input.body,
      opportunityId: input.opportunityId,
    });
    return { ...noteSummary(note), clientId: input.clientId, href: `/crm/oportunidades?clientId=${input.clientId}` };
  },
  audit: (_input, result) => ({ entityType: "Note", entityId: (result as { id: string }).id }),
  revalidate: (_result, input) => [
    { path: "/crm/oportunidades", type: "layout" },
    { path: "/crm/oportunidades", type: "page" },
    ...clientPaths(input.clientId),
  ],
});

export const notesTools: Tool[] = [agregarNotaCliente, agregarNotaCaso, agregarMensajeLead] as Tool[];
