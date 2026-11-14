import { z } from "zod";
import { prisma } from "@/src/lib/db";
import { cuidSchema } from "@/src/lib/validation/common";
import {
  createLetterDraftSchema,
  markLetterSentSchema,
  updateLetterDraftSchema,
} from "@/src/lib/validation/letters";
import { CASE_ROUTE_PATTERN, caseHref } from "@/src/lib/routes/case-routes";
import { DomainError, NotFoundError } from "@/src/server/errors";
import * as letterService from "@/src/server/letters";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Escritura de cartas de disputa (T2-04). Cada herramienta replica su action de
 * `src/actions/letters.ts` o `src/actions/dispute-methods.ts`: mismo permiso, mismo
 * esquema, mismo servicio y mismo refresco. Los resultados llevan solo id, estado y
 * enlace; el texto de la carta (datos del cliente) no se devuelve.
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

/** Igual que `revalidateRound` / `revalidatePath(CASE_ROUTE_PATTERN, "layout")` de las actions. */
const LETTER_PATHS: RevalidateTarget[] = [{ path: CASE_ROUTE_PATTERN, type: "layout" }];

interface LetterResult {
  id: string;
  roundId: string;
  status: string;
  href: string;
}

function letterOut(letter: { id: string; roundId: string; status: string }, clientId: string, caseId: string): LetterResult {
  return {
    id: letter.id,
    roundId: letter.roundId,
    status: letter.status,
    href: caseHref(clientId, caseId, `/rondas/${letter.roundId}`),
  };
}

/** Carta ya tocada por el servicio, con el caso al que pertenece (como hacen las actions). */
async function withCase(
  ctx: Parameters<typeof letterService.getLetter>[0],
  letter: { id: string; roundId: string; status: string },
): Promise<LetterResult> {
  const full = await letterService.getLetter(ctx, letter.id);
  return letterOut(letter, full.round.case.clientId, full.round.caseId);
}

const letterAudit = (_input: unknown, result: unknown) => ({
  entityType: "DisputeLetter",
  entityId: (result as { id: string }).id,
});
const revalidateLetter = () => LETTER_PATHS;

const letterIdField = cuidSchema.describe("Identificador de la carta de disputa (el `id` que devuelven las herramientas de cartas).");

const create = createLetterDraftSchema.shape;
const update = updateLetterDraftSchema.shape;
const sent = markLetterSentSchema.shape;

const crearBorradorCarta = defineTool({
  name: "crear_borrador_carta",
  title: "Crear borrador de carta de disputa",
  description:
    "Crea una carta de disputa en borrador (queda lista para revisión) para un buró, con una plantilla y las disputas elegidas de una ronda. Úsala cuando la persona pida preparar una carta; el texto sale de la plantilla salvo que se indique asunto o contenido propio. No la envía ni la finaliza.",
  kind: "write",
  permission: "letters.manage",
  inputSchema: z.object({
    roundId: create.roundId.describe("Identificador de la ronda de disputas a la que pertenece la carta."),
    bureau: create.bureau.describe("Buró destinatario: EXPERIAN, EQUIFAX o TRANSUNION."),
    templateId: create.templateId.describe("Identificador de la plantilla de carta."),
    disputeItemIds: create.disputeItemIds.describe("Identificadores de las disputas de la ronda que cubre la carta (de 1 a 50)."),
    subject: create.subject.describe("Asunto propio; si se omite se usa el de la plantilla."),
    content: create.content.describe("Contenido propio (20 a 50000 caracteres); si se omite se usa el de la plantilla."),
    recipient: create.recipient.describe("Destinatario propio; si se omite se usa el del buró."),
    notes: create.notes.describe("Notas internas de la carta; no van en el texto."),
  }),
  async run(ctx, data) {
    const letter = await orNotFound(() => letterService.createLetterDraft(ctx, data));
    return orNotFound(() => withCase(ctx, letter));
  },
  audit: letterAudit,
  revalidate: revalidateLetter,
});

const editarBorradorCarta = defineTool({
  name: "editar_borrador_carta",
  title: "Editar borrador de carta de disputa",
  description:
    "Cambia el asunto, el contenido, el destinatario o las notas de una carta en borrador o en revisión; la deja en revisión. Úsala cuando la persona quiera corregir el texto antes de finalizarla; no sirve con cartas ya finalizadas o enviadas.",
  kind: "write",
  permission: "letters.manage",
  inputSchema: z.object({
    letterId: letterIdField,
    subject: update.subject.describe("Nuevo asunto."),
    content: update.content.describe("Nuevo contenido completo de la carta (20 a 50000 caracteres)."),
    recipient: update.recipient.describe("Nuevo destinatario."),
    notes: update.notes.describe("Nuevas notas internas; vacío o null las borra."),
  }),
  async run(ctx, { letterId, ...data }) {
    const letter = await orNotFound(() => letterService.updateLetterDraft(ctx, letterId, data));
    return orNotFound(() => withCase(ctx, letter));
  },
  audit: letterAudit,
  revalidate: revalidateLetter,
});

