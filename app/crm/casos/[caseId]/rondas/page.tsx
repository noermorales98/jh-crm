import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RefreshCcw } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as caseService from "@/src/server/cases";
import { listMemberOptions } from "@/src/server/page-helpers";
import { DomainError } from "@/src/server/errors";
import {
  Card,
  CardHeader,
  EmptyState,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import { CreateRoundButton } from "@/src/components/rounds/create-round-button";
import { RoundActions } from "@/src/components/rounds/round-actions";
import { CaseHeader } from "../case-header";

export const metadata: Metadata = {
  title: "Rondas del caso",
};

export default async function CaseRoundsPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof caseService.getCaseDetail>>;
  try {
    detail = await caseService.getCaseDetail(ctx, caseId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { case: creditCase, rounds } = detail;
  const canManage = can(ctx.role, "rounds.manage");
  const members = canManage ? await listMemberOptions(ctx) : [];

  return (
    <div>
      <CaseHeader
        creditCase={creditCase}
        actions={
          canManage && creditCase.state === "OPEN" ? (
            <CreateRoundButton caseId={creditCase.id} />
          ) : null
        }
      />

      <Card>
        <CardHeader
          title="Rondas de disputa"
          description="Cada ronda se numera automáticamente. Abre una ronda para seleccionar elementos y registrar resultados."
        />
        {rounds.length === 0 ? (
          <EmptyState
            icon={RefreshCcw}
            title="Sin rondas"
            description="Crea la primera ronda de disputa para este caso."
            action={
              canManage && creditCase.state === "OPEN" ? (
                <CreateRoundButton caseId={creditCase.id} />
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Ronda</TH>
                <TH>Estado</TH>
                <TH>Creada</TH>
                <TH>Enviada</TH>
                <TH>Revisión esperada</TH>
                <TH>Cartas / elementos</TH>
                <TH className="text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {rounds.map((round) => (
                <TR key={round.id}>
                  <TD className="font-medium text-ink">
                    <Link
                      href={`/crm/casos/${caseId}/rondas/${round.id}`}
                      className="text-action-primary hover:text-action-secondary"
                    >
                      Ronda {round.roundNumber}
                    </Link>
                  </TD>
                  <TD>
                    <StatusPill domain="round" value={round.status} />
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">
                    {formatDate(round.startedAt)}
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">
                    {round.sentAt ? formatDate(round.sentAt) : "—"}
                  </TD>
                  <TD
                    className={`whitespace-nowrap ${
                      round.expectedReviewAt &&
                      new Date(round.expectedReviewAt) < new Date() &&
                      (round.status === "SENT" ||
                        round.status === "WAITING_UPDATE")
                        ? "font-medium text-danger-ink"
                        : "text-text-secondary"
                    }`}
                  >
                    {round.expectedReviewAt
                      ? formatDate(round.expectedReviewAt)
                      : "—"}
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">
                    {round.lettersCount} / {round.disputedItemsCount}
                  </TD>
                  <TD className="text-right">
                    {canManage ? (
                      <RoundActions
                        roundId={round.id}
                        status={round.status}
                        members={members}
                      />
                    ) : null}
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
