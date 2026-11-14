import { z } from "zod";
import { cuidSchema } from "@/src/lib/validation/common";
import {
  addDisputeItemSchema,
  addDisputeItemsBulkSchema,
  updateDisputeItemSchema,
} from "@/src/lib/validation/disputes";
import { DISPUTE_STRATEGIES, PERSONAL_INFO_KINDS, personalInfoLabel } from "@/src/lib/disputes/strategies";
import { CASE_ROUTE_PATTERN, caseHref } from "@/src/lib/routes/case-routes";
import { prisma } from "@/src/lib/db";
import { DomainError, NotFoundError } from "@/src/server/errors";
import * as disputeService from "@/src/server/disputes";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Escritura de disputas (T2-03). Cada herramienta replica su action de
 * `src/actions/disputes.ts` o `src/actions/dispute-methods.ts`: mismo permiso, mismo
 * esquema, mismo servicio y las mismas rutas refrescadas.
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

type DisputeCtx = Parameters<typeof disputeService.getRoundDetail>[0];

async function openRoundOrThrow(ctx: DisputeCtx, roundId: string) {
  const round = await prisma.creditRound.findFirst({
    where: { id: roundId, organizationId: ctx.organizationId },
    select: { id: true, status: true, caseId: true, case: { select: { clientId: true } } },
  });
  if (!round) throw new NotFoundError();
  if (round.status === "CANCELLED" || round.status === "COMPLETED") {
    throw new DomainError("No se pueden añadir elementos a una ronda cerrada.");
  }
  return round;
}

/**
 * `addDisputeItemsBulk` agrega de una en una, cada una en su propia transacción: si la
 * tercera falla, las dos primeras ya quedaron. Por eso se valida TODO antes de escribir:
 * ronda abierta de la organización, cuentas del mismo caso, elegibles, sin repetir y que
 * aún no estén en la ronda. Un id ajeno falla aquí, sin haber agregado nada.
 */
async function validateBulk(ctx: DisputeCtx, data: { roundId: string; creditItemIds: string[] }) {
  const round = await openRoundOrThrow(ctx, data.roundId);
  const ids = [...new Set(data.creditItemIds)];
  if (ids.length !== data.creditItemIds.length) throw new DomainError("Hay cuentas repetidas en la lista.");
  const items = await prisma.creditItem.findMany({
    where: { id: { in: ids }, organizationId: ctx.organizationId, caseId: round.caseId },
    select: { id: true, disputeEligible: true },
  });
  if (items.length !== ids.length) throw new NotFoundError();
  if (items.some((i) => !i.disputeEligible)) throw new DomainError("Este elemento no es elegible para disputa.");
  const taken = await prisma.disputeItem.findFirst({
    where: { roundId: round.id, creditItemId: { in: ids }, status: { not: "CANCELLED" } },
    select: { id: true },
  });
  if (taken) throw new DomainError("Este elemento ya está en la ronda.");
}

/**
 * Igual para consultas y datos personales: se escriben una por una, así que se valida la
 * ronda y cada consulta (de la organización y del cliente de la ronda, mismo buró, sin repetir
 * ni estar ya en la ronda) antes de agregar la primera.
 */
async function validateNonAccount(
  ctx: DisputeCtx,
  data: { roundId: string; inquiries: Array<{ inquiryId: string; bureau: string; label: string }> },
) {
  const round = await openRoundOrThrow(ctx, data.roundId);
  if (data.inquiries.some((i) => !i.label.trim())) throw new DomainError("Indica qué se disputa.");
  const ids = [...new Set(data.inquiries.map((i) => i.inquiryId))];
  if (ids.length !== data.inquiries.length) throw new DomainError("Hay consultas repetidas en la lista.");
  if (ids.length === 0) return;
  const found = await prisma.creditInquiry.findMany({
    where: { id: { in: ids }, organizationId: ctx.organizationId, clientId: round.case.clientId },
    select: { id: true, bureau: true },
  });
  if (found.length !== ids.length) throw new NotFoundError();
  const bureauOf = new Map(found.map((i) => [i.id, i.bureau]));
  if (data.inquiries.some((i) => bureauOf.get(i.inquiryId) !== i.bureau)) throw new DomainError("La consulta es de otro buró.");
  const taken = await prisma.disputeItem.findFirst({
    where: { roundId: round.id, inquiryId: { in: ids }, status: { not: "CANCELLED" } },
    select: { id: true },
  });
  if (taken) throw new DomainError("Esta consulta ya está en la ronda.");
}

