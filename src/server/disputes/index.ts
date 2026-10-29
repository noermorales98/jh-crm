import type {
  DisputeItemStatus,
  DisputeOutcome,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/src/lib/db";
import {
  DEFAULT_DISPUTE_METHOD,
  DEFAULT_DISPUTE_SCOPE,
  type DisputeMethod,
  type DisputeScope,
} from "@/src/lib/validation/disputes";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";
import {
  STRATEGY_INFO,
  type DisputeStrategy,
} from "@/src/lib/disputes/strategies";

/** Nombre de lo disputado: el acreedor, o el texto de la consulta/dato personal. */
export function disputeTargetName(item: {
  creditItem?: { creditorName: string } | null;
  targetLabel?: string | null;
}): string {
  return item.creditItem?.creditorName ?? item.targetLabel ?? "Elemento disputado";
}

/**
 * Elementos disputados por ronda. Sincroniza CreditRound.disputedItemsCount
 * con el conteo de DisputeItem no CANCELLED.
 */

function emptyToNull(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

async function syncDisputedItemsCount(
  tx: Prisma.TransactionClient,
  roundId: string,
) {
  const count = await tx.disputeItem.count({
    where: { roundId, status: { not: "CANCELLED" } },
  });
  await tx.creditRound.update({
    where: { id: roundId },
    data: { disputedItemsCount: count },
  });
  return count;
}

async function getRoundOrThrow(ctx: OrganizationContext, roundId: string) {
  const round = await prisma.creditRound.findFirst({
    where: { id: roundId, organizationId: ctx.organizationId },
    include: {
      case: { select: { id: true, clientId: true, caseCode: true, state: true } },
    },
  });
  if (!round) throw new DomainError("Ronda no encontrada.");
  return round;
}

export interface AddDisputeItemData {
  roundId: string;
  creditItemId: string;
  disputeReason: string;
  action: string;
  scope?: DisputeScope;
  method?: DisputeMethod;
  disputeDetails?: string | null;
  bureau?: "EXPERIAN" | "EQUIFAX" | "TRANSUNION";
  notes?: string | null;
  status?: DisputeItemStatus;
  strategy?: DisputeStrategy | null;
}

export async function addDisputeItem(ctx: OrganizationContext, data: AddDisputeItemData) {
  const round = await getRoundOrThrow(ctx, data.roundId);
  if (round.status === "CANCELLED" || round.status === "COMPLETED") {
    throw new DomainError("No se pueden añadir elementos a una ronda cerrada.");
  }
  const action = data.action.trim();
  if (!action || action.length > 100) {
    throw new DomainError("Indica la acción (máximo 100 caracteres).");
  }
  const scope = data.scope ?? DEFAULT_DISPUTE_SCOPE;
  const method = data.method ?? DEFAULT_DISPUTE_METHOD;

  const creditItem = await prisma.creditItem.findFirst({
    where: {
      id: data.creditItemId,
      organizationId: ctx.organizationId,
      caseId: round.caseId,
    },
  });
  if (!creditItem) throw new DomainError("Elemento de crédito no encontrado en este caso.");
  if (!creditItem.disputeEligible) {
    throw new DomainError("Este elemento no es elegible para disputa.");
  }

  const existing = await prisma.disputeItem.findFirst({
    where: { roundId: round.id, creditItemId: creditItem.id },
  });
  if (existing && existing.status !== "CANCELLED") {
    throw new DomainError("Este elemento ya está en la ronda.");
  }

  return prisma.$transaction(async (tx) => {
    let item;
    if (existing) {
      item = await tx.disputeItem.update({
        where: { id: existing.id },
        data: {
          bureau: data.bureau ?? creditItem.bureau,
          disputeReason: data.disputeReason.trim(),
          action,
          scope,
          method,
          disputeDetails: emptyToNull(data.disputeDetails),
          status: data.status ?? "SELECTED",
          outcome: null,
          notes: emptyToNull(data.notes),
          strategy: data.strategy ?? null,
        },
      });
    } else {
      item = await tx.disputeItem.create({
        data: {
          organizationId: ctx.organizationId,
          roundId: round.id,
          creditItemId: creditItem.id,
          bureau: data.bureau ?? creditItem.bureau,
          disputeReason: data.disputeReason.trim(),
          action,
          scope,
          method,
          disputeDetails: emptyToNull(data.disputeDetails),
          status: data.status ?? "SELECTED",
          notes: emptyToNull(data.notes),
          strategy: data.strategy ?? null,
        },
      });
    }

    await tx.creditItem.update({
      where: { id: creditItem.id },
      data: { lifecycleStatus: "SELECTED" },
    });

    await syncDisputedItemsCount(tx, round.id);

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "DISPUTE_ITEM_ADDED",
        description: `Elemento disputado: ${creditItem.creditorName}`,
        clientId: round.case.clientId,
        caseId: round.caseId,
        roundId: round.id,
        metadata: { disputeItemId: item.id, creditItemId: creditItem.id },
      },
      tx,
    );

    return item;
  });
}

