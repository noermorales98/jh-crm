import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { getClientOverview } from "@/src/server/clients/overview";
import { listClientIntakeLinks } from "@/src/server/intake/links";
import { isIntakeEnabled } from "@/src/server/intake";
import { listStages } from "@/src/server/config";
import { listVerticalServiceOptions } from "@/src/server/services/verticals";
import { isStorageConfigured } from "@/src/lib/storage/s3";
import {
  clientFullName,
  firstParam,
  listMemberOptions,
  type SearchParams,
} from "@/src/server/page-helpers";
import { AgencyClientDetail } from "@/src/components/clients/agency-client-detail";
import { formatMoney } from "@/src/lib/format";
import * as creditReports from "@/src/server/credit-reports";
import * as catalog from "@/src/server/services";
import * as configService from "@/src/server/config";
import * as contractsService from "@/src/server/contracts";
import { prisma } from "@/src/lib/db";

export const metadata: Metadata = {
  title: "Cliente",
};

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

  const canManageCases = can(ctx.role, "cases.manage");
  const canEdit = can(ctx.role, "clients.edit");
  const canManageTasks = can(ctx.role, "tasks.manage");
  const canUpload = can(ctx.role, "documents.upload");
  const canRegister = can(ctx.role, "payments.register");
  const canViewTestimonials = can(ctx.role, "testimonials.view");
  const intakeEnabled = isIntakeEnabled();
  const needsQuickAddMeta =
    canEdit || canManageTasks || canManageCases;

  const canViewCredit = can(ctx.role, "creditReports.view");

  const canViewQuotes = can(ctx.role, "quotes.view");
  const canManageQuotes = can(ctx.role, "quotes.manage");
  const canViewContracts = can(ctx.role, "contracts.view");
  const canManageContracts = can(ctx.role, "contracts.manage");

  const [
    intakeLinks,
    members,
    stages,
    verticalServices,
    pdfReports,
    org,
    latestQuote,
    latestContract,
    quoteServices,
    quotePackages,
    quoteSettings,
    contractTemplates,
  ] = await Promise.all([
    intakeEnabled
      ? listClientIntakeLinks(ctx, clientId)
      : Promise.resolve([]),
    needsQuickAddMeta
      ? listMemberOptions(ctx)
      : Promise.resolve([] as Awaited<ReturnType<typeof listMemberOptions>>),
    canManageCases
      ? listStages(ctx, false)
      : Promise.resolve([] as Awaited<ReturnType<typeof listStages>>),
    canManageCases
      ? listVerticalServiceOptions(ctx.organizationId)
      : Promise.resolve(
          [] as Awaited<ReturnType<typeof listVerticalServiceOptions>>,
        ),
    canViewCredit
      ? creditReports.listClientCreditReportPdfs(ctx, clientId)
      : Promise.resolve([]),
    prisma.organization.findFirst({
      where: { id: ctx.organizationId },
      select: { name: true },
    }),
    canViewQuotes
      ? prisma.quote.findFirst({
          where: { organizationId: ctx.organizationId, clientId },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select: { id: true, status: true },
        })
      : Promise.resolve(null),
    canViewContracts
      ? prisma.clientContract.findFirst({
          where: { organizationId: ctx.organizationId, clientId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, status: true },
        })
      : Promise.resolve(null),
    canManageQuotes
      ? catalog.listServices(ctx)
      : Promise.resolve([]),
    canManageQuotes
      ? catalog.listPackages(ctx)
      : Promise.resolve([]),
    canManageQuotes
      ? configService.getSettings(ctx)
      : Promise.resolve(null),
    canManageContracts
      ? contractsService.listTemplates(ctx, true)
      : Promise.resolve([]),
  ]);

  const intakeUrl = intakeLinks.find((l) => l.usable)?.url ?? null;
  const intakeUsed = intakeLinks.some((l) => l.useCount > 0);

  function quoteStatusLabel(
    status: string | undefined,
  ): string {
    if (!status) return "Sin enviar";
    switch (status) {
      case "DRAFT":
        return "Sin enviar";
      case "SENT":
        return "Enviada";
      case "ACCEPTED":
        return "Aceptada";
      case "PAID":
      case "PARTIAL":
        return "Pagada";
      case "REJECTED":
        return "Rechazada";
      case "CANCELLED":
      case "EXPIRED":
        return "Cerrada";
      default:
        return status;
    }
  }

  function contractStatusLabel(status: string | undefined): string {
    if (!status) return "Borrador";
    switch (status) {
      case "DRAFT":
        return "Borrador";
      case "SENT":
        return "Enviado";
      case "SIGNED":
        return "Firmado";
      case "CANCELLED":
      case "EXPIRED":
        return "Cerrado";
      default:
        return status;
    }
  }

  const intakeStatusLabel = !intakeEnabled
    ? "Desactivado"
    : !intakeUrl && !intakeUsed
      ? "Sin enlace"
      : intakeUsed
        ? "Completado"
        : "Sin llenar";

  const currency = overview.paymentsSummary.currency || "USD";
  const asesoria =
    overview.paymentsSummary.quoteTotal != null
      ? formatMoney(overview.paymentsSummary.quoteTotal * 0.3, currency)
      : "—";

  const quoteHref = overview.paymentsSummary.payableQuote
    ? `/crm/cotizaciones/${overview.paymentsSummary.payableQuote.id}`
    : `/crm/cotizaciones/nueva?clientId=${clientId}`;

  const reportHref = `/crm/clientes/${clientId}/reportes`;
  const panelParam = firstParam(sp, "panel");
  const roundIdParam = firstParam(sp, "roundId");
  const openAvance = panelParam === "avance";

  const isCreditRepair = overview.activeService?.kind === "CREDIT_REPAIR";
  const caseState = overview.activeService?.state ?? null;
  const canCreateRound =
    can(ctx.role, "rounds.manage") &&
    Boolean(activeCaseId) &&
    caseState === "OPEN";

  const activityPreview = overview.latestActivities.map((a) => ({
    id: a.id,
    type: a.type,
    description: a.description,
    createdAt: a.createdAt,
  }));

  return (
    <AgencyClientDetail
      client={{
        id: overview.client.id,
        firstName: overview.client.firstName,
        lastName: overview.client.lastName,
        email: overview.client.email,
        phone: overview.client.phone,
        source: overview.client.source,
        addressLine1: overview.client.addressLine1,
        addressLine2: overview.client.addressLine2,
        city: overview.client.city,
        state: overview.client.state,
        postalCode: overview.client.postalCode,
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
      caseState={caseState}
      documentsCount={overview.documentsSummary.count}
      kpis={{
        porArreglar: overview.credit?.itemsSummary.negative ?? 0,
        fondeoPotencial: "—",
        asesoriaHoy: asesoria,
      }}
      quoteHref={quoteHref}
      contractHref={`/crm/contratos?clientId=${clientId}`}
      reportHref={reportHref}
      openAvance={openAvance}
      initialAvanceRoundId={roundIdParam}
      intakeUrl={intakeUrl}
      intakeEnabled={intakeEnabled}
      intakeCases={overview.services
        .filter((s) => s.creditCaseId != null)
        .map((s) => ({
          id: s.creditCaseId!,
          caseCode: s.caseCode,
        }))}
      intakeLinks={intakeLinks}
      canEdit={canEdit}
      canIntake={canEdit || canManageCases}
      canCreateRound={canCreateRound}
      creditWorkspace={
        overview.credit
          ? {
              canView: overview.credit.canView,
              bureaus: overview.credit.bureaus,
              scoreHistory: overview.credit.scoreHistory,
              hasChartData: overview.credit.hasChartData,
              rounds: overview.credit.roundsSummary,
            }
          : null
      }
      quickAdd={{
        members,
        stages: stages.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
        })),
        services: verticalServices,
        canDocument: canUpload,
        canPayment: canRegister,
        canReport:
          can(ctx.role, "creditReports.manage") &&
          (isCreditRepair || activeCaseId != null),
        canRound:
          can(ctx.role, "rounds.manage") &&
          (isCreditRepair || activeCaseId != null),
        canService: canManageCases,
      }}
      activityEvents={activityPreview}
      activityHasMore={overview.latestActivities.length >= 10}
      opsMeta={{
        showTestimonials: canViewTestimonials,
        storageReady: isStorageConfigured(),
        negativeCount: overview.credit?.itemsSummary.negative ?? 0,
      }}
      pdfReports={pdfReports.map((r) => ({
        id: r.id,
        caseId: r.caseId,
        reportDate: r.reportDate.toISOString(),
        type: r.type,
        documentId: r.documentId,
        fileName: r.fileName,
      }))}
      organizationName={org?.name ?? "Agencia"}
      cierre={{
        quote: {
          label: quoteStatusLabel(latestQuote?.status),
          id: latestQuote?.id ?? null,
          href: latestQuote
            ? `/crm/cotizaciones/${latestQuote.id}`
            : quoteHref,
        },
        contract: {
          label: contractStatusLabel(latestContract?.status),
          id: latestContract?.id ?? null,
          status: latestContract?.status ?? null,
          href: `/crm/contratos?clientId=${clientId}`,
        },
        intake: {
          label: intakeStatusLabel,
        },
      }}
      quoteHub={
        canManageQuotes && quoteSettings
          ? {
              services: quoteServices.map((s) => ({
                id: s.id,
                name: s.name,
                defaultPrice: Number(s.defaultPrice.toString()),
              })),
              packages: quotePackages.map((p) => ({
                id: p.id,
                name: p.name,
                defaultPrice: Number(p.defaultPrice.toString()),
              })),
              defaultTaxRate: quoteSettings.defaultTaxRate.toString(),
              defaultTerms: quoteSettings.defaultTerms ?? "",
            }
          : null
      }
      contractHub={{
        canManage: canManageContracts,
        templates: contractTemplates
          .filter((t) => t.active)
          .map((t) => ({
            id: t.id,
            name: t.name,
            version: t.version,
          })),
      }}
    />
  );
}