/** Igual que `revalidateDisputes` de la action de disputas. */
const DISPUTE_PATHS: RevalidateTarget[] = [{ path: CASE_ROUTE_PATTERN, type: "layout" }, "/crm/rondas"];
/** Las actions de consultas y datos personales solo refrescan la ficha del cliente. */
const CLIENT_LAYOUT: RevalidateTarget[] = [{ path: CASE_ROUTE_PATTERN, type: "layout" }];

/** Enlace a la ronda dentro del panel Avance de la ficha del cliente. */
async function roundHref(ctx: Parameters<typeof disputeService.getRoundDetail>[0], roundId: string) {
  const { round } = await orNotFound(() => disputeService.getRoundDetail(ctx, roundId));
  return caseHref(round.case.client.id, round.caseId, `/rondas/${roundId}`);
}

const bureau = z.enum(["EXPERIAN", "EQUIFAX", "TRANSUNION"]);

const rondaId = cuidSchema.describe("Identificador de la ronda de disputas (se obtiene con `listar` o `ver` en la sección rondas).");
const disputaId = cuidSchema.describe("Identificador de la disputa (ítem de la ronda, se obtiene con `ver` en la sección rondas).");

const add = addDisputeItemSchema.shape;
const bulk = addDisputeItemsBulkSchema.shape;
const upd = updateDisputeItemSchema.shape;

const scopeDesc = "Alcance dentro de la ronda: OUT_OF_SCOPE (predeterminado) o IN_SCOPE.";
const methodDesc = "Vía de la disputa: MAIL (predeterminado), ONLINE, PHONE u OTHER.";
const strategyDesc =
  "Método de disputa: ACCURACY_R1, METHOD_R2, LATE_PAYMENTS, INQUIRY, PERSONAL_INFO o GENERAL (define con qué carta se disputa).";

const auditItem = (input: { disputeItemId: string }, result: unknown) => ({
  entityType: "DisputeItem",
  entityId: (result as { id?: string } | null)?.id ?? input.disputeItemId,
});
const auditRound = (_input: unknown, result: unknown) => ({
  entityType: "CreditRound",
  entityId: (result as { roundId: string }).roundId,
});

async function itemResult(
  ctx: Parameters<typeof disputeService.getRoundDetail>[0],
  item: { id: string; roundId: string; status: string },
) {
  return { id: item.id, roundId: item.roundId, status: item.status, href: await roundHref(ctx, item.roundId) };
}

const agregarDisputa = defineTool({
  name: "agregar_disputa",
  title: "Agregar disputa a una ronda",
  description:
    "Agrega una cuenta del reporte de crédito a una ronda de disputas abierta, con el motivo y la acción pedida al buró. Úsala cuando la persona quiera disputar una cuenta concreta; no sirve en rondas cerradas ni para cuentas no elegibles o ya incluidas.",
  kind: "write",
  permission: "disputes.manage",
  inputSchema: z.object({
    roundId: rondaId,
    creditItemId: add.creditItemId.describe("Identificador de la cuenta del reporte que se disputa (debe ser del mismo caso que la ronda)."),
    disputeReason: add.disputeReason.describe("Motivo de la disputa (obligatorio, máximo 200 caracteres)."),
    action: add.action.describe("Acción que se pide al buró, por ejemplo Eliminar o Verificar (obligatorio, máximo 100 caracteres)."),
    scope: add.scope.describe(scopeDesc),
    method: add.method.describe(methodDesc),
    disputeDetails: add.disputeDetails.describe("Detalle adicional de la disputa (máximo 5000 caracteres)."),
    bureau: add.bureau.describe("Buró de la disputa: EXPERIAN, EQUIFAX o TRANSUNION; si se omite se usa el de la cuenta."),
    notes: add.notes.describe("Nota interna sobre la disputa."),
    status: add.status.describe("Estado inicial; si se omite queda SELECTED."),
  }),
  async run(ctx, data) {
    const item = await orNotFound(() => disputeService.addDisputeItem(ctx, data));
    return itemResult(ctx, item);
  },
  audit: (_input, result) => ({ entityType: "DisputeItem", entityId: (result as { id: string }).id }),
  revalidate: () => DISPUTE_PATHS,
});

