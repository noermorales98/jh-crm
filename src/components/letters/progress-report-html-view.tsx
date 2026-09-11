import Link from "next/link";
import { Download } from "lucide-react";
import { buttonClasses } from "@/src/components/ui";
import { formatForPdf } from "@/src/lib/format/dates";

export function ProgressReportHtmlView({
  organizationName,
  organizationContact,
  clientName,
  caseCode,
  periodLabel,
  roundLabel,
  reportDate,
  timezone,
  scores,
  results,
  resultLines,
  nextReviewAt,
  nextSteps,
  downloadHref,
  backHref,
}: {
  organizationName: string;
  organizationContact?: string | null;
  clientName: string;
  caseCode: string;
  periodLabel: string;
  roundLabel: string;
  reportDate: Date;
  timezone?: string;
  scores: { bureau: string; score: number | null; delta: number | null }[];
  results: {
    deleted: number;
    updated: number;
    pending: number;
    verified?: number;
  };
  resultLines: string[];
  nextReviewAt?: Date | null;
  nextSteps?: string | null;
  downloadHref: string;
  backHref: string;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="text-sm font-medium text-action-primary hover:text-action-secondary"
        >
          ← Volver
        </Link>
        <a href={downloadHref} className={buttonClasses("primary", "sm")}>
          <Download className="size-4" aria-hidden />
          Descargar PDF
        </a>
      </div>

      <article className="rounded-control border border-border-subtle bg-surface-panel px-8 py-10">
        <header className="border-b border-border-subtle pb-6">
          <p className="text-lg font-semibold text-ink">{organizationName}</p>
          {organizationContact ? (
            <p className="mt-1 text-sm text-text-secondary">{organizationContact}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <h1 className="text-base font-semibold uppercase tracking-wide text-ink">
              Reporte de progreso
            </h1>
            <span className="text-sm tabular-nums text-text-secondary">{caseCode}</span>
          </div>
        </header>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Cliente" value={clientName} />
          <Field label="Periodo" value={periodLabel} />
          <Field label="Ronda" value={roundLabel} />
          <Field label="Fecha" value={formatForPdf(reportDate, timezone)} />
        </dl>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-ink">Puntajes</h2>
          <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
            {scores.map((s) => {
              const delta =
                s.delta == null
                  ? ""
                  : s.delta > 0
                    ? ` (+${s.delta})`
                    : ` (${s.delta})`;
              return (
                <li
                  key={s.bureau}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="text-text-secondary">{s.bureau}</span>
                  <span className="font-medium tabular-nums text-ink">
                    {s.score != null ? `${s.score}${delta}` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-ink">Resultados</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Eliminados" value={results.deleted} />
            <Stat label="Actualizados" value={results.updated} />
            {results.verified != null ? (
              <Stat label="Verificados" value={results.verified} />
            ) : null}
            <Stat label="Pendientes" value={results.pending} />
          </ul>
        </section>

        {resultLines.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-sm font-semibold text-ink">Detalle resumido</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink">
              {resultLines.slice(0, 12).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {nextReviewAt ? (
          <p className="mt-8 text-sm">
            <span className="text-text-secondary">Próxima revisión: </span>
            {formatForPdf(nextReviewAt, timezone)}
          </p>
        ) : null}

        {nextSteps ? (
          <section className="mt-6">
            <h2 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Próximos pasos
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {nextSteps}
            </p>
          </section>
        ) : null}

        <p className="mt-10 text-xs text-text-secondary">
          Este resumen es informativo. Los resultados dependen de las respuestas
          de los burós y no garantizan un puntaje específico.
        </p>
      </article>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <li className="rounded-control border border-border-subtle px-3 py-2">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{value}</p>
    </li>
  );
}
