import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { getClientOverview } from "@/src/server/clients/overview";
import * as clientService from "@/src/server/clients";
import * as taskService from "@/src/server/tasks";
import * as documentService from "@/src/server/documents";
import * as paymentService from "@/src/server/payments";
import * as notesService from "@/src/server/notes";
import { listClientIntakeLinks } from "@/src/server/intake/links";
import { isIntakeEnabled } from "@/src/server/intake";
import { listStages } from "@/src/server/config";
import { listVerticalServiceOptions } from "@/src/server/services/verticals";
import { isStorageConfigured } from "@/src/lib/storage/s3";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
import { testimonialPageData } from "@/src/server/testimonials/page-data";
import {
  clientFullName,
  firstParam,
  listMemberOptions,
  type SearchParams,
} from "@/src/server/page-helpers";
import { AgencyClientDetail } from "@/src/components/clients/agency-client-detail";
import { ClientServicesPanel } from "@/src/components/clients/client-services-panel";
import { ClientTasksPanel } from "@/src/components/clients/client-tasks-panel";
import { ClientDocumentsPanel } from "@/src/components/clients/client-documents-panel";
import { ClientPaymentsPanel } from "@/src/components/clients/client-payments-panel";
import { ClientNotesPanel } from "@/src/components/clients/client-notes-panel";
import { ClientTestimonialsPanel } from "@/src/components/clients/client-testimonials-panel";
import { ClientCreditRoundsPanel } from "@/src/components/clients/client-credit-rounds-panel";
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

  const canManageCases = can(ctx.role, "cases.manage");
  const canEdit = can(ctx.role, "clients.edit");
  const canManageTasks = can(ctx.role, "tasks.manage");
  const canUpload = can(ctx.role, "documents.upload");
  const canRegister = can(ctx.role, "payments.register");
  const canViewTestimonials = can(ctx.role, "testimonials.view");
  const intakeEnabled = isIntakeEnabled();

  const [
    latestReport,
    intakeLinks,
    members,
    stages,
    verticalServices,
    detail,
    timezone,
    tasks,
    documents,
    payments,
    notes,
    testimonials,
  ] = await Promise.all([
    activeCaseId
      ? prisma.creditReport.findFirst({
          where: {
            organizationId: ctx.organizationId,
            clientId,
            caseId: activeCaseId,
          },
          orderBy: { reportDate: "desc" },
          select: { id: true },
        })
      : Promise.resolve(null),
    intakeEnabled
      ? listClientIntakeLinks(ctx, clientId)
      : Promise.resolve([]),
    canEdit || canManageTasks || canManageCases
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
    clientService.getClientDetail(ctx, clientId).catch(() => null),
    getOrganizationTimezone(ctx.organizationId),
    taskService.listTasks(ctx, { clientId, limit: 50 }),
    documentService.listDocuments(ctx, { clientId, limit: 50 }),
    paymentService.listPayments(ctx, { clientId, limit: 50 }),
    notesService.listClientNotes(ctx, clientId, { limit: 80 }),
    canViewTestimonials
      ? testimonialPageData(ctx, clientId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const intakeUrl = intakeLinks.find((l) => l.usable)?.url ?? null;

  const currency = overview.paymentsSummary.currency || "USD";
  const asesoria =
    overview.paymentsSummary.quoteTotal != null
      ? formatMoney(overview.paymentsSummary.quoteTotal * 0.3, currency)
      : "—";

  const quoteHref = overview.paymentsSummary.payableQuote
    ? `/crm/cotizaciones/${overview.paymentsSummary.payableQuote.id}`
    : `/crm/cotizaciones/nueva?clientId=${clientId}`;

  const reportHref =
    latestReport && activeCaseId
      ? `/crm/casos/${activeCaseId}/credito/reportes/${latestReport.id}`
      : activeCaseId
        ? `/crm/casos/${activeCaseId}/credito`
        : null;
  const avanceHref = activeCaseId
    ? `/crm/casos/${activeCaseId}/rondas`
    : null;

  const isCreditRepair = overview.activeService?.kind === "CREDIT_REPAIR";
  const serviceCases = detail?.serviceCases ?? [];
  const cases = detail?.cases ?? [];
  const linkedCreditIds = new Set(
    serviceCases
      .map((sc) => sc.creditCase?.id)
      .filter((id): id is string => Boolean(id)),
  );
  const orphanCases = cases.filter((c) => !linkedCreditIds.has(c.id));
  const clientArchived = overview.client.status === "ARCHIVED";

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
      reportHref={reportHref}
      avanceHref={avanceHref}
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
      salesScript={DEFAULT_SCRIPT}
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
      activityEvents={detail?.timeline ?? []}
      opsPanels={{
        services: (
          <ClientServicesPanel
            clientId={clientId}
            clientArchived={clientArchived}
            serviceCases={serviceCases}
            orphanCases={orphanCases}
            canManage={canManageCases}
            services={verticalServices}
            members={members}
          />
        ),
        tasks: (
          <ClientTasksPanel
            clientId={clientId}
            tasks={tasks.items}
            members={members}
            canManage={canManageTasks}
            timezone={timezone}
            cases={cases.map((c) => ({ id: c.id, caseCode: c.caseCode }))}
          />
        ),
        documents: (
          <ClientDocumentsPanel
            clientId={clientId}
            documents={documents.items}
            canUpload={canUpload}
            storageReady={isStorageConfigured()}
          />
        ),
        payments: (
          <ClientPaymentsPanel
            clientId={clientId}
            payments={payments.items}
            canRegister={canRegister}
            cases={cases.map((c) => ({ id: c.id, caseCode: c.caseCode }))}
          />
        ),
        notes: (
          <ClientNotesPanel
            clientId={clientId}
            notes={notes}
            canEdit={canEdit}
          />
        ),
        testimonials: testimonials ? (
          <ClientTestimonialsPanel
            clientId={clientId}
            defaultName={overview.client.firstName}
            rows={testimonials.rows}
            cases={testimonials.cases}
            manage={can(ctx.role, "testimonials.manage")}
            publish={can(ctx.role, "testimonials.publish")}
          />
        ) : null,
        credit: (
          <ClientCreditRoundsPanel
            caseId={activeCaseId}
            reportHref={reportHref}
            avanceHref={avanceHref}
            reportsCount={overview.credit?.reportCount ?? 0}
            roundNumber={overview.credit?.round?.roundNumber ?? null}
            negativeCount={overview.credit?.itemsSummary.negative ?? 0}
          />
        ),
      }}
    />
  );
}