const agregarDisputasLote = defineTool({
  name: "agregar_disputas_lote",
  title: "Agregar varias disputas a una ronda",
  description:
    "Agrega varias cuentas (hasta 100) a una ronda abierta con el mismo motivo y acción, y opcionalmente el mismo método. Úsala cuando la persona pida disputar un grupo de cuentas con el mismo argumento; antes de agregar nada se comprueba que todas las cuentas sean válidas, así que si alguna no lo es no se agrega ninguna.",
  kind: "write",
  permission: "disputes.manage",
  inputSchema: z.object({
    roundId: rondaId,
    creditItemIds: bulk.creditItemIds.describe("Identificadores de las cuentas del reporte a disputar (de 1 a 100, del mismo caso que la ronda)."),
    disputeReason: bulk.disputeReason.describe("Motivo común de la disputa (obligatorio, máximo 200 caracteres)."),
    action: bulk.action.describe("Acción común que se pide al buró (obligatorio, máximo 100 caracteres)."),
    scope: bulk.scope.describe(scopeDesc),
    method: bulk.method.describe(methodDesc),
    disputeDetails: bulk.disputeDetails.describe("Detalle adicional común (máximo 5000 caracteres)."),
    strategy: bulk.strategy.describe(strategyDesc),
  }),
  async run(ctx, data) {
    await validateBulk(ctx, data);
    const items = await orNotFound(() => disputeService.addDisputeItemsBulk(ctx, data));
    return { count: items.length, roundId: data.roundId, href: await roundHref(ctx, data.roundId) };
  },
  audit: auditRound,
  revalidate: () => DISPUTE_PATHS,
});

const agregarDisputaConsultaOPersonal = defineTool({
  name: "agregar_disputa_consulta_o_personal",
  title: "Agregar consultas o datos personales a una ronda",
  description:
    "Agrega a una ronda abierta consultas duras del reporte y/o datos personales a corregir (nombre, dirección, empleador, teléfono), por buró. Úsala cuando la persona quiera disputar algo que no es una cuenta.",
  kind: "write",
  permission: "disputes.manage",
  inputSchema: z.object({
    roundId: rondaId,
    inquiries: z
      .array(
        z.object({
          inquiryId: cuidSchema.describe("Identificador de la consulta dura del reporte del cliente."),
          bureau: bureau.describe("Buró de la consulta: EXPERIAN, EQUIFAX o TRANSUNION (debe coincidir con la consulta)."),
          label: z.string().min(1).max(180).describe("Texto de lo disputado, por ejemplo el nombre del acreedor que consultó."),
        }),
      )
      .max(30)
      .default([])
      .describe("Consultas duras a disputar (hasta 30)."),
    personal: z
      .array(
        z.object({
          bureau: bureau.describe("Buró donde aparece el dato: EXPERIAN, EQUIFAX o TRANSUNION."),
          kind: z.enum(PERSONAL_INFO_KINDS).describe("Tipo de dato: NAME, ADDRESS, EMPLOYER, PHONE u OTHER."),
          value: z.string().trim().min(2).max(160).describe("Valor erróneo que debe corregirse o eliminarse."),
        }),
      )
      .max(30)
      .default([])
      .describe("Datos personales a corregir (hasta 30)."),
  }),
  async run(ctx, data) {
    await validateNonAccount(ctx, data);
    let added = 0;
    for (const inquiry of data.inquiries) {
      await orNotFound(() =>
        disputeService.addNonAccountDisputeItem(ctx, {
          roundId: data.roundId,
          bureau: inquiry.bureau,
          kind: "INQUIRY",
          inquiryId: inquiry.inquiryId,
          label: inquiry.label,
          disputeReason: "I did not authorize this inquiry. Please show its permissible purpose or delete it.",
        }),
      );
      added += 1;
    }
    for (const entry of data.personal) {
      await orNotFound(() =>
        disputeService.addNonAccountDisputeItem(ctx, {
          roundId: data.roundId,
          bureau: entry.bureau,
          kind: "PERSONAL_INFO",
          label: personalInfoLabel(entry.kind, entry.value),
          disputeReason: "This information is not mine or is out of date. Please remove it.",
        }),
      );
      added += 1;
    }
    return { added, roundId: data.roundId, href: await roundHref(ctx, data.roundId) };
  },
  audit: auditRound,
  revalidate: () => CLIENT_LAYOUT,
});

