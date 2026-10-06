import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { getClientOverview } from "@/src/server/clients/overview";
import { listClientIntakeLinks } from "@/src/server/intake/links";
import { isIntakeEnabled } from "@/src/server/intake";
import { clientFullName, firstParam, type SearchParams } from "@/src/server/page-helpers";
import { AgencyClientDetail } from "@/src/components/clients/agency-client-detail";
import { prisma } from "@/src/lib/db";
import { formatMoney } from "@/src/lib/format";

export const metadata: Metadata = {
  title: "Cliente",
};

const DEFAULT_SCRIPT = `Hola, revisé tu expediente de crédito.

Hoy veo oportunidades claras de reparación y un camino para mejorar score y acceso a fondeo.

Te envío la cotización y el siguiente paso del plan. ¿Agendamos 15 minutos para repasarlo juntos?`;

export default async function ClientSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: SearchParams;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const caseIdParam = firstParam(sp, "caseId");

  const ctx = await requireOrganization();
  let overview;
  try {
    overview = await getClientOverview(ctx, clientId, {
      caseId: caseIdParam,
    });
  } catch {
    notFound();
  }

  const activeCaseId =
    overview.activeService?.creditCaseId ??
    overview.services.find((s) => s.creditCaseId)?.creditCaseId ??
    null;

  const latestReport = activeCaseId
    ? await prisma.creditReport.findFirst({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          caseId: activeCaseId,
        },
        orderBy: { reportDate: "desc" },
        select: { id: true },
      })
    : null;

  const intakeLinks = isIntakeEnabled()
    ? await listClientIntakeLinks(ctx, clientId)
    : [];
  const intakeUrl = intakeLinks.find((l) => l.usable)?.url ?? null;

  const currency = overview.paymentsSummary.currency || "USD";
  const asesoria =
    overview.paymentsSummary.quoteTotal != null
      ? formatMoney(overview.paymentsSummary.quoteTotal * 0.3, currency)
      : "—";

  const quoteHref = overview.paymentsSummary.payableQuote
    ? `/crm/cotizaciones/${overview.paymentsSummary.payableQuote.id}`
    : `/crm/cotizaciones/nueva?clientId=${clientId}`;

  return (
    <AgencyClientDetail
      client={{
        id: overview.client.id,
        firstName: overview.client.firstName,
        lastName: overview.client.lastName,
        email: overview.client.email,
        status: overview.client.status as
          | "LEAD"
          | "ACTIVE"
          | "PAUSED"
          | "COMPLETED"
          | "CANCELLED"
          | "ARCHIVED",
      }}
      fullName={clientFullName(overview.client)}
      reportsCount={overview.credit?.reportCount ?? 0}
      roundNumber={overview.credit?.round?.roundNumber ?? null}
      nextReviewAt={
        overview.nextAction?.at ??
        overview.credit?.round?.expectedReviewAt ??
        null
      }
      caseId={activeCaseId}
      documentsCount={overview.documentsSummary.count}
      kpis={{
        porArreglar: overview.credit?.itemsSummary.negative ?? 0,
        fondeoPotencial: "—",
        asesoriaHoy: asesoria,
      }}
      quoteHref={quoteHref}
      contractHref={`/crm/contratos?clientId=${clientId}`}
      reportHref={
        latestReport && activeCaseId
          ? `/crm/casos/${activeCaseId}/credito/reportes/${latestReport.id}`
          : activeCaseId
            ? `/crm/casos/${activeCaseId}/credito`
            : null
      }
      avanceHref={
        activeCaseId ? `/crm/casos/${activeCaseId}/rondas` : null
      }
      intakeUrl={intakeUrl}
      canEdit={can(ctx.role, "clients.edit")}
      salesScript={DEFAULT_SCRIPT}
    />
  );
}
