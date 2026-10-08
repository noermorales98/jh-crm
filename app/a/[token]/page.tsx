import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DomainError } from "@/src/server/errors";
import { getAvanceViewByToken } from "@/src/server/avance/view";
import { formatDate } from "@/src/lib/format";

export const metadata: Metadata = {
  title: "Avance de crédito",
};

export default async function PublicAvancePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let data;
  try {
    data = await getAvanceViewByToken(decodeURIComponent(token));
  } catch (error) {
    if (error instanceof DomainError) {
      return (
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-[16px] font-semibold text-ink">{error.message}</p>
        </div>
      );
    }
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          {data.organizationName}
        </p>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
          Avance mensual de {data.clientName}.
        </h1>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-action-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-action-primary">
            {data.roundLabel}
          </span>
          {data.reportDate ? (
            <span className="rounded-full bg-nav-hover px-2.5 py-0.5 text-[11px] text-text-secondary">
              {formatDate(data.reportDate)}
            </span>
          ) : null}
        </div>
      </header>

      <p className="rounded-surface bg-warning-soft px-4 py-3 text-[13px] text-warning-ink">
        {data.cleanup.negativeTotal > 0
          ? `Hay ${data.cleanup.negativeTotal} elementos a trabajar en tu reporte. Tu asesor te guía en cada ronda.`
          : data.verdict}
      </p>

      <section className="grid gap-2 sm:grid-cols-3">
        {data.bureaus.map((b) => (
          <div
            key={b.bureau}
            className="rounded-surface bg-surface-panel px-3 py-4 text-center ring-1 ring-border-subtle"
          >
            <p className="text-[11px] uppercase text-text-secondary">{b.bureau}</p>
            <p className="mt-1 text-[28px] font-semibold tabular-nums text-ink">
              {b.score ?? "—"}
            </p>
            <p className="text-[11px] text-text-secondary">{b.label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-surface bg-surface-panel p-4 ring-1 ring-border-subtle">
        <h2 className="text-[12px] font-semibold uppercase text-text-secondary">
          Qué hay que limpiar
        </h2>
        <ul className="mt-2 space-y-1 text-[13px] text-ink">
          <li>Charge-offs / colecciones: {data.cleanup.chargeOffs}</li>
          <li>Pagos tardíos: {data.cleanup.late}</li>
          <li>Consultas duras: {data.cleanup.inquiries}</li>
          <li>Datos personales: {data.cleanup.personal}</li>
        </ul>
      </section>
    </div>
  );
}
