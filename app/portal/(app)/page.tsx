import type { Metadata } from "next";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Pill,
} from "@/src/components/ui";
import { requirePortalSession } from "@/src/server/auth/guards";
import * as portal from "@/src/server/portal";
import { formatDate } from "@/src/lib/format";
import {
  CASE_STATE_LABELS,
  CONTRACT_STATUS_LABELS,
  CREDIT_BUREAU_LABELS,
  labelFor,
  ROUND_STATUS_LABELS,
} from "@/src/lib/labels";
import { Briefcase } from "lucide-react";
import { PortalSignContractButton } from "@/src/components/portal/portal-sign-contract";

export const metadata: Metadata = { title: "Inicio" };

export default async function PortalHomePage() {
  const ctx = await requirePortalSession();
  const [home, contracts] = await Promise.all([
    portal.getPortalHome(ctx.clientId, ctx.organizationId),
    portal.listPortalContracts(ctx.clientId, ctx.organizationId),
  ]);

  const pendingContracts = contracts.filter((c) => c.status === "SENT");
  const activeCase = home.activeCase;

  return (
    <div>
      <PageHeader
        title={`Hola, ${home.client.name}`}
        description={`Código ${home.client.clientCode}. Resumen de tu caso y contratos pendientes.`}
      />

      <Card className="mb-4">
        <CardHeader title="Caso activo" />
        <CardBody>
          {!activeCase ? (
            <EmptyState
              icon={Briefcase}
              title="Sin caso abierto"
              description="Cuando tu asesor abra un caso, verás aquí el estado y los scores."
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                  Caso
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-ink">
                  {activeCase.caseCode}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                  Estado
                </dt>
                <dd className="mt-0.5">
                  <Pill tone="blue">
                    {labelFor(CASE_STATE_LABELS, activeCase.state)}
                  </Pill>
                  <span className="ml-2 text-sm text-text-secondary">
                    {activeCase.stageName}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                  Próxima revisión
                </dt>
                <dd className="mt-0.5 text-sm text-ink">
                  {activeCase.nextReviewAt ? (
                    new Date(activeCase.nextReviewAt) < new Date() ? (
                      <Pill tone="red">
                        Pendiente {formatDate(activeCase.nextReviewAt)}
                      </Pill>
                    ) : (
                      formatDate(activeCase.nextReviewAt)
                    )
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                  Ronda actual
                </dt>
                <dd className="mt-0.5 text-sm text-ink">
                  {activeCase.currentRound
                    ? `#${activeCase.currentRound.roundNumber} · ${labelFor(ROUND_STATUS_LABELS, activeCase.currentRound.status)}`
                    : "—"}
                </dd>
              </div>
              {activeCase.scores.length > 0 ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Scores recientes
                    {activeCase.latestReportDate
                      ? ` (${formatDate(activeCase.latestReportDate)})`
                      : ""}
                  </dt>
                  <dd className="mt-2 flex flex-wrap gap-3">
                    {activeCase.scores.map((s) => (
                      <div
                        key={s.bureau}
                        className="rounded-surface bg-surface-app px-3 py-2"
                      >
                        <p className="text-xs text-text-secondary">
                          {labelFor(CREDIT_BUREAU_LABELS, s.bureau)}
                        </p>
                        <p className="text-lg font-semibold tabular-nums text-ink">
                          {s.score ?? "—"}
                        </p>
                      </div>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
          )}
        </CardBody>
      </Card>

      {pendingContracts.length > 0 ? (
        <Card>
          <CardHeader
            title="Contratos por firmar"
            description="Revisa y firma los contratos enviados por tu asesor."
          />
          <CardBody>
            <ul className="space-y-4">
              {pendingContracts.map((c) => (
                <li key={c.id} className=" pb-4 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink">{c.title}</p>
                      <p className="text-xs text-text-secondary">
                        {labelFor(CONTRACT_STATUS_LABELS, c.status)} · v
                        {c.version}
                      </p>
                    </div>
                    <PortalSignContractButton
                      contractId={c.id}
                      title={c.title}
                      contentHtml={c.contentSnapshot}
                      defaultName={home.client.name}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