const finalizarCarta = defineTool({
  name: "finalizar_carta",
  title: "Finalizar carta de disputa",
  description:
    "Marca una carta como final tras la revisión de la persona: ya no se podrá editar. No genera ni envía nada. Úsala solo cuando la persona confirme que el texto está revisado y aprobado.",
  kind: "write",
  permission: "letters.manage",
  inputSchema: z.object({ letterId: letterIdField }),
  async run(ctx, { letterId }) {
    const result = await orNotFound(() => letterService.finalizeLetter(ctx, letterId));
    return orNotFound(() => withCase(ctx, result.letter));
  },
  audit: letterAudit,
  revalidate: revalidateLetter,
});

const marcarCartaEnviada = defineTool({
  name: "marcar_carta_enviada",
  title: "Marcar carta como enviada",
  description:
    "Registra que la persona ya envió por correo una carta finalizada (con número de guía opcional) y fija la fecha de seguimiento. Solo anota el envío en el CRM: no envía nada. Úsala cuando la persona diga que ya mandó la carta.",
  kind: "write",
  permission: "letters.manage",
  inputSchema: z.object({
    letterId: letterIdField,
    trackingNumber: sent.trackingNumber.describe("Número de guía o rastreo del envío (máximo 120 caracteres)."),
    notes: sent.notes.describe("Notas internas del envío."),
  }),
  async run(ctx, { letterId, ...data }) {
    const letter = await orNotFound(() => letterService.markLetterSent(ctx, letterId, data));
    return orNotFound(() => withCase(ctx, letter));
  },
  audit: letterAudit,
  revalidate: revalidateLetter,
});

const generarCartasPorEstrategia = defineTool({
  name: "generar_cartas_por_estrategia",
  title: "Generar cartas por estrategia",
  description:
    "Arma automáticamente los borradores de una ronda: una carta por buró y método de disputa, y opcionalmente una queja al CFPB por buró. Solo toma disputas aún sin carta. Úsala cuando la persona pida generar todas las cartas de una ronda de una vez.",
  kind: "write",
  permission: "letters.manage",
  inputSchema: z.object({
    roundId: cuidSchema.describe("Identificador de la ronda de disputas."),
    cfpb: z.boolean().default(false).describe("true para armar además una queja al CFPB por buró; por omisión no."),
  }),
  async run(ctx, data) {
    const round = await prisma.creditRound.findFirst({
      where: { id: data.roundId, organizationId: ctx.organizationId },
      select: { id: true, caseId: true, case: { select: { clientId: true } } },
    });
    if (!round) throw new NotFoundError();
    const result = await letterService.generateLettersByStrategy(ctx, data);
    return {
      roundId: round.id,
      letters: result.letters,
      complaints: result.complaints,
      href: caseHref(round.case.clientId, round.caseId, `/rondas/${round.id}`),
    };
  },
  audit: (input) => ({ entityType: "CreditRound", entityId: input.roundId }),
  revalidate: revalidateLetter,
});

const actualizarSeguimientoCarta = defineTool({
  name: "actualizar_seguimiento_carta",
  title: "Actualizar seguimiento de carta",
  description:
    "Guarda el Complaint ID del CFPB y/o la fecha de revisión de una carta o queja. Úsala cuando la persona dé el número de queja o pida fijar cuándo revisar la respuesta; null borra el dato y omitirlo lo deja igual.",
  kind: "write",
  permission: "letters.manage",
  inputSchema: z.object({
    letterId: letterIdField,
    complaintId: z.string().max(40).nullable().optional().describe("Complaint ID del CFPB (máximo 40 caracteres); null lo borra."),
    followUpAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional()
      .describe("Fecha de revisión como AAAA-MM-DD; null la quita."),
  }),
  async run(ctx, data) {
    const letter = await orNotFound(() =>
      letterService.updateLetterFollowUp(ctx, data.letterId, {
        complaintId: data.complaintId,
        followUpAt:
          data.followUpAt === undefined ? undefined : data.followUpAt === null ? null : new Date(`${data.followUpAt}T12:00:00.000Z`),
      }),
    );
    return orNotFound(() => withCase(ctx, letter));
  },
  audit: letterAudit,
  revalidate: revalidateLetter,
});

/** Herramientas de escritura de cartas (T2-04). */
export const lettersTools: Tool[] = [
  crearBorradorCarta,
  editarBorradorCarta,
  finalizarCarta,
  marcarCartaEnviada,
  generarCartasPorEstrategia,
  actualizarSeguimientoCarta,
] as Tool[];
