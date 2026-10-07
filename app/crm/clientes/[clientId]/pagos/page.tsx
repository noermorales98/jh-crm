import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import * as paymentService from "@/src/server/payments";
import {
  clientFullName,
  firstParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import { DomainError } from "@/src/server/errors";
import { ButtonLink } from "@/src/components/ui";
import { ClientPaymentsPanel } from "@/src/components/clients/client-payments-panel";
import { AgencyClientShell } from "@/src/components/clients/agency-client-shell";

export const metadata: Metadata = {
  title: "Pagos del cliente",
};

export default async function ClientPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: SearchParams;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const caseId = firstParam(sp, "caseId");
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof clientService.getClientDetail>>;
  try {
    detail = await clientService.getClientDetail(ctx, clientId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { client, cases } = detail;
  const canRegister = can(ctx.role, "payments.register");
  const scopedCase =
    caseId && cases.some((c) => c.id === caseId)
      ? cases.find((c) => c.id === caseId)!
      : null;

  const payments = await paymentService.listPayments(ctx, {
    clientId: client.id,
    caseId: scopedCase?.id,
    limit: 50,
  });

  const nuevoHref = scopedCase
    ? `/crm/pagos/nuevo?clientId=${client.id}&caseId=${scopedCase.id}`
    : `/crm/pagos/nuevo?clientId=${client.id}`;

  return (
    <AgencyClientShell
      clientId={client.id}
      fullName={clientFullName(client)}
      status={client.status}
      title="Pagos"
      actions={
        canRegister ? (
          <ButtonLink href={nuevoHref} size="sm">
            Registrar pago
          </ButtonLink>
        ) : null
      }
    >
      <ClientPaymentsPanel
        clientId={client.id}
        payments={payments.items}
        canRegister={canRegister}
        cases={cases.map((c) => ({ id: c.id, caseCode: c.caseCode }))}
        scopedCaseId={scopedCase?.id ?? null}
        filterBasePath={`/crm/clientes/${client.id}/pagos`}
      />
    </AgencyClientShell>
  );
}
