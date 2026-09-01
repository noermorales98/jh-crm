import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, RefreshCcw } from "lucide-react";
import type { RoundStatus } from "@prisma/client";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as roundService from "@/src/server/rounds";
import {
  clientFullName,
  firstParam,
  listMemberOptions,
  parseEnumParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import {
  Card,
  CardHeader,
  CursorPagination,
  EmptyState,
  FilterBar,
  FilterSelect,
  PageHeader,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import { ROUND_STATUS_LABELS } from "@/src/lib/labels";
import { RoundActions } from "@/src/components/rounds/round-actions";

export const metadata: Metadata = {
  title: "Rondas",
};

const ROUND_STATUSES = Object.keys(ROUND_STATUS_LABELS) as RoundStatus[];

export default async function RoundsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireOrganization();
  const sp = await searchParams;

  const status = parseEnumParam(firstParam(sp, "status"), ROUND_STATUSES);
  const cursor = firstParam(sp, "cursor");
  const canManage = can(ctx.role, "rounds.manage");

  const [upcoming, list, members] = await Promise.all([
    // Próximas revisiones: rondas enviadas/en espera con fecha ≤ 30 días o vencida.
    roundService.listRounds(ctx, { upcomingDays: 30, limit: 10 }),
    roundService.listRounds(ctx, { status, cursor }),
    canManage ? listMemberOptions(ctx) : Promise.resolve([]),
  ]);

  const now = new Date();

  return (
    <div>
      <PageHeader
        title="Rondas"
        description="Rondas de disputa de todos los casos. La creación se hace desde el caso correspondiente."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Próximas revisiones"
            description="Rondas enviadas con revisión esperada en los próximos 30 días o ya vencida."
          />
          {upcoming.items.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Sin revisiones próximas"
              description="No hay rondas esperando actualización de los burós."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Ronda</TH>
                  <TH>Caso / Cliente</TH>
                  <TH>Estado</TH>
                  <TH>Revisión esperada</TH>
                  {canManage ? <TH className="text-right">Acciones</TH> : null}
                </TR>
              </THead>
              <TBody>
                {upcoming.items.map((round) => {
                  const overdue =
                    round.expectedReviewAt && new Date(round.expectedReviewAt) < now;
                  return (
                    <TR key={round.id}>
                      <TD className="font-medium text-ink">
                        Ronda {round.roundNumber}
                      </TD>
                      <TD>
                        <Link
                          href={`/crm/casos/${round.case.id}/rondas`}
                          className="text-action-primary hover:text-action-secondary"
                        >
                          {round.case.caseCode}
                        </Link>
                        <span className="block text-xs text-text-secondary">
                          {clientFullName(round.case.client)}
                        </span>
                      </TD>
                      <TD>
                        <StatusPill domain="round" value={round.status} />
                      </TD>
                      <TD
                        className={`whitespace-nowrap ${overdue ? "font-medium text-red-600" : "text-text-secondary"}`}
                      >
                        {round.expectedReviewAt
                          ? formatDate(round.expectedReviewAt)
                          : "—"}
                        {overdue ? " · vencida" : ""}
                      </TD>
                      {canManage ? (
                        <TD className="text-right">
                          <RoundActions
                            roundId={round.id}
                            status={round.status}
                            members={members}
                          />
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">
              Todas las rondas
            </h2>
            <FilterBar>
              <FilterSelect
                name="status"
                label="Estado"
                options={ROUND_STATUSES.map((s) => ({
                  value: s,
                  label: ROUND_STATUS_LABELS[s],
                }))}
              />
            </FilterBar>
          </div>

          {list.items.length === 0 ? (
            <EmptyState
              icon={RefreshCcw}
              title="Sin rondas"
              description="Ninguna ronda coincide con el filtro aplicado."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Ronda</TH>
                  <TH>Caso / Cliente</TH>
                  <TH>Estado</TH>
                  <TH>Creada</TH>
                  <TH>Enviada</TH>
                  <TH>Revisión esperada</TH>
                  {canManage ? <TH className="text-right">Acciones</TH> : null}
                </TR>
              </THead>
              <TBody>
                {list.items.map((round) => (
                  <TR key={round.id}>
                    <TD className="font-medium text-ink">
                      Ronda {round.roundNumber}
                    </TD>
                    <TD>
                      <Link
                        href={`/crm/casos/${round.case.id}/rondas`}
                        className="text-action-primary hover:text-action-secondary"
                      >
                        {round.case.caseCode}
                      </Link>
                      <span className="block text-xs text-text-secondary">
                        {clientFullName(round.case.client)}
                      </span>
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
                    <TD className="whitespace-nowrap text-text-secondary">
                      {round.expectedReviewAt
                        ? formatDate(round.expectedReviewAt)
                        : "—"}
                    </TD>
                    {canManage ? (
                      <TD className="text-right">
                        <RoundActions
                          roundId={round.id}
                          status={round.status}
                          members={members}
                        />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}

          <CursorPagination
            pathname="/crm/rondas"
            params={{ status, back: firstParam(sp, "back") }}
            cursor={cursor}
            nextCursor={list.nextCursor}
          />
        </Card>
      </div>
    </div>
  );
}
