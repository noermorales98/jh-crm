import Link from "next/link";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";
import { clientFullName } from "@/src/server/page-helpers";
import { getClientCreditSegments } from "@/src/server/credit-segments";
import { CREDIT_SEGMENTS } from "@/src/lib/credit/segments";
import { creditAnalysisHref } from "@/src/lib/routes/case-routes";
import { formatDate } from "@/src/lib/format";

const TONE_INK: Record<string, string> = {
  success: "text-success-ink",
  accent: "text-action-primary",
  danger: "text-danger-ink",
  neutral: "text-text-secondary",
};

/** Calificación de clientes por su último reporte + quién necesita reporte nuevo. */
export async function ClientQualification({ ctx }: { ctx: OrganizationContext }) {
  const segments = await getClientCreditSegments(ctx);
  if (segments.size === 0) return null;

  const ids = [...segments.keys()];
  const clients = await prisma.client.findMany({
    where: { organizationId: ctx.organizationId, id: { in: ids } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameOf = new Map(clients.map((c) => [c.id, clientFullName(c)]));
  const entries = [...segments.entries()];
  const ready = entries.filter(([, s]) => s.segment === "listo");
  const stale = entries
    .filter(([, s]) => s.stale)
    .sort((a, b) => (a[1].reportDate?.getTime() ?? 0) - (b[1].reportDate?.getTime() ?? 0));

  return (
    <section aria-labelledby="calificacion-heading" className="space-y-3">
      <div>
        <h2 id="calificacion-heading" className="text-[16px] font-medium text-ink">
          Calificación de clientes
        </h2>
        <p className="mt-0.5 text-[12px] text-text-secondary">
          Según su último reporte, con la misma matriz del Análisis de Crédito
        </p>
      </div>
      <div className="grid grid-cols-2 overflow-hidden rounded-[8px] border border-border-subtle bg-surface-elevated lg:grid-cols-4">
        {CREDIT_SEGMENTS.map((segment) => {
          const count = entries.filter(([, s]) => s.segment === segment.id).length;
          return (
            <div
              key={segment.id}
              className="border-b border-r border-border-subtle px-4 py-3 even:border-r-0 lg:border-b-0 lg:even:border-r lg:last:border-r-0"
            >
              <p className="text-[13px] font-medium text-ink">{segment.label}</p>
              <p
                className={`mt-1 text-[30px] font-normal leading-none tabular-nums ${
                  count === 0 ? "text-text-secondary" : TONE_INK[segment.tone]
                }`}
              >
                {count}
              </p>
              <p className="mt-1 text-[12px] leading-snug text-text-secondary">{segment.hint}</p>
            </div>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ClientList
          title="Toca actualizar reporte"
          empty="Ningún cliente tiene el reporte vencido."
          rows={stale.map(([id, s]) => ({
            id,
            name: nameOf.get(id) ?? "Cliente",
            href: `/crm/clientes/${id}/reportes`,
            meta: s.reportDate ? `Último: ${formatDate(s.reportDate, "UTC")}` : "",
          }))}
        />
        <ClientList
          title="Listos para fondeo"
          empty="Todavía ninguno cumple los 3 burós."
          rows={ready.map(([id, s]) => ({
            id,
            name: nameOf.get(id) ?? "Cliente",
            href: s.reportId ? creditAnalysisHref(s.reportId) : `/crm/clientes/${id}`,
            meta: "3 de 3 burós",
          }))}
        />
      </div>
    </section>
  );
}

function ClientList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { id: string; name: string; href: string; meta: string }[];
}) {
  return (
    <div className="rounded-[8px] border border-border-subtle bg-surface-elevated">
      <p className="border-b border-border-subtle px-4 py-2.5 text-[13px] font-medium text-ink">
        {title} <span className="text-text-secondary">({rows.length})</span>
      </p>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-text-secondary">{empty}</p>
      ) : (
        <ul>
          {rows.slice(0, 8).map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                className="flex items-center justify-between gap-3 px-4 py-2 text-[13px] hover:bg-nav-hover"
              >
                <span className="truncate text-ink">{row.name}</span>
                <span className="shrink-0 text-[12px] text-text-secondary">{row.meta}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
