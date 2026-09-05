import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
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
  labelFor,
  ROUND_STATUS_LABELS,
} from "@/src/lib/labels";
import { LineChart } from "lucide-react";

export const metadata: Metadata = { title: "Progreso" };

function asScores(json: Prisma.JsonValue) {
  if (!Array.isArray(json)) return [];
  return json.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      bureau: String(r.bureau ?? ""),
      score: typeof r.score === "number" ? r.score : null,
      delta: typeof r.delta === "number" ? r.delta : null,
    };
  });
}

function asResults(json: Prisma.JsonValue) {
  const r = (json && typeof json === "object" && !Array.isArray(json)
    ? json
    : {}) as Record<string, unknown>;
  return {
    deleted: Number(r.deleted ?? 0),
    updated: Number(r.updated ?? 0),
    pending: Number(r.pending ?? 0),
    verified: Number(r.verified ?? 0),
  };
}

function asLines(json: Prisma.JsonValue): string[] {
  if (!Array.isArray(json)) return [];
  return json.map((line) => String(line));
}

export default async function PortalProgresoPage() {
  const ctx = await requirePortalSession();
  const [home, latest] = await Promise.all([
    portal.getPortalHome(ctx.clientId, ctx.organizationId),
    portal.getLatestPortalProgressReport(ctx.clientId, ctx.organizationId),
  ]);
  const activeCase = home.activeCase;
  const reviewOverdue =
    Boolean(activeCase?.nextReviewAt) &&
    new Date(activeCase!.nextReviewAt!) < new Date();

  return (
    <div>
      <PageHeader
        title="Progreso"
        description="Avance de tu caso: resultados, scores y próximos pasos."
      />

      {!activeCase ? (
        <Card>
          <EmptyState
            icon={LineChart}
            title="Sin progreso visible"
            description="Cuando tu asesor abra un caso, verás aquí tu avance."
          />
        </Card>
      ) : !latest ? (
        <Card>
          <CardHeader title="Aún sin reportes" />
          <CardBody className="space-y-3">
            <EmptyState
              icon={LineChart}
              title="Tu asesor publicará el progreso aquí"
              description="Mientras tanto, este es el estado actual de tu caso."
            />
            <p className="text-sm text-text-secondary">
              Caso <span className="font-medium text-ink">{activeCase.caseCode}</span>
              {" · "}
              {labelFor(CASE_STATE_LABELS, activeCase.state)}
              {" · "}
              {activeCase.stageName}
              {activeCase.currentRound
                ? ` · Ronda #${activeCase.currentRound.roundNumber} (${labelFor(ROUND_STATUS_LABELS, activeCase.currentRound.status)})`
                : ""}
            </p>
            <p className="text-sm text-text-secondary">
              Próxima revisión:{" "}
              {activeCase.nextReviewAt ? (
                reviewOverdue ? (
                  <Pill tone="red">
                    Pendiente {formatDate(activeCase.nextReviewAt)}
                  </Pill>
                ) : (
                  formatDate(activeCase.nextReviewAt)
                )
              ) : (
                "Sin fecha"
              )}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Último reporte"
              description={`${latest.periodLabel} · ${latest.roundLabel}`}
            />
            <CardBody className="space-y-5">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Caso
                  </dt>
                  <dd className="mt-0.5 font-medium text-ink">{latest.caseCode}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Fecha del reporte
                  </dt>
                  <dd className="mt-0.5 text-ink">
                    {formatDate(latest.reportDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Próxima revisión
                  </dt>
                  <dd className="mt-0.5">
                    {latest.nextReviewAt ? (
                      new Date(latest.nextReviewAt) < new Date() ? (
                        <Pill tone="red">
                          Pendiente {formatDate(latest.nextReviewAt)}
                        </Pill>
                      ) : (
                        <span className="text-ink">
                          {formatDate(latest.nextReviewAt)}
                        </span>
                      )
                    ) : (
                      <span className="text-text-secondary">Sin fecha</span>
                    )}
                  </dd>
                </div>
              </dl>

              {(() => {
                const scores = asScores(latest.scoresJson);
                if (scores.length === 0) return null;
                return (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                      Scores
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {scores.map((s) => (
                        <div
                          key={s.bureau}
                          className="rounded-surface bg-surface-app px-3 py-3"
                        >
                          <p className="text-xs text-text-secondary">{s.bureau}</p>
                          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                            {s.score ?? "—"}
                          </p>
                          {s.delta != null ? (
                            <p
                              className={`mt-0.5 text-xs font-medium tabular-nums ${
                                s.delta > 0
                                  ? "text-success-ink"
                                  : s.delta < 0
                                    ? "text-danger-ink"
                                    : "text-text-secondary"
                              }`}
                            >
                              {s.delta > 0 ? "+" : ""}
                              {s.delta}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const results = asResults(latest.resultsJson);
                return (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                      Resultados
                    </p>
                    <div className="flex flex-wrap gap-2 text-sm">
                      <Pill tone="green">Eliminados: {results.deleted}</Pill>
                      <Pill tone="blue">Actualizados: {results.updated}</Pill>
                      {results.verified > 0 ? (
                        <Pill tone="slate">Verificados: {results.verified}</Pill>
                      ) : null}
                      <Pill tone="amber">Pendientes: {results.pending}</Pill>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const lines = asLines(latest.resultLinesJson);
                if (lines.length === 0) return null;
                return (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                      Detalle
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                      {lines.slice(0, 12).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-secondary">
                  Próximos pasos
                </p>
                <p className="whitespace-pre-wrap text-sm text-ink">
                  {latest.nextSteps}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/portal/reportes/${latest.id}`}
                  className="inline-flex min-h-10 items-center rounded-control bg-action-primary px-3 text-sm font-semibold text-action-primary-foreground hover:bg-action-secondary"
                >
                  Ver reporte completo
                </Link>
                <a
                  href={`/api/progress-reports/${latest.id}/pdf`}
                  className="inline-flex min-h-10 items-center rounded-control bg-surface-panel px-3 text-sm font-medium text-ink hover:bg-nav-active"
                >
                  Descargar PDF
                </a>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
