import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { firstParam, type SearchParams } from "@/src/server/page-helpers";
import { selectClientActionPlanReport } from "@/src/server/credit-reports/action-plan";
import { creditAnalysisHref } from "@/src/lib/routes/case-routes";

export const metadata: Metadata = {
  title: "Plan de Acción",
};

/** Compat: el Plan de Acción vive en /crm/reportes/:reportId. */
export default async function ClientActionPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: SearchParams;
}) {
  const { clientId } = await params;
  const reportId = firstParam(await searchParams, "reportId");
  const ctx = await requireOrganization();
  if (!can(ctx.role, "creditReports.view")) notFound();

  const target = reportId ?? (await selectClientActionPlanReport(ctx, clientId)).reportId;
  if (target) redirect(creditAnalysisHref(target));

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 py-10 text-center">
      <p className="text-[16px] font-semibold text-ink">Sin plan disponible</p>
      <p className="text-[13px] text-text-secondary">
        Este cliente todavía no tiene reportes de crédito.
      </p>
      <Link
        href={`/crm/clientes/${clientId}/reportes`}
        className="inline-flex text-sm font-medium text-action-primary"
      >
        Subir un reporte →
      </Link>
    </div>
  );
}
