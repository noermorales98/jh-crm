"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, Download, FileWarning, Sparkles } from "lucide-react";
import {
  createRoundFromNegativesAction,
  loadNegativeReview,
  saveNegativeInterviewAction,
} from "@/src/actions/negative-review";
import type { NegativeReview, NegativeReviewDebt } from "@/src/server/credit-reports/negative-review";
import {
  CLIENT_ANSWER_LABELS,
  REASON_TITLES,
  hasStrongReason,
  type ClientAnswer,
  type ReasonCode,
} from "@/src/lib/credit/negative-review";
import { ANOMALY_NOT_INACCURACY, NEGATIVES_NOT_CERTIFIED } from "@/src/lib/credit/anomalies";
import { CREDIT_BUREAU_LABELS, CREDIT_NEGATIVE_TYPE_LABELS } from "@/src/lib/labels";
import { formatDate } from "@/src/lib/format";
import { metricText, presentAmount } from "@/src/lib/credit/metrics-view";

const BUREAU_COLOR: Record<string, string> = {
  EQUIFAX: "light-dark(#c8364f, #f27088)",
  EXPERIAN: "light-dark(#2f5bd3, #7d9cff)",
  TRANSUNION: "light-dark(#0b8f8a, #3cc9c1)",
};
const BUREAUS = ["EQUIFAX", "EXPERIAN", "TRANSUNION"] as const;

const ALL_REASONS: ReasonCode[] = ["INCONSISTENT", "DUPLICATE", "INCOMPLETE", "OBSOLETE", "VERIFY"];
const ANSWERS: ClientAnswer[] = ["NOT_MINE", "PAID", "WRONG_DATA", "CORRECT", "UNKNOWN"];
/** Un reporte con más de 30 días puede no reflejar lo que hoy ve el buró. */
const STALE_DAYS = 30;
const DAY_MS = 86_400_000;

function money(amount: number | null) {
  return metricText(presentAmount({ amount, currency: null, status: amount == null ? "UNKNOWN" : "KNOWN" }));
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}


type Pick = { itemIds: string[]; reasons: ReasonCode[] };
type InterviewValue = { answer: ClientAnswer | null; words: string | null };
type Filter = "all" | "strong" | "pending" | "picked";

/**
 * Cuentas negativas por deuda: motivos sugeridos, entrevista guardada y
 * creación de la ronda de disputas con sus cartas por buró.
 */