export async function addDisputeItemsBulk(
  ctx: OrganizationContext,
  data: {
    roundId: string;
    creditItemIds: string[];
    disputeReason: string;
    action: string;
    scope?: DisputeScope;
    method?: DisputeMethod;
    disputeDetails?: string | null;
    strategy?: DisputeStrategy | null;
  },
) {
  const created = [];
  for (const creditItemId of data.creditItemIds) {
    created.push(
      await addDisputeItem(ctx, {
        roundId: data.roundId,
        creditItemId,
        disputeReason: data.disputeReason,
        action: data.action,
        scope: data.scope,
        method: data.method,
        disputeDetails: data.disputeDetails,
        strategy: data.strategy,
      }),
    );
  }
  return created;
}

/**
 * Disputa algo que no es una cuenta: una consulta dura del reporte o un dato
 * personal (nombre, dirección, empleador). Va por buró, como las cuentas.
 */
export async function addNonAccountDisputeItem(
  ctx: OrganizationContext,
  data: {
    roundId: string;
    bureau: "EXPERIAN" | "EQUIFAX" | "TRANSUNION";
    kind: "INQUIRY" | "PERSONAL_INFO";
    inquiryId?: string | null;
    label: string;
    disputeReason: string;
  },
) {
  const round = await getRoundOrThrow(ctx, data.roundId);
  if (round.status === "CANCELLED" || round.status === "COMPLETED") {
    throw new DomainError("No se pueden añadir elementos a una ronda cerrada.");
  }
  const label = data.label.trim().slice(0, 180);
  if (!label) throw new DomainError("Indica qué se disputa.");
  let inquiryId: string | null = null;
  if (data.kind === "INQUIRY") {
    const inquiry = await prisma.creditInquiry.findFirst({
      where: { id: data.inquiryId ?? "", organizationId: ctx.organizationId, clientId: round.case.clientId },
      select: { id: true, bureau: true },
    });
    if (!inquiry) throw new DomainError("Consulta no encontrada en el reporte del cliente.");
    if (inquiry.bureau !== data.bureau) throw new DomainError("La consulta es de otro buró.");
    const taken = await prisma.disputeItem.findFirst({
      where: { roundId: round.id, inquiryId: inquiry.id, status: { not: "CANCELLED" } },
      select: { id: true },
    });
    if (taken) throw new DomainError("Esta consulta ya está en la ronda.");
    inquiryId = inquiry.id;
  }
  const strategy: DisputeStrategy = data.kind === "INQUIRY" ? "INQUIRY" : "PERSONAL_INFO";
  return prisma.$transaction(async (tx) => {
    const item = await tx.disputeItem.create({
      data: {
        organizationId: ctx.organizationId,
        roundId: round.id,
        targetKind: data.kind,
        inquiryId,
        targetLabel: label,
        strategy,
        bureau: data.bureau,
        disputeReason: data.disputeReason.trim().slice(0, 200) || STRATEGY_INFO[strategy].label,
        action: data.kind === "INQUIRY" ? "Eliminar consulta" : "Eliminar dato personal",
        scope: DEFAULT_DISPUTE_SCOPE,
        method: DEFAULT_DISPUTE_METHOD,
        status: "SELECTED",
      },
    });
    await syncDisputedItemsCount(tx, round.id);
    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "DISPUTE_ITEM_ADDED",
        description: `Elemento disputado: ${label}`,
        clientId: round.case.clientId,
        caseId: round.caseId,
        roundId: round.id,
        metadata: { disputeItemId: item.id, kind: data.kind },
      },
      tx,
    );
    return item;
  });
}

