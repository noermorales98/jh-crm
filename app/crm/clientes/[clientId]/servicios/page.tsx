import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import * as configService from "@/src/server/config";
import { listMemberOptions } from "@/src/server/page-helpers";
import { DomainError } from "@/src/server/errors";
import {
  Card,
  CardHeader,
  EmptyState,
  StagePill,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import {
  SERVICE_CASE_STATUS_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { CreateCaseButton } from "@/src/components/cases/create-case-button";
import { ClientHeader } from "../client-header";

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

  const [stages, members] = canManage
    ? await Promise.all([configService.listStages(ctx), listMemberOptions(ctx)])
    : [[], []];

  const linkedCreditIds = new Set(
    serviceCases
      .map((sc) => sc.creditCase?.id)
      .filter((id): id is string => Boolean(id)),
  );
  const orphanCases = cases.filter((c) => !linkedCreditIds.has(c.id));

  return (
    <div>
      <ClientHeader
        client={client}
        actions={
          canManage && client.status !== "ARCHIVED" ? (
            <CreateCaseButton
              clientId={client.id}
              stages={stages}
              members={members}
            />
          ) : null
        }
      />

      <Card>
        <CardHeader
          title="Servicios activos"
          description={`${serviceCases.length} expediente(s) · cada uno con su etapa y próxima acción.`}
        />
        {serviceCases.length === 0 && orphanCases.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="Sin servicios"
            description="Abre el primer expediente (p. ej. Credit Repair) para este cliente."
            action={
              canManage && client.status !== "ARCHIVED" ? (
                <CreateCaseButton
                  clientId={client.id}
                  stages={stages}
                  members={members}
                />
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Servicio</TH>
                <TH>Expediente</TH>
                <TH>Etapa</TH>
                <TH>Estado</TH>
                <TH>Próxima acción</TH>
                <TH>Inicio</TH>
              </TR>
            </THead>
            <TBody>
              {serviceCases.map((sc) => {
                const href = sc.creditCase
                  ? `/crm/casos/${sc.creditCase.id}`
                  : undefined;
                return (
                  <TR
                    key={sc.id}
                    className="transition-colors hover:bg-nav-hover"
                  >
                    <TD>
                      <span className="font-medium text-text-primary">
                        {sc.service.name}
                      </span>
                      {sc.service.code ? (
                        <span className="mt-0.5 block font-mono text-[11px] text-text-secondary">
                          {sc.service.code}
                        </span>
                      ) : null}
                    </TD>
                    <TD>
                      {href ? (
                        <Link
                          href={href}
                          className="font-medium text-action-primary hover:text-action-secondary"
                        >
                          {sc.caseNumber}
                        </Link>
                      ) : (
                        <span className="font-mono text-sm">{sc.caseNumber}</span>
                      )}
                    </TD>
                    <TD>
                      <StagePill name={sc.stage.name} color={sc.stage.color} />
                    </TD>
                    <TD>
                      <span className="text-xs text-text-secondary-strong">
                        {labelFor(SERVICE_CASE_STATUS_LABELS, sc.status)}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap text-text-secondary">
                      {sc.nextActionAt ? formatDate(sc.nextActionAt) : "—"}
                    </TD>
                    <TD className="whitespace-nowrap text-text-secondary">
                      {formatDate(sc.startedAt)}
                    </TD>
                  </TR>
                );
              })}
              {orphanCases.map((c) => (
                <TR key={c.id} className="transition-colors hover:bg-nav-hover">
                  <TD>
                    <span className="font-medium text-text-primary">
                      Credit Repair
                    </span>
                    <span className="mt-0.5 block text-[11px] text-text-secondary">
                      Sin ServiceCase (legado)
                    </span>
                  </TD>
                  <TD>
                    <Link
                      href={`/crm/casos/${c.id}`}
                      className="font-medium text-action-primary hover:text-action-secondary"
                    >
                      {c.caseCode}
                    </Link>
                  </TD>
                  <TD>
                    <StagePill name={c.stage.name} color={c.stage.color} />
                  </TD>
                  <TD>
                    <StatusPill domain="case" value={c.state} />
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">
                    {c.nextReviewAt ? formatDate(c.nextReviewAt) : "—"}
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">
                    {formatDate(c.openedAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
