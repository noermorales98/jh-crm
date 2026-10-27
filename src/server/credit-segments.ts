import type { OrganizationContext } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";
import { getClientActionPlan } from "@/src/server/credit-reports/action-plan";
import type { CreditSegment } from "@/src/lib/credit/segments";

/** Reporte más viejo que esto (y cliente en proceso) → toca actualizar. */
const STALE_DAYS = 30;
/** Tope de análisis completos por llamada (solo clientes sin negativos). */
const MAX_FULL_PLANS = 60;

export type ClientCreditSegment = {
  segment: CreditSegment;
  reportId: string | null;
  reportDate: Date | null;
  negatives: number;
  /** Último reporte con más de 30 días y el cliente aún no está listo. */
  stale: boolean;
};

/**
 * Calificación por reporte (estilo Fondify): misma matriz que el Análisis de
 * Crédito. «Listo» solo si el último reporte cumple los 3 burós.
 */
export async function getClientCreditSegments(
  ctx: OrganizationContext,
  clientIds?: string[],
): Promise<Map<string, ClientCreditSegment>> {
  const clients = await prisma.client.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(clientIds ? { id: { in: clientIds } } : { status: { notIn: ["ARCHIVED", "CANCELLED"] } }),
    },
    select: { id: true, status: true },
  });
  const ids = clients.map((c) => c.id);
  const result = new Map<string, ClientCreditSegment>();
  if (ids.length === 0) return result;

  const reports = await prisma.creditReport.findMany({
    where: { organizationId: ctx.organizationId, clientId: { in: ids } },
    orderBy: [{ reportDate: "desc" }, { importedAt: "desc" }],
    distinct: ["clientId"],
    select: {
      id: true,
      clientId: true,
      reportDate: true,
      _count: { select: { items: { where: { isNegative: true } } } },
    },
  });
  const latest = new Map(reports.map((r) => [r.clientId, r]));
  const staleBefore = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  let fullPlans = 0;

  for (const client of clients) {
    const report = latest.get(client.id);
    if (!report) {
      result.set(client.id, {
        segment: "sin_datos",
        reportId: null,
        reportDate: null,
        negatives: 0,
        stale: false,
      });
      continue;
    }
    const negatives = report._count.items;
    let segment: CreditSegment = negatives > 0 ? "reparacion" : "estructuracion";
    if (negatives === 0 && fullPlans < MAX_FULL_PLANS) {
      fullPlans += 1;
      const plan = await getClientActionPlan(ctx, client.id, report.id).catch(() => null);
      if (plan && plan.bureausApproved === 3) segment = "listo";
    }
    result.set(client.id, {
      segment,
      reportId: report.id,
      reportDate: report.reportDate,
      negatives,
      stale:
        segment !== "listo" &&
        client.status !== "COMPLETED" &&
        report.reportDate.getTime() < staleBefore,
    });
  }
  return result;
}
