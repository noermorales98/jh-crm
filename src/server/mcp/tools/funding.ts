import { z } from "zod";
import { FundingApplicationStatus } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { cuidSchema, optionalDateSchema } from "@/src/lib/validation/common";
import { DomainError, NotFoundError } from "@/src/server/errors";
import * as funding from "@/src/server/funding";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Escritura de solicitudes de financiamiento (aplicaciones a prestamistas de un expediente de
 * financiamiento de negocio). Cada herramienta replica su action de `src/actions/funding.ts`:
 * mismo permiso (`cases.manage`), mismo esquema, mismo servicio y mismas rutas refrescadas.
 * Anotar una solicitud solo deja constancia en el CRM: no contacta a ningún prestamista.
 */

/** Los servicios lanzan DomainError("… no encontrado") con ids ajenos: es "no existe". */
async function orNotFound<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DomainError && /no encontrad/i.test(error.message)) throw new NotFoundError();
    throw error;
  }
}

/** Igual que `refresh` de la action. */
function fundingRoutes(serviceCaseId: string, clientId: string): RevalidateTarget[] {
  return [`/crm/expedientes/${serviceCaseId}`, `/crm/clientes/${clientId}/actividad`, `/crm/clientes/${clientId}/servicios`];
}

// Mismo esquema que `src/actions/funding.ts` (allí no se exporta).
const amountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Monto inválido (máximo 2 decimales).")
  .nullish();
const applicationSchema = z.object({
  lenderName: z.string().trim().min(1, "Indica el prestamista.").max(191),
  requestedAmount: amountSchema,
  approvedAmount: amountSchema,
  status: z.enum(FundingApplicationStatus).default("DRAFT"),
  submittedAt: optionalDateSchema,
  decisionAt: optionalDateSchema,
  notes: z.string().trim().max(5000).nullish(),
});

const expedienteId = cuidSchema.describe("Identificador del expediente de financiamiento (se obtiene con `listar` en la sección casos_servicio).");
const solicitudId = cuidSchema.describe("Identificador de la solicitud (se obtiene con `listar` en la sección financiamiento).");
const prestamistaDesc = "Nombre del prestamista (de 1 a 191 caracteres).";
const solicitadoDesc = "Monto solicitado en USD, como texto con máximo 2 decimales (p. ej. \"25000.00\"); null lo borra.";
const aprobadoDesc = "Monto aprobado en USD, como texto con máximo 2 decimales; null lo borra.";
const estadoDesc = `Estado: ${FundingApplicationStatus.DRAFT}, SUBMITTED, UNDER_REVIEW, APPROVED, DENIED, FUNDED o WITHDRAWN.`;
const envioDesc = "Fecha en que se envió (instante completo, p. ej. 2026-12-01T12:00:00Z); null la quita.";
const decisionDesc = "Fecha de la decisión del prestamista (instante completo); no puede ser anterior al envío; null la quita.";
const notasDesc = "Notas de la solicitud (máximo 5000 caracteres); null las borra.";

const crearSolicitudFinanciamiento = defineTool({
  name: "crear_solicitud_financiamiento",
  title: "Registrar solicitud a un prestamista",
  description:
    "Anota una aplicación a un prestamista dentro de un expediente de financiamiento abierto. Solo deja constancia en el CRM: no contacta al prestamista ni envía nada.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: z.object({
    expedienteId,
    lenderName: applicationSchema.shape.lenderName.describe(prestamistaDesc),
    requestedAmount: applicationSchema.shape.requestedAmount.describe(solicitadoDesc),
    approvedAmount: applicationSchema.shape.approvedAmount.describe(aprobadoDesc),
    status: applicationSchema.shape.status.describe(`${estadoDesc} Por defecto DRAFT.`),
    submittedAt: applicationSchema.shape.submittedAt.describe(envioDesc),
    decisionAt: applicationSchema.shape.decisionAt.describe(decisionDesc),
    notes: applicationSchema.shape.notes.describe(notasDesc),
  }),
  async run(ctx, { expedienteId: serviceCaseId, ...rest }) {
    const row = await orNotFound(() => funding.createFundingApplication(ctx, serviceCaseId, applicationSchema.parse(rest)));
    return { id: row.id, status: row.status, serviceCaseId, clientId: row.clientId, href: `/crm/expedientes/${serviceCaseId}` };
  },
  audit: (_input, result) => ({ entityType: "FundingApplication", entityId: (result as { id: string }).id }),
  revalidate: (result, input) => fundingRoutes(input.expedienteId, (result as { clientId: string }).clientId),
});

