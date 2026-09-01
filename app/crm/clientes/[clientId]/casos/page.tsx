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
import { CreateCaseButton } from "@/src/components/cases/create-case-button";
import { ClientHeader } from "../client-header";

export const metadata: Metadata = {
  title: "Casos del cliente",
};

export default async function ClientCasesPage({
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

  const { client, cases } = detail;
  const canManage = can(ctx.role, "cases.manage");

  const [stages, members] = canManage
    ? await Promise.all([configService.listStages(ctx), listMemberOptions(ctx)])
    : [[], []];

  return (
    <div>
      <ClientHeader
        client={client}
        actions={
          canManage && client.status !== "ARCHIVED" ? (
            <CreateCaseButton clientId={client.id} stages={stages} members={members} />
          ) : null
        }
      />

      <Card>
        <CardHeader
          title="Casos de reparación de crédito"
          description={`${cases.length} caso(s) registrados para este cliente.`}
        />
        {cases.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="Sin casos"
            description="Crea el primer caso para empezar el proceso de reparación."
            action={
              canManage && client.status !== "ARCHIVED" ? (
                <CreateCaseButton clientId={client.id} stages={stages} members={members} />
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Caso</TH>
                <TH>Etapa</TH>
                <TH>Estado</TH>
                <TH>Próxima revisión</TH>
                <TH>Abierto</TH>
              </TR>
            </THead>
            <TBody>
              {cases.map((c) => (
                <TR key={c.id} className="transition-colors hover:bg-nav-hover">
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