export interface UpdateDisputeItemData {
  disputeReason?: string;
  action?: string;
  scope?: DisputeScope;
  method?: DisputeMethod;
  disputeDetails?: string | null;
  status?: DisputeItemStatus;
  outcome?: DisputeOutcome | null;
  notes?: string | null;
  strategy?: DisputeStrategy | null;
}

export async function updateDisputeItem(
  ctx: OrganizationContext,
  disputeItemId: string,
  data: UpdateDisputeItemData,
) {
  const item = await prisma.disputeItem.findFirst({
    where: { id: disputeItemId, organizationId: ctx.organizationId },
    include: {
      round: {
        select: {
          id: true,
          caseId: true,
          case: { select: { clientId: true } },
        },
      },
      creditItem: { select: { id: true, creditorName: true } },
    },
  });
  if (!item) throw new DomainError("Elemento de disputa no encontrado.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.disputeItem.update({
      where: { id: item.id },
      data: {
        ...(data.disputeReason !== undefined
          ? { disputeReason: data.disputeReason.trim() }
          : {}),
        ...(data.action !== undefined ? { action: data.action.trim() } : {}),
        ...(data.scope !== undefined ? { scope: data.scope } : {}),
        ...(data.method !== undefined ? { method: data.method } : {}),
        ...(data.disputeDetails !== undefined
          ? { disputeDetails: emptyToNull(data.disputeDetails) }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.outcome !== undefined ? { outcome: data.outcome } : {}),
        ...(data.notes !== undefined ? { notes: emptyToNull(data.notes) } : {}),
        ...(data.strategy !== undefined ? { strategy: data.strategy } : {}),
      },
    });

    const nextStatus = data.status ?? updated.status;
    const nextOutcome = data.outcome !== undefined ? data.outcome : updated.outcome;

    const creditItemId = item.creditItemId;
    if (!creditItemId) {
      // Consultas e información personal no tienen ciclo de vida de cuenta.
    } else if (nextStatus === "CANCELLED") {
      await tx.creditItem.update({
        where: { id: creditItemId },
        data: { lifecycleStatus: "IDENTIFIED" },
      });
    } else if (
      nextOutcome === "DELETED" ||
      nextOutcome === "UPDATED" ||
      nextOutcome === "VERIFIED"
    ) {
      await tx.creditItem.update({
        where: { id: creditItemId },
        data: { lifecycleStatus: "RESOLVED" },
      });
    } else if (
      nextStatus === "SENT" ||
      nextStatus === "WAITING" ||
      nextStatus === "RESPONDED"
    ) {
      await tx.creditItem.update({
        where: { id: creditItemId },
        data: { lifecycleStatus: "DISPUTED" },
      });
    }

    await syncDisputedItemsCount(tx, item.roundId);

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "DISPUTE_ITEM_UPDATED",
        description: `Disputa actualizada: ${disputeTargetName(item)}`,
        clientId: item.round.case.clientId,
        caseId: item.round.caseId,
        roundId: item.roundId,
        metadata: {
          disputeItemId: item.id,
          status: updated.status,
          outcome: updated.outcome,
        },
      },
      tx,
    );

    return updated;
  });
}

export async function cancelDisputeItem(ctx: OrganizationContext, disputeItemId: string) {
  return updateDisputeItem(ctx, disputeItemId, { status: "CANCELLED", outcome: null });
}

