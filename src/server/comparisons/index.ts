import type {
  ComparisonResultKind,
  CreditBureau,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";

/**
 * Comparación de reportes de crédito (base vs actualizado).
 * autoResult es determinista; manualResult permite corrección humana.
 */

type ItemLike = {
  id: string;
  creditorName: string;
  accountNumberMasked: string | null;
  bureau: CreditBureau;
  balance: Prisma.Decimal | null;
  accountStatus: string | null;
  paymentStatus: string | null;
  remarks: string | null;
};

export function normalizeMatchPart(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9*]/g, "");
}

export function buildMatchKey(item: {
  bureau: CreditBureau;
  accountNumberMasked?: string | null;
  creditorName: string;
}): string {
  const mask = normalizeMatchPart(item.accountNumberMasked);
  const creditor = normalizeMatchPart(item.creditorName);
  if (mask) return `${item.bureau}|${mask}|${creditor}`;
  return `${item.bureau}|${creditor}`;
}

function fieldEqual(
  a: string | null | undefined | Prisma.Decimal,
  b: string | null | undefined | Prisma.Decimal,
): boolean {
  const as = a == null ? "" : String(a).trim().toLowerCase();
  const bs = b == null ? "" : String(b).trim().toLowerCase();
  return as === bs;
}

export function classifyPair(
  base: ItemLike | undefined,
  compare: ItemLike | undefined,
): ComparisonResultKind {
  if (base && !compare) return "DELETED";
  if (!base && compare) return "NEW";
  if (!base || !compare) return "UNCHANGED";

  const same =
    fieldEqual(base.creditorName, compare.creditorName) &&
    fieldEqual(base.accountNumberMasked, compare.accountNumberMasked) &&
    fieldEqual(base.balance, compare.balance) &&
    fieldEqual(base.accountStatus, compare.accountStatus) &&
    fieldEqual(base.paymentStatus, compare.paymentStatus) &&
    fieldEqual(base.remarks, compare.remarks);

  return same ? "UNCHANGED" : "UPDATED";
}

export type ComputedComparisonItem = {
  matchKey: string;
  autoResult: ComparisonResultKind;
  baseItemId: string | null;
  compareItemId: string | null;
  creditorName: string;
  bureau: CreditBureau;
  accountNumberMasked: string | null;
};

export function computeComparisonItems(
  baseItems: ItemLike[],
  compareItems: ItemLike[],
): ComputedComparisonItem[] {
  const baseMap = new Map<string, ItemLike>();
  const compareMap = new Map<string, ItemLike>();

  for (const item of baseItems) {
    baseMap.set(buildMatchKey(item), item);
  }
  for (const item of compareItems) {
    compareMap.set(buildMatchKey(item), item);
  }

  const keys = new Set([...baseMap.keys(), ...compareMap.keys()]);
  const results: ComputedComparisonItem[] = [];

  for (const key of keys) {
    const base = baseMap.get(key);
    const compare = compareMap.get(key);
    const display = compare ?? base!;
    results.push({
      matchKey: key.slice(0, 180),
      autoResult: classifyPair(base, compare),
      baseItemId: base?.id ?? null,
      compareItemId: compare?.id ?? null,
      creditorName: display.creditorName,
      bureau: display.bureau,
      accountNumberMasked: display.accountNumberMasked,
    });
  }

  return results.sort((a, b) => a.creditorName.localeCompare(b.creditorName));
}

export function effectiveResult(item: {
  autoResult: ComparisonResultKind;
  manualResult: ComparisonResultKind | null;
}): ComparisonResultKind {
  return item.manualResult ?? item.autoResult;
}

async function getReportInCase(
  ctx: OrganizationContext,
  reportId: string,
  caseId: string,
) {
  const report = await prisma.creditReport.findFirst({
    where: { id: reportId, organizationId: ctx.organizationId, caseId },
    include: {
      items: true,
      snapshots: true,
    },
  });
  if (!report) throw new DomainError("Reporte no encontrado en este caso.");
  return report;
}

