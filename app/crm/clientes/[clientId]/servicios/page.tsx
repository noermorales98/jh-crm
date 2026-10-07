import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import { listVerticalServiceOptions } from "@/src/server/services/verticals";
import {
  clientFullName,
  listMemberOptions,
} from "@/src/server/page-helpers";
import { DomainError } from "@/src/server/errors";
import { CreateCaseButton } from "@/src/components/cases/create-case-button";
import { ClientServicesPanel } from "@/src/components/clients/client-services-panel";
import { AgencyClientShell } from "@/src/components/clients/agency-client-shell";

export const metadata: Metadata = {
  title: "Servicios del cliente",
};

export default async function ClientServicesPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof clientService.getClientDetail>>;
  try {
    detail = await clientService.getClientDetail(ctx, clientId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { client, serviceCases, cases } = detail;
  const canManage = can(ctx.role, "cases.manage");

  const [services, members] = canManage
    ? await Promise.all([
        listVerticalServiceOptions(ctx.organizationId),
        listMemberOptions(ctx),
      ])
    : [[], []];

  const linkedCreditIds = new Set(
    serviceCases
      .map((sc) => sc.creditCase?.id)
      .filter((id): id is string => Boolean(id)),
  );
  const orphanCases = cases.filter((c) => !linkedCreditIds.has(c.id));

  return (
    <AgencyClientShell
      clientId={client.id}
      fullName={clientFullName(client)}
      status={client.status}
      title="Servicios"
      actions={
        canManage && client.status !== "ARCHIVED" ? (
          <CreateCaseButton
            clientId={client.id}
            services={services}
            members={members}
          />
        ) : null
      }
    >
      <ClientServicesPanel
        clientId={client.id}
        clientArchived={client.status === "ARCHIVED"}
        serviceCases={serviceCases}
        orphanCases={orphanCases}
        canManage={canManage}
        services={services}
        members={members}
      />
    </AgencyClientShell>
  );
}
