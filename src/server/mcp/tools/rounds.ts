import { z } from "zod";
import {
  cuidSchema,
  orgDateInputSchema,
  requiredOrgDateInputSchema,
  resolveOrgDateInput,
} from "@/src/lib/validation/common";
import { prisma } from "@/src/lib/db";
import { CASE_ROUTE_PATTERN, caseHref } from "@/src/lib/routes/case-routes";
import { DomainError, NotFoundError } from "@/src/server/errors";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
import * as roundService from "@/src/server/rounds";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Escritura de rondas de disputa. Cada herramienta replica su action de
 * `src/actions/rounds.ts`: mismo permiso, mismo esquema, misma resolución de fechas
 * en la zona de la organización y mismo servicio.
 */

/** Los servicios lanzan DomainError("… no encontrada") con ids ajenos: es "no existe". */
async function orNotFound<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DomainError && /no encontrad/i.test(error.message)) throw new NotFoundError();
    throw error;
  }
}

/** Igual que `revalidateRounds` de la action. */
function roundRoutes(): RevalidateTarget[] {
  return ["/crm/rondas", { path: CASE_ROUTE_PATTERN, type: "layout" }, "/crm/dashboard"];
}

// Mismos esquemas que `src/actions/rounds.ts` (allí no se exportan).
const createRoundSchema = z.object({
  caseId: cuidSchema,
  notes: z.string().trim().max(5000).nullish(),
  lettersCount: z.number().int().min(0).optional(),
});
const updateRoundSchema = z.object({
  notes: z.string().trim().max(5000).nullish(),
  lettersCount: z.number().int().min(0).optional(),
});
const markSentSchema = z.object({
  expectedReviewAt: requiredOrgDateInputSchema("Indica la fecha esperada de revisión."),
  createReviewTask: z.boolean().optional(),
  assignedToId: cuidSchema.optional(),
  reminderAt: orgDateInputSchema,
});
const markReviewedSchema = z.object({
  outcome: z.enum(["COMPLETED", "REVIEWING"]).optional(),
  notes: z.string().trim().max(5000).nullish(),
});

const rondaId = cuidSchema.describe("Identificador de la ronda de disputas (se obtiene con `listar` o `ver` en la sección rondas).");
const notasDesc = "Notas internas de la ronda (máximo 5000 caracteres); null las borra.";
const cartasDesc = "Número de cartas de la ronda (entero, 0 o más).";

interface RoundRow {
  id: string;
  caseId: string;
  roundNumber: number;
  status: string;
}

/** Resultado pequeño con enlace a la ficha del cliente (panel Avance, ronda abierta). */
async function roundResult(round: RoundRow, extra: Record<string, unknown> = {}) {
  const creditCase = await prisma.creditCase.findUnique({ where: { id: round.caseId }, select: { clientId: true } });
  return {
    id: round.id,
    roundNumber: round.roundNumber,
    status: round.status,
    ...extra,
    href: creditCase ? caseHref(creditCase.clientId, round.caseId, `/rondas/${round.id}`) : "/crm/rondas",
  };
}

const auditRound = (input: object, result: unknown) => ({
  entityType: "CreditRound",
  entityId: (result as { id?: string } | null)?.id ?? (input as { rondaId?: string }).rondaId ?? null,
});

const crearRonda = defineTool({
  name: "crear_ronda",
  title: "Crear ronda de disputas",
  description:
    "Crea una ronda de disputas nueva en borrador para un caso de crédito abierto; el número de ronda se asigna solo. Úsala cuando la persona pida iniciar o preparar una nueva ronda de disputas.",
  kind: "write",
  permission: "rounds.manage",
  inputSchema: z.object({
    caseId: createRoundSchema.shape.caseId.describe("Identificador del caso de crédito (debe estar abierto)."),
    notes: createRoundSchema.shape.notes.describe(notasDesc),
    lettersCount: createRoundSchema.shape.lettersCount.describe(cartasDesc),
  }),
  async run(ctx, input) {
    const round = await orNotFound(() => roundService.createRound(ctx, createRoundSchema.parse(input)));
    return roundResult(round);
  },
  audit: auditRound,
  revalidate: () => roundRoutes(),
});

