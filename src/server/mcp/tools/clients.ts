import { z } from "zod";
import { clientAssignSchema, clientCreateSchema, clientUpdateSchema } from "@/src/lib/validation";
import { cuidSchema } from "@/src/lib/validation/common";
import * as clientService from "@/src/server/clients";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Escritura de Clientes (espejo de src/actions/clients.ts). Sin datos sensibles
 * (SSN, ITIN, licencia): ningún campo de entrada ni de salida los toca.
 */

const clienteId = cuidSchema.describe("Identificador del cliente (lo devuelven listar y buscar).");

const FIELD_DOCS = {
  firstName: "Nombre del cliente.",
  lastName: "Apellido del cliente.",
  email: "Correo electrónico.",
  phone: "Teléfono (formato de EE. UU.).",
  addressLine1: "Dirección, primera línea.",
  addressLine2: "Dirección, segunda línea.",
  city: "Ciudad.",
  state: "Estado de EE. UU. con 2 letras, por ejemplo TX.",
  postalCode: "Código postal de 5 dígitos (o 5+4).",
  source: "De dónde llegó el cliente (referido, web, etc.).",
} as const;

function describeFields<T extends Record<string, z.ZodType>>(shape: T): T {
  const out: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(shape)) {
    const doc = (FIELD_DOCS as Record<string, string>)[key];
    out[key] = doc ? field.describe(doc) : field;
  }
  return out as T;
}

const createInput = z.object(describeFields(clientCreateSchema.shape));

const updateInput = z.object({
  clienteId,
  ...describeFields(clientUpdateSchema.shape),
  status: clientUpdateSchema.shape.status.describe("Estado: LEAD, ACTIVE, PAUSED, COMPLETED o CANCELLED (para archivar usa archivar_cliente)."),
  assignedToId: clientUpdateSchema.shape.assignedToId.describe("Identificador del responsable, o vacío para no cambiarlo."),
});

const assignInput = z.object({
  clienteId,
  assignedToId: clientAssignSchema.shape.assignedToId.describe("Identificador del miembro del equipo responsable, o null para quitar al responsable."),
});

const archiveInput = z.object({ clienteId });

const href = (id: string) => `/crm/clientes/${id}`;

/** Las mismas rutas que `revalidateClients` de la action. */
function clientPaths(id: string): RevalidateTarget[] {
  return ["/crm/clientes", "/crm/dashboard", `/crm/clientes/${id}`, `/crm/clientes/${id}/expediente`];
}

const resultId = (result: unknown) => (result as { id: string }).id;
const auditClient = (_input: unknown, result: unknown) => ({ entityType: "Client", entityId: resultId(result) });
const revalidateClient = (result: unknown) => clientPaths(resultId(result));

export const clientsTools: Tool[] = [
  defineTool({
    name: "crear_cliente",
    title: "Crear cliente",
    description:
      "Crea un cliente nuevo en el CRM con sus datos de contacto básicos. Úsala cuando la persona pida dar de alta a alguien que aún no existe; busca antes para no duplicar. No guarda datos sensibles como SSN.",
    kind: "write",
    permission: "clients.create",
    inputSchema: createInput,
    async run(ctx, input) {
      const client = await clientService.createClient(ctx, clientCreateSchema.parse(input));
      return { id: client.id, clientCode: client.clientCode, href: href(client.id) };
    },
    audit: auditClient,
    revalidate: revalidateClient,
  }),
  defineTool({
    name: "editar_cliente",
    title: "Editar cliente",
    description:
      "Cambia datos de contacto o el estado de un cliente existente; solo se modifican los campos enviados. Úsala para corregir teléfono, correo, dirección o estado. No edita clientes archivados ni datos sensibles.",
    kind: "write",
    permission: "clients.edit",
    inputSchema: updateInput,
    async run(ctx, input) {
      const { clienteId: id, ...rest } = input;
      const client = await clientService.updateClient(ctx, cuidSchema.parse(id), clientUpdateSchema.parse(rest));
      return { id: client.id, href: href(client.id) };
    },
    audit: auditClient,
    revalidate: revalidateClient,
  }),
  defineTool({
    name: "asignar_cliente",
    title: "Asignar cliente",
    description:
      "Asigna un cliente a un miembro del equipo, o quita su responsable si se envía null. Úsala cuando la persona diga quién debe llevar a un cliente.",
    kind: "write",
    permission: "clients.edit",
    inputSchema: assignInput,
    async run(ctx, input) {
      const client = await clientService.assignClient(ctx, input.clienteId, input.assignedToId);
      return { id: client.id, assignedToId: client.assignedToId, href: href(client.id) };
    },
    audit: auditClient,
    revalidate: revalidateClient,
  }),
  defineTool({
    name: "archivar_cliente",
    title: "Archivar cliente",
    description:
      "Archiva un cliente: lo oculta de las listas activas pero conserva todo su historial; no se borra nada y es reversible desde el CRM. Pide confirmación a la persona antes de ejecutarla. Úsala solo cuando la persona pida archivar o dar de baja al cliente.",
    kind: "destructive",
    permission: "clients.edit",
    inputSchema: archiveInput,
    async run(ctx, input) {
      const client = await clientService.archiveClient(ctx, input.clienteId);
      return { id: client.id, status: client.status, href: href(client.id) };
    },
    audit: auditClient,
    revalidate: revalidateClient,
  }),
];