export type RoundDisputeSummary = {
  roundId: string;
  roundNumber: number;
  status: string;
  total: number;
  byOutcome: {
    deleted: number;
    updated: number;
    verified: number;
    noChange: number;
    notResponded: number;
    newInformation: number;
    other: number;
    pending: number;
  };
  items: Array<{
    id: string;
    status: DisputeItemStatus;
    outcome: DisputeOutcome | null;
    disputeReason: string;
    action: string | null;
    scope: string | null;
    method: string | null;
    disputeDetails: string | null;
    notes: string | null;
    bureau: string;
    targetKind: "ACCOUNT" | "INQUIRY" | "PERSONAL_INFO";
    targetLabel: string | null;
    strategy: string | null;
    creditItem: {
      id: string;
      creditorName: string;
      accountNumberMasked: string | null;
      balance: Prisma.Decimal | null;
      isNegative: boolean;
    } | null;
  }>;
};

export async function getRoundDisputeSummary(
  ctx: OrganizationContext,
  roundId: string,
): Promise<RoundDisputeSummary> {
  const round = await getRoundOrThrow(ctx, roundId);
  const items = await prisma.disputeItem.findMany({
    where: {
      organizationId: ctx.organizationId,
      roundId: round.id,
      status: { not: "CANCELLED" },
    },
    include: {
      creditItem: {
        select: {
          id: true,
          creditorName: true,
          accountNumberMasked: true,
          balance: true,
          isNegative: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const byOutcome = {
    deleted: 0,
    updated: 0,
    verified: 0,
    noChange: 0,
    notResponded: 0,
    newInformation: 0,
    other: 0,
    pending: 0,
  };

  for (const item of items) {
    switch (item.outcome) {
      case "DELETED":
        byOutcome.deleted += 1;
        break;
      case "UPDATED":
        byOutcome.updated += 1;
        break;
      case "VERIFIED":
        byOutcome.verified += 1;
        break;
      case "NO_CHANGE":
        byOutcome.noChange += 1;
        break;
      case "NOT_RESPONDED":
        byOutcome.notResponded += 1;
        break;
      case "NEW_INFORMATION":
        byOutcome.newInformation += 1;
        break;
      case "OTHER":
        byOutcome.other += 1;
        break;
      default:
        byOutcome.pending += 1;
    }
  }

  return {
    roundId: round.id,
    roundNumber: round.roundNumber,
    status: round.status,
    total: items.length,
    byOutcome,
    items,
  };
}

export async function listEligibleCreditItems(
  ctx: OrganizationContext,
  roundId: string,
) {
  const round = await getRoundOrThrow(ctx, roundId);
  const already = await prisma.disputeItem.findMany({
    where: {
      roundId: round.id,
      status: { not: "CANCELLED" },
    },
    select: { creditItemId: true },
  });
  const taken = new Set(already.map((d) => d.creditItemId));

  const latestReport = await prisma.creditReport.findFirst({
    where: { organizationId: ctx.organizationId, caseId: round.caseId },
    orderBy: [{ reportDate: "desc" }, { importedAt: "desc" }],
    select: { id: true },
  });

  const items = await prisma.creditItem.findMany({
    where: {
      organizationId: ctx.organizationId,
      caseId: round.caseId,
      disputeEligible: true,
      ...(latestReport ? { reportId: latestReport.id } : {}),
    },
    orderBy: [{ isNegative: "desc" }, { creditorName: "asc" }],
  });

  return items.filter((i) => !taken.has(i.id));
}

export async function getRoundDetail(ctx: OrganizationContext, roundId: string) {
  const round = await prisma.creditRound.findFirst({
    where: { id: roundId, organizationId: ctx.organizationId },
    include: {
      case: {
        select: {
          id: true,
          caseCode: true,
          state: true,
          client: {
            select: { id: true, clientCode: true, firstName: true, lastName: true },
          },
        },
      },
    },
  });
  if (!round) throw new DomainError("Ronda no encontrada.");
  const summary = await getRoundDisputeSummary(ctx, roundId);
  return { round, summary };
}
