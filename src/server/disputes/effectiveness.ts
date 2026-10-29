import type { CreditBureau } from "@prisma/client";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";
import { isDisputeStrategy, type DisputeStrategy } from "@/src/lib/disputes/strategies";

export type EffectivenessCell = {
  /** Disputas con resultado anotado (las pendientes no cuentan). */
  resolved: number;
  deleted: number;
  updated: number;
  verified: number;
};

export type Effectiveness = {
  total: EffectivenessCell;
  rows: {
    strategy: DisputeStrategy;
    total: EffectivenessCell;
    byBureau: Record<CreditBureau, EffectivenessCell>;
  }[];
};

const empty = (): EffectivenessCell => ({ resolved: 0, deleted: 0, updated: 0, verified: 0 });

/**
 * Qué funciona: de las disputas con resultado anotado, cuántas se borraron,
 * corrigieron o el buró «verificó», por método y buró. Es conteo real de la
 * agencia (no una promesa): se llena al marcar el resultado en cada ronda.
 */
export async function getDisputeEffectiveness(ctx: OrganizationContext): Promise<Effectiveness> {
  const groups = await prisma.disputeItem.groupBy({
    by: ["strategy", "bureau", "outcome"],
    where: { organizationId: ctx.organizationId, outcome: { not: null }, status: { not: "CANCELLED" } },
    _count: { _all: true },
  });
  const rows = new Map<DisputeStrategy, Effectiveness["rows"][number]>();
  const total = empty();
  for (const group of groups) {
    const strategy: DisputeStrategy = isDisputeStrategy(group.strategy) ? group.strategy : "GENERAL";
    const row =
      rows.get(strategy) ??
      { strategy, total: empty(), byBureau: { EQUIFAX: empty(), EXPERIAN: empty(), TRANSUNION: empty() } };
    const n = group._count._all;
    for (const cell of [row.total, row.byBureau[group.bureau], total]) {
      cell.resolved += n;
      if (group.outcome === "DELETED") cell.deleted += n;
      if (group.outcome === "UPDATED") cell.updated += n;
      if (group.outcome === "VERIFIED") cell.verified += n;
    }
    rows.set(strategy, row);
  }
  return { total, rows: [...rows.values()].sort((a, b) => b.total.resolved - a.total.resolved) };
}