const editarSolicitudFinanciamiento = defineTool({
  name: "editar_solicitud_financiamiento",
  title: "Editar solicitud a un prestamista",
  description:
    "Cambia el prestamista, los montos, el estado, las fechas o las notas de una solicitud de financiamiento; lo que no envíes se queda como estaba. No sirve en expedientes cerrados o archivados. Solo deja constancia en el CRM: no contacta al prestamista.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: z.object({
    expedienteId,
    solicitudId,
    actualizadoEn: z.coerce.date().describe("Fecha `updatedAt` de la solicitud tal como la devolvió `ver`; si alguien la cambió mientras tanto, la herramienta falla y hay que volver a leerla."),
    lenderName: applicationSchema.shape.lenderName.optional().describe(prestamistaDesc),
    requestedAmount: applicationSchema.shape.requestedAmount.describe(solicitadoDesc),
    approvedAmount: applicationSchema.shape.approvedAmount.describe(aprobadoDesc),
    status: z.enum(FundingApplicationStatus).optional().describe(estadoDesc),
    submittedAt: applicationSchema.shape.submittedAt.describe(envioDesc),
    decisionAt: applicationSchema.shape.decisionAt.describe(decisionDesc),
    notes: applicationSchema.shape.notes.describe(notasDesc),
  }),
  async run(ctx, { expedienteId: serviceCaseId, solicitudId: id, actualizadoEn, ...changes }) {
    // El servicio reemplaza todos los campos (y un estado omitido volvería a DRAFT):
    // la herramienta parte de los valores actuales y solo pisa lo que se envía.
    const current = await prisma.fundingApplication.findFirst({
      where: { id, organizationId: ctx.organizationId, fundingCase: { serviceCaseId } },
    });
    if (!current) throw new NotFoundError();
    const has = (key: keyof typeof changes) => changes[key] !== undefined;
    const input = applicationSchema.parse({
      lenderName: changes.lenderName ?? current.lenderName,
      requestedAmount: has("requestedAmount") ? changes.requestedAmount : current.requestedAmount?.toFixed(2) ?? null,
      approvedAmount: has("approvedAmount") ? changes.approvedAmount : current.approvedAmount?.toFixed(2) ?? null,
      status: changes.status ?? current.status,
      submittedAt: has("submittedAt") ? changes.submittedAt : current.submittedAt,
      decisionAt: has("decisionAt") ? changes.decisionAt : current.decisionAt,
      notes: has("notes") ? changes.notes : current.notes,
    });
    const row = await orNotFound(() => funding.updateFundingApplication(ctx, serviceCaseId, id, actualizadoEn, input));
    return { id: row.id, status: row.status, serviceCaseId, clientId: row.clientId, updatedAt: row.updatedAt, href: `/crm/expedientes/${serviceCaseId}` };
  },
  audit: (input, result) => ({
    entityType: "FundingApplication",
    entityId: (result as { id?: string } | null)?.id ?? input.solicitudId,
  }),
  revalidate: (result, input) => fundingRoutes(input.expedienteId, (result as { clientId: string }).clientId),
});

/** Herramientas de escritura de solicitudes de financiamiento. */
export const fundingTools: Tool[] = [crearSolicitudFinanciamiento, editarSolicitudFinanciamiento] as Tool[];