const editarDisputa = defineTool({
  name: "editar_disputa",
  title: "Editar disputa",
  description:
    "Cambia el motivo, la acción, el alcance, la vía, el método (estrategia), el detalle, el estado, el resultado o la nota de una disputa de una ronda. Úsala cuando la persona quiera corregir una disputa o cambiar su método antes de generar la carta.",
  kind: "write",
  permission: "disputes.manage",
  inputSchema: z.object({
    disputeItemId: disputaId,
    disputeReason: upd.disputeReason.describe("Nuevo motivo (máximo 200 caracteres)."),
    action: upd.action.describe("Nueva acción pedida al buró (máximo 100 caracteres)."),
    scope: upd.scope.describe("Nuevo alcance: OUT_OF_SCOPE o IN_SCOPE."),
    method: upd.method.describe("Nueva vía: MAIL, ONLINE, PHONE u OTHER."),
    disputeDetails: upd.disputeDetails.describe("Nuevo detalle; vacío o null lo borra."),
    status: upd.status.describe("Nuevo estado: DRAFT, SELECTED, LETTER_GENERATED, SENT, WAITING, RESPONDED, COMPLETED o CANCELLED."),
    outcome: upd.outcome.describe("Resultado: DELETED, UPDATED, VERIFIED, NO_CHANGE, NOT_RESPONDED, NEW_INFORMATION u OTHER; null lo quita."),
    notes: upd.notes.describe("Nueva nota interna; vacío o null la borra."),
    strategy: z.enum(DISPUTE_STRATEGIES).optional().describe(strategyDesc),
  }),
  async run(ctx, input) {
    const { disputeItemId, ...data } = input;
    const item = await orNotFound(() => disputeService.updateDisputeItem(ctx, disputeItemId, data));
    return itemResult(ctx, item);
  },
  audit: auditItem,
  revalidate: () => DISPUTE_PATHS,
});

const cancelarDisputa = defineTool({
  name: "cancelar_disputa",
  title: "Cancelar disputa",
  description:
    "Cancela una disputa de una ronda: queda con estado CANCELLED y la cuenta vuelve a estar libre, pero la disputa no se borra. Pide confirmación a la persona antes de ejecutarla.",
  kind: "destructive",
  permission: "disputes.manage",
  inputSchema: z.object({ disputeItemId: disputaId }),
  async run(ctx, { disputeItemId }) {
    const item = await orNotFound(() => disputeService.cancelDisputeItem(ctx, disputeItemId));
    return itemResult(ctx, item);
  },
  audit: auditItem,
  revalidate: () => DISPUTE_PATHS,
});

/** Herramientas de escritura de disputas (T2-03). */
export const disputesTools: Tool[] = [
  agregarDisputa,
  agregarDisputasLote,
  agregarDisputaConsultaOPersonal,
  editarDisputa,
  cancelarDisputa,
] as Tool[];
