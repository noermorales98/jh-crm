import type { Effectiveness, EffectivenessCell } from "@/src/server/disputes/effectiveness";
import { STRATEGY_INFO } from "@/src/lib/disputes/strategies";

const BUREAUS = [
  { key: "EQUIFAX", label: "Equifax", color: "light-dark(#c8364f, #f27088)" },
  { key: "EXPERIAN", label: "Experian", color: "light-dark(#2f5bd3, #7d9cff)" },
  { key: "TRANSUNION", label: "TransUnion", color: "light-dark(#0b8f8a, #3cc9c1)" },
] as const;

function rate(cell: EffectivenessCell) {
  return cell.resolved > 0 ? Math.round((cell.deleted / cell.resolved) * 100) : null;
}

function Cell({ cell }: { cell: EffectivenessCell }) {
  const r = rate(cell);
  if (r == null) return <span className="text-text-secondary">Sin datos</span>;
  return (
    <span className="tabular-nums">
      <span className="font-semibold text-ink">{r}%</span>
      <span className="text-text-secondary">
        {" "}
        ({cell.deleted} de {cell.resolved})
      </span>
    </span>
  );
}

/** Eliminaciones por método y buró, con conteo real de la agencia. */
export function DisputeEffectiveness({ data }: { data: Effectiveness }) {
  return (
    <section className="rounded-surface bg-surface-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-ink">Qué funciona</h2>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Cuentas eliminadas por método y buró, de las disputas con resultado anotado.
          </p>
        </div>
        {data.total.resolved > 0 ? (
          <p className="text-[13px] text-text-secondary">
            En total <span className="font-semibold text-ink tabular-nums">{rate(data.total)}%</span> eliminadas (
            {data.total.deleted} de {data.total.resolved})
          </p>
        ) : null}
      </div>
      {data.rows.length === 0 ? (
        <p className="mt-4 rounded-control bg-surface-app px-4 py-4 text-[13px] text-text-secondary">
          Aún no hay resultados. En cada ronda, al llegar la respuesta del buró, marca el resultado de cada disputa
          (Eliminado, Actualizado, Verificado). Aquí verás qué método borra más en cada buró.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-[13px]">
            <thead className="text-[12px] text-text-secondary">
              <tr>
                <th className="py-2 pr-3 font-medium">Método</th>
                {BUREAUS.map((b) => (
                  <th key={b.key} className="py-2 pr-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: b.color }} aria-hidden />
                      {b.label}
                    </span>
                  </th>
                ))}
                <th className="py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle/50">
              {data.rows.map((row) => (
                <tr key={row.strategy}>
                  <td className="py-2.5 pr-3 font-medium text-ink">{STRATEGY_INFO[row.strategy].label}</td>
                  {BUREAUS.map((b) => (
                    <td key={b.key} className="py-2.5 pr-3">
                      <Cell cell={row.byBureau[b.key]} />
                    </td>
                  ))}
                  <td className="py-2.5">
                    <Cell cell={row.total} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11.5px] text-text-secondary">
            Resultados pasados de esta agencia; no garantizan lo que pasará con otro cliente.
          </p>
        </div>
      )}
    </section>
  );
}

/** Guía corta de los métodos, en el orden recomendado para una ronda. */
export function DisputeMethodsGuide() {
  const ordered = Object.entries(STRATEGY_INFO).sort((a, b) => a[1].order - b[1].order);
  return (
    <section className="rounded-surface bg-surface-panel p-5">
      <h2 className="text-[16px] font-semibold text-ink">Métodos de disputa</h2>
      <p className="mt-0.5 text-[13px] text-text-secondary">
        En este orden. A los 30 días, sube el reporte nuevo y dispara la ronda 2 (método de verificación) con lo que
        siga igual.
      </p>
      <ol className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {ordered.map(([key, info], index) => (
          <li key={key} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-app text-[12px] font-semibold tabular-nums text-ink">
              {index + 1}
            </span>
            <span>
              <span className="block text-[13.5px] font-semibold text-ink">
                {info.label} <span className="font-normal text-text-secondary">· {info.basis}</span>
              </span>
              <span className="block text-[12.5px] text-text-secondary">{info.when}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