const editarRonda = defineTool({
  name: "editar_ronda",
  title: "Editar ronda de disputas",
  description:
    "Cambia las notas o el número de cartas de una ronda que sigue en borrador o preparación. No sirve para rondas ya enviadas, completadas o canceladas.",
  kind: "write",
  permission: "rounds.manage",
  inputSchema: z.object({
    rondaId,
    notes: updateRoundSchema.shape.notes.describe(notasDesc),
    lettersCount: updateRoundSchema.shape.lettersCount.describe(cartasDesc),
  }),
  async run(ctx, { rondaId: id, ...rest }) {
    const data = updateRoundSchema.parse(rest);
    const round = await orNotFound(() => roundService.updateRound(ctx, id, data));
    return roundResult(round);
  },
  audit: auditRound,
  revalidate: () => roundRoutes(),
});

const marcarRondaEnviada = defineTool({
  name: "marcar_ronda_enviada",
  title: "Marcar ronda como enviada",
  description:
    "Marca una ronda en borrador o preparación como enviada, con la fecha esperada de revisión; puede crear la tarea de revisión. Exige que el cliente tenga el contrato firmado. Úsala cuando la persona confirme que las cartas ya salieron.",
  kind: "write",
  permission: "rounds.manage",
  inputSchema: z.object({
    rondaId,
    expectedReviewAt: markSentSchema.shape.expectedReviewAt.describe(
      "Fecha esperada de revisión como AAAA-MM-DD (se interpreta a las 12:00 en la zona horaria de la organización) o instante completo. Obligatoria.",
    ),
    createReviewTask: markSentSchema.shape.createReviewTask.describe("Si es true, crea una tarea de revisión con vencimiento en esa fecha."),
    assignedToId: markSentSchema.shape.assignedToId.describe("Identificador del responsable de la tarea de revisión; si se omite se usa el del caso."),
    reminderAt: markSentSchema.shape.reminderAt.describe(
      "Recordatorio de la tarea, AAAA-MM-DD (a las 09:00 de la organización) o instante completo; por defecto, el día de la revisión.",
    ),
  }),
  async run(ctx, { rondaId: id, ...rest }) {
    const data = markSentSchema.parse(rest);
    const tz = await getOrganizationTimezone(ctx.organizationId);
    // Mismo criterio que la action: vence a mediodía, recuerda a las 9:00 del mismo día.
    const reminderInput = data.reminderAt ?? (typeof data.expectedReviewAt === "string" ? data.expectedReviewAt : undefined);
    const result = await orNotFound(() =>
      roundService.markRoundSent(ctx, id, {
        ...data,
        expectedReviewAt: resolveOrgDateInput(data.expectedReviewAt, tz, 12) as Date,
        reminderAt: resolveOrgDateInput(reminderInput, tz, 9) ?? undefined,
      }),
    );
    return roundResult(result.round, { reviewTaskId: result.reviewTask?.id ?? null });
  },
  audit: auditRound,
  revalidate: () => [...roundRoutes(), "/crm/tareas"],
});

const marcarRondaRevisada = defineTool({
  name: "marcar_ronda_revisada",
  title: "Marcar ronda como revisada",
  description:
    "Registra la revisión de una ronda enviada: por defecto la deja COMPLETED; con outcome REVIEWING queda en análisis. Úsala cuando la persona diga que ya llegó y se revisó la respuesta del buró.",
  kind: "write",
  permission: "rounds.manage",
  inputSchema: z.object({
    rondaId,
    outcome: markReviewedSchema.shape.outcome.describe("Resultado: COMPLETED (cierra la ronda, por defecto) o REVIEWING (sigue en análisis)."),
    notes: markReviewedSchema.shape.notes.describe(notasDesc),
  }),
  async run(ctx, { rondaId: id, ...rest }) {
    const data = markReviewedSchema.parse(rest);
    const round = await orNotFound(() => roundService.markRoundReviewed(ctx, id, data));
    return roundResult(round);
  },
  audit: auditRound,
  revalidate: () => roundRoutes(),
});

const cancelarRonda = defineTool({
  name: "cancelar_ronda",
  title: "Cancelar ronda de disputas",
  description:
    "Cancela una ronda de disputas: queda con estado CANCELLED y no se borra, pero la herramienta no tiene forma de reabrirla. Pide confirmación a la persona antes de ejecutarla. No aplica a rondas completadas.",
  kind: "destructive",
  permission: "rounds.manage",
  inputSchema: z.object({ rondaId }),
  async run(ctx, { rondaId: id }) {
    return roundResult(await orNotFound(() => roundService.cancelRound(ctx, id)));
  },
  audit: auditRound,
  revalidate: () => roundRoutes(),
});

/** Herramientas de escritura de rondas. */
export const roundsTools: Tool[] = [crearRonda, editarRonda, marcarRondaEnviada, marcarRondaRevisada, cancelarRonda] as Tool[];
