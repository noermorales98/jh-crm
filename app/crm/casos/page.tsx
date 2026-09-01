import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import type { CaseState } from "@prisma/client";
import { requireOrganization } from "@/src/server/auth/guards";
import * as caseService from "@/src/server/cases";
import * as configService from "@/src/server/config";
import {
  clientFullName,
  firstParam,
  listMemberOptions,
  parseDateParam,
  parseEnumParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import {
  Card,
  CursorPagination,
  EmptyState,
  FilterBar,
  FilterDate,
  FilterSelect,
  PageHeader,
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
import { CASE_STATE_LABELS } from "@/src/lib/labels";

export const metadata: Metadata = {
  title: "Casos",
};

const CASE_STATES = Object.keys(CASE_STATE_LABELS) as CaseState[];

export default async function CasesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireOrganization();
  const sp = await searchParams;

  const state = parseEnumParam(firstParam(sp, "state"), CASE_STATES);
  const assignedToId = firstParam(sp, "assignedTo");
  const reviewFrom = parseDateParam(firstParam(sp, "reviewFrom"));
  const reviewTo = parseDateParam(firstParam(sp, "reviewTo"));
  const cursor = firstParam(sp, "cursor");

  // El filtro de etapa llega como stageId directamente o como stage key.
  const [stages, members] = await Promise.all([
    configService.listStages(ctx),
    listMemberOptions(ctx),
  ]);
  const stageParam = firstParam(sp, "stage");
  const stage = stageParam
    ? stages.find((s) => s.id === stageParam || s.key === stageParam)
    : undefined;

  const result = await caseService.listCases(ctx, {
    stageId: stage?.id,
    state,
    assignedToId,
    reviewFrom,
    reviewTo,
    cursor,
  });

  return (
    <div>
      <PageHeader
        title="Casos"
        description="Vista global de los casos de reparación de crédito. La creación de casos se hace desde la página del cliente."
      />

      <Card>
        <div className="flex flex-wrap items-center justify-end gap-3 border-b border-border-subtle px-4 py-3">
          <FilterBar>
            <FilterSelect
              name="stage"
              label="Etapa"
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
            />
            <FilterSelect
              name="state"
              label="Estado"
              options={CASE_STATES.map((s) => ({
                value: s,
                label: CASE_STATE_LABELS[s],
              }))}
            />
            <FilterSelect
              name="assignedTo"
              label="Responsable"
              options={members.map((m) => ({ value: m.id, label: m.name }))}
            />
            <FilterDate name="reviewFrom" label="Revisión desde" />
            <FilterDate name="reviewTo" label="Revisión hasta" />
          </FilterBar>
        </div>

        {result.items.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="Sin casos"
            description="Ningún caso coincide con los filtros aplicados. Los casos se crean desde la página del cliente."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Caso</TH>
                <TH>Cliente</TH>
                <TH>Etapa</TH>
                <TH>Estado</TH>
                <TH>Próxima revisión</TH>
                <TH>Responsable</TH>
              </TR>
            </THead>
            <TBody>
              {result.items.map((c) => {
                const overdue =
                  c.nextReviewAt && new Date(c.nextReviewAt) < new Date() && c.state === "OPEN";
                return (
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
                      <Link
                        href={`/crm/clientes/${c.client.id}`}
                        className="text-text-secondary-strong hover:text-ink"
                      >
                        {clientFullName(c.client)}
                      </Link>
                    </TD>
                    <TD>
                      <StagePill name={c.stage.name} color={c.stage.color} />
                    </TD>
                    <TD>
                      <StatusPill domain="case" value={c.state} />
                    </TD>
                    <TD
                      className={`whitespace-nowrap ${overdue ? "font-medium text-red-600" : "text-text-secondary"}`}
                    >
                      {c.nextReviewAt ? formatDate(c.nextReviewAt) : "—"}
                      {overdue ? " · vencida" : ""}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {c.assignedTo?.name ?? (
                        <span className="text-text-secondary">Sin asignar</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}

        <CursorPagination
          pathname="/crm/casos"
          params={{
            stage: stageParam,
            state,
            assignedTo: assignedToId,
            reviewFrom: firstParam(sp, "reviewFrom"),
            reviewTo: firstParam(sp, "reviewTo"),
            back: firstParam(sp, "back"),
          }}
          cursor={cursor}
          nextCursor={result.nextCursor}
        />
      </Card>
    </div>
  );
}
