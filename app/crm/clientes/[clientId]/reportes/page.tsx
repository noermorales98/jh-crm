import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import * as creditReports from "@/src/server/credit-reports";
import { DomainError } from "@/src/server/errors";
import { clientFullName } from "@/src/server/page-helpers";
import { AgencyClientShell } from "@/src/components/clients/agency-client-shell";
import { ClientCreditReportsPanel } from "@/src/components/clients/client-credit-reports-panel";
import { CreateCreditReportButton } from "@/src/components/credit-reports/create-report-button";
import { AnalyzePdfImportButton } from "@/src/components/credit-reports/analyze-pdf-import";

export const metadata: Metadata = {
  title: "Reportes de crédito",
};

export default async function ClientCreditReportsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const ctx = await requireOrganization();

  if (!can(ctx.role, "creditReports.view")) {
    notFound();
  }

  let detail: Awaited<ReturnType<typeof clientService.getClientDetail>>;
  try {
    detail = await clientService.getClientDetail(ctx, clientId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { client, cases } = detail;
  const canManage = can(ctx.role, "creditReports.manage");
  const manageCaseId =
    cases.find((c) => c.state === "OPEN")?.id ?? cases[0]?.id ?? null;

  const overview = await creditReports.getClientCreditOverview(ctx, client.id);

  const emptyAction =
    canManage && manageCaseId ? (
      <CreateCreditReportButton caseId={manageCaseId} />
    ) : !manageCaseId ? (
      <p className="text-sm text-text-secondary">
        Crea un servicio de Credit Repair desde{" "}
        <Link
          href={`/crm/clientes/${client.id}`}
          className="font-medium text-action-primary"
        >
          el resumen del cliente
        </Link>{" "}
        (Añadir → Servicios) para registrar reportes.
      </p>
    ) : null;

  const headerActions =
    canManage && manageCaseId ? (
      <>
        <AnalyzePdfImportButton caseId={manageCaseId} />
        <CreateCreditReportButton caseId={manageCaseId} />
      </>
    ) : null;

  return (
    <AgencyClientShell
      clientId={client.id}
      fullName={clientFullName(client)}
      status={client.status}
      title="Reportes"
      actions={headerActions}
    >
      <ClientCreditReportsPanel
        overview={overview}
        emptyAction={emptyAction}
      />
    </AgencyClientShell>
  );
}
