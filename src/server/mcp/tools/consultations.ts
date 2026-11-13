import { z } from "zod";
import { cuidSchema, moneySchema, optionalDateSchema } from "@/src/lib/validation/common";
import { DomainError, NotFoundError } from "@/src/server/errors";
import * as consultationService from "@/src/server/consultations";
import { defineTool, type Tool } from "./types";

/**
 * Escritura de consultas. Cada herramienta replica su action de `src/actions/consultations.ts`:
 * mismo permiso, mismos esquemas, mismo servicio y mismas rutas refrescadas.
 * El cobro (checkout, enlace de pago por WhatsApp y los estados PAID y PAYMENT_PENDING) va con los pagos, no aquí.
 */

/** Sin PAID ni PAYMENT_PENDING: los pagos van en la tanda 3; Claude no registra un cobro que no ocurrió. */
const CONSULTATION_STATUSES = ["REQUESTED", "SCHEDULED", "COMPLETED", "CANCELLED"] as const;

/** Los servicios lanzan DomainError("… no encontrado") con ids ajenos: es "no existe". */
async function orNotFound<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DomainError && /no encontrad/i.test(error.message)) throw new NotFoundError();
    throw error;
  }
}

const CONSULTAS_HREF = "/crm/consultas";

const notesSchema = z.string().trim().max(5000).nullish().or(z.literal(""));

const consultaId = cuidSchema.describe("Identificador de la consulta (se obtiene con las herramientas de lectura de consultas).");

function revalidateConsultations(clientId?: string | null): string[] {
  return clientId ? [CONSULTAS_HREF, `/crm/clientes/${clientId}`] : [CONSULTAS_HREF];
}

const solicitarConsulta = defineTool({
  name: "solicitar_consulta",
  title: "Solicitar consulta",
  description:
    "Registra una consulta solicitada por un cliente (queda en estado REQUESTED, sin cobro automático) y avisa al equipo por correo y por WhatsApp a través de un servicio externo, con el nombre del cliente y el monto. No escribe al cliente. Los avisos salen de verdad y no se pueden retirar: confirma con la persona antes de usarla.",
  kind: "destructive",
  openWorld: true,
  permission: "consultations.manage",
  inputSchema: z.object({
    clientId: cuidSchema.describe("Identificador del cliente que solicita la consulta."),
    amount: moneySchema.optional().nullable().describe("Monto de la consulta en USD; si se omite se usa 1."),
    notes: notesSchema.describe("Notas opcionales de la solicitud (máximo 5000 caracteres)."),
  }),
  async run(ctx, data) {
    const consultation = await orNotFound(() =>
      consultationService.requestConsultation(ctx, {
        clientId: data.clientId,
        amount: data.amount ?? 1,
        notes: data.notes || null,
      }),
    );
    return { id: consultation.id, status: consultation.status, href: CONSULTAS_HREF };
  },
  audit: (_input, result) => ({ entityType: "Consultation", entityId: (result as { id: string }).id }),
  revalidate: (_result, input) => revalidateConsultations(input.clientId),
});

const cambiarEstadoConsulta = defineTool({
  name: "cambiar_estado_consulta",
  title: "Cambiar estado de consulta",
  description:
    "Cambia el estado de una consulta (REQUESTED, SCHEDULED, COMPLETED o CANCELLED), con fecha agendada y notas opcionales. Solo se permiten las transiciones que el CRM acepta. Los estados de cobro no se cambian desde aquí. CANCELLED es un cambio de estado, la consulta no se borra, pero una consulta cancelada o completada ya no vuelve a abrirse: pide confirmación a la persona antes de cancelar.",
  kind: "destructive",
  permission: "consultations.manage",
  inputSchema: z.object({
    consultaId,
    status: z
      .enum(CONSULTATION_STATUSES)
      .describe("Nuevo estado: REQUESTED, SCHEDULED, COMPLETED o CANCELLED."),
    scheduledAt: optionalDateSchema.describe("Fecha y hora agendada de la consulta (instante completo, p. ej. 2026-12-01T15:00:00Z); null la quita."),
    notes: notesSchema.describe("Notas de la consulta; reemplazan a las anteriores (máximo 5000 caracteres)."),
  }),
  async run(ctx, data) {
    const consultation = await orNotFound(() =>
      consultationService.updateConsultationStatus(ctx, data.consultaId, data.status, {
        scheduledAt: data.scheduledAt,
        notes: data.notes || undefined,
      }),
    );
    return {
      id: consultation.id,
      status: consultation.status,
      clientId: consultation.clientId,
      href: CONSULTAS_HREF,
    };
  },
  audit: (input, result) => ({
    entityType: "Consultation",
    entityId: (result as { id?: string } | null)?.id ?? input.consultaId,
  }),
  revalidate: (result) => revalidateConsultations((result as { clientId?: string } | null)?.clientId),
});

/** Herramientas de escritura de la sección consultas. */
export const consultationsTools: Tool[] = [solicitarConsulta, cambiarEstadoConsulta] as Tool[];