export async function createComparison(
  ctx: OrganizationContext,
  data: {
    caseId: string;
    baseReportId: string;
    compareReportId: string;
    notes?: string | null;
  },
) {
  if (data.baseReportId === data.compareReportId) {
    throw new DomainError("Selecciona dos reportes distintos.");
  }

  const creditCase = await prisma.creditCase.findFirst({
    where: { id: data.caseId, organizationId: ctx.organizationId },
    select: { id: true, clientId: true },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");

  const base = await getReportInCase(ctx, data.baseReportId, creditCase.id);
  const compare = await getReportInCase(ctx, data.compareReportId, creditCase.id);

  const existing = await prisma.reportComparison.findFirst({
    where: {
      organizationId: ctx.organizationId,
      baseReportId: base.id,
      compareReportId: compare.id,
    },
  });
  if (existing) {
    return getComparison(ctx, existing.id);
  }

  const computed = computeComparisonItems(base.items, compare.items);

  return prisma.$transaction(async (tx) => {
    const comparison = await tx.reportComparison.create({
      data: {
        organizationId: ctx.organizationId,
        caseId: creditCase.id,
        baseReportId: base.id,
        compareReportId: compare.id,
        createdById: ctx.userId,
        notes: data.notes?.trim() || null,
        items: {
          create: computed.map((row) => ({
            baseItemId: row.baseItemId,
            compareItemId: row.compareItemId,
            autoResult: row.autoResult,
            matchKey: row.matchKey,
            creditorName: row.creditorName,
            bureau: row.bureau,
            accountNumberMasked: row.accountNumberMasked,
          })),
        },
      },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "COMPARISON_CREATED",
        description: "Comparación de reportes creada",
        clientId: creditCase.clientId,
        caseId: creditCase.id,
        metadata: {
          comparisonId: comparison.id,
          baseReportId: base.id,
          compareReportId: compare.id,
          itemCount: computed.length,
        },
      },
      tx,
    );

    return getComparison(ctx, comparison.id, tx);
  });
}

export async function overrideComparisonItem(
  ctx: OrganizationContext,
  itemId: string,
  data: {
    manualResult: ComparisonResultKind | null;
    notes?: string | null;
  },
) {
  const item = await prisma.reportComparisonItem.findFirst({
    where: { id: itemId },
    include: {
      comparison: {
        select: {
          id: true,
          organizationId: true,
          caseId: true,
          case: { select: { clientId: true } },
        },
      },
    },
  });
  if (!item || item.comparison.organizationId !== ctx.organizationId) {
    throw new DomainError("Resultado de comparación no encontrado.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.reportComparisonItem.update({
      where: { id: item.id },
      data: {
        manualResult: data.manualResult,
        ...(data.notes !== undefined
          ? { notes: data.notes?.trim() || null }
          : {}),
      },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "COMPARISON_UPDATED",
        description: `Corrección manual: ${item.creditorName}`,
        clientId: item.comparison.case.clientId,
        caseId: item.comparison.caseId,
        metadata: {
          comparisonId: item.comparison.id,
          itemId: item.id,
          manualResult: data.manualResult,
        },
      },
      tx,
    );
  });

  return getComparison(ctx, item.comparison.id);
}

export async function getComparison(
  ctx: OrganizationContext,
  comparisonId: string,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? prisma;
  const comparison = await client.reportComparison.findFirst({
    where: { id: comparisonId, organizationId: ctx.organizationId },
    include: {
      baseReport: {
        include: { snapshots: { orderBy: { bureau: "asc" } } },
      },
      compareReport: {
        include: { snapshots: { orderBy: { bureau: "asc" } } },
      },
      items: { orderBy: { creditorName: "asc" } },
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
  if (!comparison) throw new DomainError("Comparación no encontrada.");

  const summary = {
    deleted: 0,
    updated: 0,
    verified: 0,
    unchanged: 0,
    new: 0,
  };

  const itemsWithEffective = comparison.items.map((row) => {
    const result = effectiveResult(row);
    switch (result) {
      case "DELETED":
        summary.deleted += 1;
        break;
      case "UPDATED":
        summary.updated += 1;
        break;
      case "VERIFIED":
        summary.verified += 1;
        break;
      case "UNCHANGED":
        summary.unchanged += 1;
        break;
      case "NEW":
        summary.new += 1;
        break;
    }
    return { ...row, effectiveResult: result };
  });

  const bureaus: CreditBureau[] = ["EXPERIAN", "EQUIFAX", "TRANSUNION"];
  const scoreDeltas = bureaus.map((bureau) => {
    const baseScore =
      comparison.baseReport.snapshots.find((s) => s.bureau === bureau)?.score ??
      null;
    const compareScore =
      comparison.compareReport.snapshots.find((s) => s.bureau === bureau)
        ?.score ?? null;
    return {
      bureau,
      baseScore,
      compareScore,
      delta:
        baseScore != null && compareScore != null
          ? compareScore - baseScore
          : null,
    };
  });

  return {
    ...comparison,
    items: itemsWithEffective,
    summary,
    scoreDeltas,
  };
}

export async function listComparisonsForCase(
  ctx: OrganizationContext,
  caseId: string,
) {
  return prisma.reportComparison.findMany({
    where: { organizationId: ctx.organizationId, caseId },
    orderBy: { createdAt: "desc" },
    include: {
      baseReport: { select: { id: true, reportDate: true, type: true } },
      compareReport: { select: { id: true, reportDate: true, type: true } },
      _count: { select: { items: true } },
    },
  });
}