export function ClientNegativeAnalysisPanel({
  clientId,
  reportId,
}: {
  clientId: string;
  reportId: string | null;
}) {
  const router = useRouter();
  const [review, setReview] = useState<NegativeReview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [interviews, setInterviews] = useState<Record<string, InterviewValue>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, startCreate] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  // Fecha de referencia fijada al montar (evita leer el reloj durante el render).
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void loadNegativeReview({ clientId, reportId }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      setReview(res.data);
      setInterviews(Object.fromEntries(res.data.debts.map((d) => [d.key, d.interview])));
      // La primera deuda abierta para que se vea cómo funciona.
      if (res.data.debts[0]) setOpen({ [res.data.debts[0].key]: true });
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, reportId]);

  const selected = useMemo(() => Object.entries(picks).filter(([, p]) => p.itemIds.length > 0), [picks]);
  const disputeCount = selected.reduce((sum, [, p]) => sum + p.itemIds.length, 0);
  const letterCount = useMemo(() => {
    if (!review) return 0;
    const bureaus = new Set<string>();
    for (const [key, p] of selected) {
      const debt = review.debts.find((d) => d.key === key);
      debt?.rows.filter((r) => p.itemIds.includes(r.itemId)).forEach((r) => bureaus.add(r.bureau));
    }
    return bureaus.size;
  }, [review, selected]);

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden>
        <div className="h-20 animate-pulse rounded-surface bg-nav-hover" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-surface bg-nav-hover" />
        ))}
      </div>
    );
  }
  if (loadError) return <p className="text-center text-sm text-danger-ink">{loadError}</p>;
  if (!review || review.debts.length === 0) {
    return (
      <div className="rounded-surface bg-nav-hover/50 px-4 py-8 text-center">
        <Check className="mx-auto size-6 text-success-ink" aria-hidden />
        <p className="mt-2 text-[13px] text-text-secondary">
          {review ? "El último reporte no tiene cuentas negativas por revisar." : NEGATIVES_NOT_CERTIFIED}
        </p>
      </div>
    );
  }

  const blockedReason = (debt: NegativeReviewDebt): string | null => {
    if (!review.caseOpen) return "Servicio cerrado";
    if (debt.inOpenRound) return "Ya está en una ronda abierta";
    if (interviews[debt.key]?.answer === "CORRECT") return "El cliente dice que es correcta";
    return null;
  };

  const toggleDebt = (debt: NegativeReviewDebt) =>
    setPicks((prev) => {
      const current = prev[debt.key];
      if (current && current.itemIds.length > 0) return { ...prev, [debt.key]: { ...current, itemIds: [] } };
      return {
        ...prev,
        [debt.key]: {
          itemIds: debt.rows.map((r) => r.itemId),
          reasons: current?.reasons ?? debt.reasons.map((r) => r.code),
        },
      };
    });

  const updatePick = (debt: NegativeReviewDebt, next: Partial<Pick>) =>
    setPicks((prev) => {
      const current = prev[debt.key] ?? { itemIds: [], reasons: debt.reasons.map((r) => r.code) };
      return { ...prev, [debt.key]: { ...current, ...next } };
    });

  const suggestedDebts = review.debts.filter((d) => hasStrongReason(d) && !blockedReason(d));
  function pickSuggested() {
    setPicks((prev) => {
      const next = { ...prev };
      for (const debt of suggestedDebts) {
        next[debt.key] = {
          itemIds: debt.rows.map((r) => r.itemId),
          reasons: prev[debt.key]?.reasons ?? debt.reasons.map((r) => r.code),
        };
      }
      return next;
    });
  }

  function onInterviewSaved(debt: NegativeReviewDebt, value: InterviewValue) {
    setInterviews((prev) => ({ ...prev, [debt.key]: value }));
    // Si el cliente confirma que es correcta, sale de la selección.
    if (value.answer === "CORRECT") updatePick(debt, { itemIds: [] });
  }

  function createRound() {
    if (!review) return;
    setCreateError(null);
    startCreate(async () => {
      const res = await createRoundFromNegativesAction({
        clientId,
        reportId: review.reportId,
        selections: selected.map(([, p]) => p),
      });
      if (!res.ok) {
        setCreateError(res.error);
        return;
      }
      setCreated(
        `Ronda ${res.data.roundNumber} creada: ${plural(res.data.disputes, "disputa")} y ${plural(res.data.letters, "carta")} listas para revisar.`,
      );
      router.push(`/crm/clientes/${clientId}?panel=avance&roundId=${res.data.roundId}`);
      router.refresh();
    });
  }

  const totalBalance = review.debts.reduce((sum, d) => sum + (d.balance ?? 0), 0);
  const strongCount = review.debts.filter(hasStrongReason).length;
  const pendingCount = review.debts.filter((d) => !interviews[d.key]?.answer).length;
  const typeCounts = review.debts.reduce<Record<string, number>>((acc, d) => {
    acc[d.type] = (acc[d.type] ?? 0) + 1;
    return acc;
  }, {});
  const reportAgeDays = Math.floor((now - new Date(review.reportDate).getTime()) / DAY_MS);

  const visible = review.debts.filter((debt) => {
    if (filter === "strong") return hasStrongReason(debt);
    if (filter === "pending") return !interviews[debt.key]?.answer;
    if (filter === "picked") return (picks[debt.key]?.itemIds.length ?? 0) > 0;
    return true;
  });

  const FILTERS: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Todas", count: review.debts.length },
    { id: "strong", label: "Con motivos", count: strongCount },
    { id: "pending", label: "Sin entrevista", count: pendingCount },
    { id: "picked", label: "Elegidas", count: selected.length },
  ];

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <section>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-text-secondary">
            {review.clientName} · reporte del {formatDate(review.reportDate)}
          </p>
          <a
            href={`/api/clients/${clientId}/negative-review/pdf?reportId=${review.reportId}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-control bg-nav-hover/70 px-2.5 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-nav-hover"
          >
            <Download className="size-3.5" aria-hidden />
            Descargar PDF
          </a>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Deudas negativas" value={String(review.debts.length)} tone="danger" />
          <Stat label="Saldo reportado" value={money(totalBalance)} />
          <Stat label="Con motivo concreto" value={String(strongCount)} tone={strongCount > 0 ? "warning" : undefined} />
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(typeCounts).map(([type, count]) => (
            <span key={type} className="rounded-full bg-nav-hover px-2.5 py-0.5 text-[11px] font-medium text-ink">
              {CREDIT_NEGATIVE_TYPE_LABELS[type] ?? type} · {count}
            </span>
          ))}
        </div>
        {reportAgeDays > STALE_DAYS ? (
          <Notice>
            Este reporte tiene {reportAgeDays} días. Antes de disputar, sube uno reciente para no pedir cambios que el
            buró ya hizo.
          </Notice>
        ) : null}
        {!review.caseOpen ? (
          <Notice>El servicio de crédito está cerrado: puedes revisar, pero no crear rondas.</Notice>
        ) : null}
      </section>

      {/* Cómo funciona */}
      <ol className="grid grid-cols-3 gap-2 text-[11.5px] text-text-secondary">
        {["Revisa qué reporta cada buró", "Pregunta al cliente", "Elige y crea la ronda"].map((step, index) => (
          <li key={step} className="flex items-center gap-2 rounded-control bg-surface-app px-2.5 py-2">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-nav-hover text-[11px] font-semibold text-ink">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Filtrar deudas" className="flex flex-wrap gap-1 rounded-control bg-surface-app p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
                filter === f.id ? "bg-surface-elevated text-ink shadow-sm" : "text-text-secondary hover:text-ink"
              }`}
            >
              {f.label}
              <span className="ml-1 tabular-nums opacity-60">{f.count}</span>
            </button>
          ))}
        </div>
        {suggestedDebts.length > 0 ? (
          <button
            type="button"
            onClick={pickSuggested}
            className="inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-[12px] font-medium text-action-primary hover:bg-nav-hover"
          >
            <Sparkles className="size-3.5" aria-hidden />
            Elegir las {suggestedDebts.length} sugeridas
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        {visible.length === 0 ? (
          <p className="rounded-surface bg-surface-app px-4 py-6 text-center text-[12.5px] text-text-secondary">
            Ninguna deuda en este filtro.
          </p>
        ) : null}
        {visible.map((debt) => (
          <DebtCard
            key={debt.key}
            clientId={clientId}
            debt={debt}
            pick={picks[debt.key]}
            interview={interviews[debt.key] ?? debt.interview}
            blocked={blockedReason(debt)}
            expanded={open[debt.key] ?? false}
            onExpand={() => setOpen((prev) => ({ ...prev, [debt.key]: !prev[debt.key] }))}
            onToggle={() => toggleDebt(debt)}
            onChange={(next) => updatePick(debt, next)}
            onInterviewSaved={(value) => onInterviewSaved(debt, value)}
          />
        ))}
      </div>

      {review.inquiries.length > 0 ? (
        <section className="rounded-surface bg-surface-app p-4">
          <h3 className="text-[14px] font-semibold text-ink">
            Consultas duras <span className="font-normal text-text-secondary">· {review.inquiries.length}</span>
          </h3>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Bajan el puntaje un poco y pesan si son muchas. Pregunta al cliente cuáles no reconoce; esas se disputan
            por carta aparte, no entran en esta ronda.
          </p>
          <ul className="mt-2 divide-y divide-border-subtle/60 text-[13px]">
            {review.inquiries.map((inquiry) => (
              <li key={inquiry.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="inline-flex items-center gap-2 text-ink">
                  <span className="size-2 rounded-full" style={{ background: BUREAU_COLOR[inquiry.bureau] }} aria-hidden />
                  {inquiry.creditorName}
                </span>
                <span className="text-[12px] text-text-secondary">
                  {CREDIT_BUREAU_LABELS[inquiry.bureau] ?? inquiry.bureau}
                  {inquiry.inquiryDate ? ` · ${formatDate(inquiry.inquiryDate)}` : " · sin fecha"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="px-2 text-center text-[11px] leading-relaxed text-text-secondary">
        Herramienta para ejercer los derechos de disputa bajo la FCRA. No es asesoría legal ni garantiza la
        eliminación de registros; la decisión final es del buró tras su reinvestigación. Solo se disputa lo que el
        cliente considera inexacto o no puede verificarse.
      </p>

      {/* Barra de acción */}
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-surface bg-surface-elevated px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <div className="min-w-0 text-[13px]">
          {createError ? (
            <p className="text-danger-ink" role="alert">
              {createError}
            </p>
          ) : created ? (
            <p className="text-success-ink">{created}</p>
          ) : selected.length === 0 ? (
            <p className="text-text-secondary">Elige las deudas a disputar.</p>
          ) : (
            <p className="text-ink">
              <span className="font-semibold">{plural(selected.length, "deuda")}</span>
              <span className="text-text-secondary">
                {" "}
                · {plural(disputeCount, "disputa")} · {plural(letterCount, "carta")}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selected.length > 0 && !creating ? (
            <button
              type="button"
              onClick={() => setPicks({})}
              className="rounded-control px-3 py-2 text-[12.5px] font-medium text-text-secondary hover:bg-nav-hover"
            >
              Limpiar
            </button>
          ) : null}
          <button
            type="button"
            onClick={createRound}
            disabled={selected.length === 0 || creating || !review.caseOpen}
            className="rounded-control bg-action-primary px-4 py-2 text-[13px] font-semibold text-action-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {creating ? "Creando…" : "Crear ronda de disputas"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warning" }) {
  const color = tone === "danger" ? "text-danger-ink" : tone === "warning" ? "text-warning-ink" : "text-ink";
  return (
    <div className="rounded-control bg-surface-app px-3 py-2">
      <dt className="text-[11px] text-text-secondary">{label}</dt>
      <dd className={`mt-0.5 text-[20px] font-semibold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex gap-2 rounded-control bg-warning-soft px-3 py-2 text-[12px] text-warning-ink">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function DebtCard({
  clientId,
  debt,
  pick,
  interview,
  blocked,
  expanded,
  onExpand,
  onToggle,
  onChange,
  onInterviewSaved,
}: {
  clientId: string;
  debt: NegativeReviewDebt;
  pick: Pick | undefined;
  interview: InterviewValue;
  blocked: string | null;
  expanded: boolean;
  onExpand: () => void;
  onToggle: () => void;
  onChange: (next: Partial<Pick>) => void;
  onInterviewSaved: (value: InterviewValue) => void;
}) {
  const included = (pick?.itemIds.length ?? 0) > 0;
  const reasons = pick?.reasons ?? debt.reasons.map((r) => r.code);
  const suggested = new Set(debt.reasons.map((r) => r.code));
  const reported = new Set(debt.rows.map((r) => r.bureau));
  const strong = debt.reasons.filter((r) => r.code !== "VERIFY" && r.code !== "OBSOLETE");
  const disabled = blocked != null;

  return (
    <article
      className={`overflow-hidden rounded-surface transition-colors ${
        included ? "bg-nav-active/60" : "bg-surface-app hover:bg-nav-hover/50"
      }`}
    >
      <div className="flex items-start gap-3 p-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={included}
          aria-label={`Disputar ${debt.creditorName}`}
          title={blocked ?? undefined}
          disabled={disabled}
          onClick={onToggle}
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-[5px] ring-1 transition-colors disabled:opacity-40 ${
            included ? "bg-action-primary text-action-primary-foreground ring-action-primary" : "ring-border-subtle"
          }`}
        >
          {included ? <Check className="size-3.5" aria-hidden /> : null}
        </button>

        <button
          type="button"
          onClick={onExpand}
          aria-expanded={expanded}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[14px] font-semibold text-ink">
              {debt.creditorName}
              {debt.last4 ? <span className="font-normal text-text-secondary"> ****{debt.last4}</span> : null}
            </p>
            <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink">{money(debt.balance)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger-ink">
              {CREDIT_NEGATIVE_TYPE_LABELS[debt.type] ?? debt.type}
            </span>
            <span className="inline-flex items-center gap-1 px-1" aria-label="Burós que la reportan">
              {BUREAUS.map((bureau) => (
                <span
                  key={bureau}
                  title={`${CREDIT_BUREAU_LABELS[bureau] ?? bureau}${reported.has(bureau) ? "" : ": no la reporta"}`}
                  className="size-2 rounded-full"
                  style={{
                    background: reported.has(bureau) ? BUREAU_COLOR[bureau] : "transparent",
                    boxShadow: reported.has(bureau) ? undefined : `inset 0 0 0 1px ${BUREAU_COLOR[bureau]}`,
                  }}
                />
              ))}
            </span>
            {strong.map((r) => (
              <span key={r.code} className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning-ink">
                {r.title}
              </span>
            ))}
            {interview.answer ? (
              <span className="rounded-full bg-nav-hover px-2 py-0.5 text-[11px] font-medium text-ink">
                Cliente: {CLIENT_ANSWER_LABELS[interview.answer]}
              </span>
            ) : null}
            {blocked && blocked !== "Servicio cerrado" ? (
              <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info-ink">{blocked}</span>
            ) : null}
          </div>
        </button>

        <button
          type="button"
          onClick={onExpand}
          aria-label={expanded ? "Ocultar detalle" : "Ver detalle"}
          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-control text-text-secondary hover:bg-nav-hover"
        >
          <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </div>

      {expanded ? (
        <div className="space-y-4 px-3 pb-4 pt-1 sm:pl-11">
          <Section step={1} title="Qué reporta cada buró">
            <ul className="divide-y divide-border-subtle/50 rounded-control bg-surface-panel">
              {debt.rows.map((row) => {
                const rowIncluded = pick?.itemIds.includes(row.itemId) ?? false;
                return (
                  <li key={row.itemId}>
                    <label className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2.5 py-1.5 text-[12px]">
                      <input
                        type="checkbox"
                        checked={rowIncluded}
                        disabled={disabled}
                        onChange={() =>
                          onChange({
                            itemIds: rowIncluded
                              ? (pick?.itemIds ?? []).filter((id) => id !== row.itemId)
                              : [...(pick?.itemIds ?? []), row.itemId],
                            reasons,
                          })
                        }
                      />
                      <span className="inline-flex w-24 items-center gap-1.5 font-medium text-ink">
                        <span className="size-2 rounded-full" style={{ background: BUREAU_COLOR[row.bureau] }} aria-hidden />
                        {CREDIT_BUREAU_LABELS[row.bureau] ?? row.bureau}
                      </span>
                      <span className="min-w-0 flex-1 text-text-secondary">{row.status ?? "Estado sin dato"}</span>
                      <span className="text-text-secondary">
                        {row.dateOpened ? `Abierta ${formatDate(row.dateOpened)}` : "Apertura sin dato"}
                      </span>
                      <span className="w-20 text-right font-medium tabular-nums text-ink">{money(row.balance)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {debt.fields.length > 0 ? <FieldComparison debt={debt} /> : null}
          </Section>

          <Section step={2} title="Qué dice el cliente">
            <Interview clientId={clientId} debt={debt} value={interview} onSaved={onInterviewSaved} />
          </Section>

          <Section step={3} title="Motivos para la carta">
            <div className="flex flex-wrap gap-1.5" aria-label="Motivos de disputa">
              {ALL_REASONS.map((code) => {
                const on = reasons.includes(code);
                const hint = debt.reasons.find((r) => r.code === code)?.detail;
                if (!on && !suggested.has(code) && code !== "VERIFY") return null;
                return (
                  <button
                    key={code}
                    type="button"
                    title={hint}
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => onChange({ reasons: on ? reasons.filter((r) => r !== code) : [...reasons, code] })}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                      on ? "bg-warning-soft text-warning-ink" : "bg-surface-panel text-text-secondary hover:bg-nav-hover"
                    }`}
                  >
                    {on ? <Check className="size-3" aria-hidden /> : null}
                    {REASON_TITLES[code]}
                  </button>
                );
              })}
            </div>
            {debt.reasons.length > 0 ? (
              <ul className="mt-2 space-y-1 text-[11.5px] text-text-secondary">
                {debt.reasons.map((r) => (
                  <li key={r.code} className="flex gap-1.5">
                    <FileWarning className="mt-0.5 size-3 shrink-0" aria-hidden />
                    <span>{r.detail}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {suggested.has("INCONSISTENT") ? (
              <p className="mt-1.5 text-[11px] text-text-secondary">{ANOMALY_NOT_INACCURACY}</p>
            ) : null}
          </Section>
        </div>
      ) : null}
    </article>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-ink">
        <span className="grid size-4 place-items-center rounded-full bg-nav-hover text-[10px]">{step}</span>
        {title}
      </h4>
      {children}
    </section>
  );
}

function Interview({
  clientId,
  debt,
  value,
  onSaved,
}: {
  clientId: string;
  debt: NegativeReviewDebt;
  value: InterviewValue;
  onSaved: (value: InterviewValue) => void;
}) {
  const [answer, setAnswer] = useState<ClientAnswer | null>(value.answer);
  const [words, setWords] = useState(value.words ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedWords = useRef(value.words ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(nextAnswer: ClientAnswer | null, nextWords: string) {
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    const res = await saveNegativeInterviewAction({
      clientId,
      itemIds: debt.rows.map((r) => r.itemId),
      answer: nextAnswer,
      words: nextWords.trim() ? nextWords : null,
    });
    setStatus(res.ok ? "saved" : "error");
    if (res.ok) {
      savedWords.current = nextWords;
      onSaved({ answer: nextAnswer, words: nextWords.trim() ? nextWords : null });
    }
  }

  // Si la tarjeta se cierra antes del guardado diferido, guarda lo escrito.
  const latest = useRef({ answer, words });
  useEffect(() => {
    latest.current = { answer, words };
  }, [answer, words]);
  useEffect(
    () => () => {
      if (latest.current.words !== savedWords.current) {
        void saveNegativeInterviewAction({
          clientId,
          itemIds: debt.rows.map((r) => r.itemId),
          answer: latest.current.answer,
          words: latest.current.words.trim() ? latest.current.words : null,
        });
        onSaved({ answer: latest.current.answer, words: latest.current.words.trim() ? latest.current.words : null });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Guarda las palabras solo al dejar de escribir.
  useEffect(() => {
    if (words === savedWords.current) return;
    timer.current = setTimeout(() => void save(answer, words), 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  return (
    <fieldset className="space-y-2 rounded-control bg-surface-panel px-3 py-2.5">
      <legend className="sr-only">Entrevista al cliente</legend>
      <p className="text-[12px] font-medium text-ink">¿El dato reportado es correcto?</p>
      <div className="flex flex-wrap gap-1.5">
        {ANSWERS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={answer === option}
            onClick={() => {
              const next = answer === option ? null : option;
              setAnswer(next);
              void save(next, words);
            }}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              answer === option
                ? "bg-action-primary text-action-primary-foreground"
                : "bg-surface-app text-text-secondary hover:bg-nav-hover"
            }`}
          >
            {CLIENT_ANSWER_LABELS[option]}
          </button>
        ))}
      </div>
      {answer === "CORRECT" ? (
        <p className="text-[11.5px] text-warning-ink">
          Si el cliente reconoce el dato como correcto, no se disputa: la ley no permite disputar información exacta.
        </p>
      ) : null}
      <label className="block text-[11.5px] text-text-secondary">
        Palabras del cliente
        <textarea
          value={words}
          onChange={(event) => setWords(event.target.value)}
          onBlur={() => {
            if (words !== savedWords.current) void save(answer, words);
          }}
          rows={2}
          placeholder="Ej. Nunca abrí esta cuenta / La pagué en 2023"
          className="mt-1 w-full rounded-control bg-surface-app px-3 py-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
        />
      </label>
      <p className="text-[11px] text-text-secondary" aria-live="polite">
        {status === "saving"
          ? "Guardando…"
          : status === "saved"
            ? "Guardado. Se usa como motivo en la carta."
            : status === "error"
              ? "No se pudo guardar."
              : "No crea una disputa. Se guarda para usarla en la carta."}
      </p>
    </fieldset>
  );
}

function FieldComparison({ debt }: { debt: NegativeReviewDebt }) {
  const [open, setOpen] = useState(false);
  const bureaus = debt.rows.map((row) => row.bureau);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="text-[12px] font-medium text-action-primary"
      >
        {open ? "Ocultar comparación" : "Comparar campo por campo"}
        {debt.differences > 0 ? (
          <span className="ml-1.5 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-warning-ink">
            {plural(debt.differences, "diferencia")}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="mt-1.5 overflow-x-auto rounded-control bg-surface-panel">
          <table className="w-full text-left text-[11.5px]">
            <thead className="bg-surface-app text-text-secondary">
              <tr>
                <th className="px-2 py-1.5 font-medium">Campo</th>
                {bureaus.map((bureau, index) => (
                  <th key={`${bureau}-${index}`} className="px-2 py-1.5 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: BUREAU_COLOR[bureau] }} aria-hidden />
                      {CREDIT_BUREAU_LABELS[bureau] ?? bureau}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {debt.fields.map((field) => (
                <tr key={field.label} className={`border-t border-border-subtle/60 ${field.differs ? "bg-warning-soft" : ""}`}>
                  <td className="px-2 py-1 font-medium text-ink">
                    {field.differs ? "⚠ " : ""}
                    {field.label}
                  </td>
                  {field.values.map((cell, index) => (
                    <td key={`${cell.bureau}-${index}`} className="px-2 py-1 text-text-secondary">
                      {cell.value ?? "N/A"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-2 py-1.5 text-[11px] text-text-secondary">
            Solo se marca cuando dos burós reportan valores distintos; un dato ausente (N/A) no cuenta.
          </p>
        </div>
      ) : null}
    </div>
  );
}
