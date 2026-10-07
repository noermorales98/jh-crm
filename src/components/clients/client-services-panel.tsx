import Link from "next/link";
import { Briefcase } from "lucide-react";
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
import { SERVICE_CASE_STATUS_LABELS, labelFor } from "@/src/lib/labels";
import { CreateCaseButton } from "@/src/components/cases/create-case-button";
import type {
  ServiceOption,
  StageOption,
} from "@/src/components/cases/create-case-button";

type ServiceCaseRow = {
  id: string;
  caseNumber: string;
  status: string;
  startedAt: Date | string;
  nextActionAt: Date | string | null;
  service: { name: string; code: string | null };
  stage: { name: string; color: string };
  creditCase: { id: string } | null;
};

type OrphanCaseRow = {
  id: string;
  caseCode: string;
  state: string;
  openedAt: Date | string;
  nextReviewAt: Date | string | null;
  stage: { name: string; color: string };
};

export function ClientServicesPanel({
  clientId,
  clientArchived,
  serviceCases,
  orphanCases,
  canManage,
  services,
  members,
  showCreateInHeader = false,
}: {
  clientId: string;
  clientArchived: boolean;
  serviceCases: ServiceCaseRow[];
  orphanCases: OrphanCaseRow[];
  canManage: boolean;
  services: ServiceOption[];
  members: { id: string; name: string }[];
  stages?: StageOption[];
  showCreateInHeader?: boolean;
}) {
  const createBtn =
    canManage && !clientArchived ? (
      <CreateCaseButton
        clientId={clientId}
        services={services}
        members={members}
      />
    ) : null;

  return (
    <Card>
      <CardHeader
        title="Servicios activos"
        description={`${serviceCases.length} expediente(s) · cada uno con su etapa y próxima acción.`}
        actions={showCreateInHeader ? createBtn : undefined}
      />
      {serviceCases.length === 0 && orphanCases.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Sin servicios"
          description="Abre el primer expediente (p. ej. Credit Repair) para este cliente."
          action={createBtn}
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
                : `/crm/expedientes/${sc.id}`;
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
                    <Link
                      href={href}
                      className="font-medium text-action-primary hover:text-action-secondary"
                    >
                      {sc.caseNumber}
                    </Link>
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
  );
}
