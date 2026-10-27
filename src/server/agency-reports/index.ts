import { prisma } from "@/src/lib/db";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { clientFullName } from "@/src/server/page-helpers";
import {
  REPORTES_KIND_ALL,
  REPORTES_KIND_CREDIT,
  REPORTES_KIND_PROGRESS,
  REPORTES_LIMIT,
  type ReportesKind,
} from "@/src/lib/reports/agency-reportes";
import { creditAnalysisHref, legacyCaseHref } from "@/src/lib/routes/case-routes";

export type AgencyCreditReportRow = {
  kind: "credit";
  id: string;
  sortAt: Date;
  reportDate: Date;
  importedAt: Date;
  type: string;
  clientId: string;
  clientName: string;
  clientCode: string;
  caseId: string;
  caseCode: string;
  itemCount: number;
  snapshotCount: number;
  href: string;
};

export type AgencyProgressReportRow = {
  kind: "progress";
  id: string;
  sortAt: Date;
  reportDate: Date;
  clientName: string;
  caseId: string;
  caseCode: string;
  periodLabel: string;
  roundLabel: string;
  href: string;
};

export type AgencyReportRow = AgencyCreditReportRow | AgencyProgressReportRow;

export async function listAgencyReports(
  ctx: OrganizationContext,
  opts?: { kind?: ReportesKind; limit?: number },
): Promise<{ items: AgencyReportRow[]; kind: ReportesKind }> {
  const kind = opts?.kind ?? REPORTES_KIND_ALL;
  const limit = opts?.limit ?? REPORTES_LIMIT;
  const orgId = ctx.organizationId;

  const [credit, progress] = await Promise.all([
    kind === REPORTES_KIND_PROGRESS
      ? Promise.resolve([])
      : prisma.creditReport.findMany({
          where: { organizationId: orgId },
          orderBy: [{ reportDate: "desc" }, { importedAt: "desc" }],
          take: limit,
          select: {
            id: true,
            reportDate: true,
            importedAt: true,
            type: true,
            clientId: true,
            caseId: true,
            client: {
              select: {
                firstName: true,
                lastName: true,
                clientCode: true,
              },
            },
            case: { select: { caseCode: true } },
            _count: { select: { items: true, snapshots: true } },
          },
        }),
    kind === REPORTES_KIND_CREDIT
      ? Promise.resolve([])
      : prisma.clientProgressReport.findMany({
          where: { organizationId: orgId },
          orderBy: { reportDate: "desc" },
          take: limit,
          select: {
            id: true,
            reportDate: true,
            createdAt: true,
            clientName: true,
            caseId: true,
            caseCode: true,
            periodLabel: true,
            roundLabel: true,
          },
        }),
  ]);

  const creditRows: AgencyCreditReportRow[] = credit.map((r) => ({
    kind: "credit",
    id: r.id,
    sortAt: r.reportDate,
    reportDate: r.reportDate,
    importedAt: r.importedAt,
    type: r.type,
    clientId: r.clientId,
    clientName: clientFullName(r.client),
    clientCode: r.client.clientCode,
    caseId: r.caseId,
    caseCode: r.case.caseCode,
    itemCount: r._count.items,
    snapshotCount: r._count.snapshots,
    href: creditAnalysisHref(r.id),
  }));

  const progressRows: AgencyProgressReportRow[] = progress.map((r) => ({
    kind: "progress",
    id: r.id,
    sortAt: r.reportDate,
    reportDate: r.reportDate,
    clientName: r.clientName,
    caseId: r.caseId,
    caseCode: r.caseCode,
    periodLabel: r.periodLabel,
    roundLabel: r.roundLabel,
    href: legacyCaseHref(r.caseId, `/reportes/${r.id}`),
  }));

  const items = [...creditRows, ...progressRows]
    .sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime())
    .slice(0, limit);

  return { items, kind };
}
