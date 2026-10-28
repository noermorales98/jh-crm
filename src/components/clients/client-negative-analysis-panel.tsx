"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileWarning } from "lucide-react";
import {
  createRoundFromNegativesAction,
  loadNegativeReview,
  saveNegativeInterviewAction,
} from "@/src/actions/negative-review";
import type { NegativeReview, NegativeReviewDebt } from "@/src/server/credit-reports/negative-review";
import {
  CLIENT_ANSWER_LABELS,
  REASON_TITLES,
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

const ALL_REASONS: ReasonCode[] = ["INCONSISTENT", "DUPLICATE", "INCOMPLETE", "OBSOLETE", "VERIFY"];
const ANSWERS: ClientAnswer[] = ["NOT_MINE", "PAID", "WRONG_DATA", "CORRECT", "UNKNOWN"];

function money(amount: number | null) {
  return metricText(presentAmount({ amount, currency: null, status: amount == null ? "UNKNOWN" : "KNOWN" }));
}

type Pick = { itemIds: string[]; reasons: ReasonCode[] };

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [creating, startCreate] = useTransition();
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadNegativeReview({ clientId, reportId }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) setReview(res.data);
      else setError(res.error);
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
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-surface bg-nav-hover" />
        ))}
      </div>
    );
  }
  if (error) return <p className="text-center text-sm text-danger-ink">{error}</p>;
  if (!review || review.debts.length === 0) {
    return (
      <p className="rounded-surface bg-nav-hover/50 px-4 py-6 text-center text-[13px] text-text-secondary">
        {review ? "El último reporte no tiene cuentas negativas por revisar." : NEGATIVES_NOT_CERTIFIED}
      </p>
    );
  }

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

  function createRound() {
    if (!review) return;
    startCreate(async () => {
      const res = await createRoundFromNegativesAction({
        clientId,
        reportId: review.reportId,
        selections: selected.map(([, p]) => p),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCreated(
        `Ronda ${res.data.roundNumber} creada: ${res.data.disputes} disputa${res.data.disputes === 1 ? "" : "s"} y ${res.data.letters} carta${res.data.letters === 1 ? "" : "s"} listas para revisar.`,
      );
      router.push(`/crm/clientes/${clientId}?panel=avance&roundId=${res.data.roundId}`);
      router.refresh();
    });
  }

  const typeCounts = review.debts.reduce<Record<string, number>>((acc, d) => {
    acc[d.type] = (acc[d.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4 pb-20">
      <div className="text-center">
        <p className="text-[12px] text-text-secondary">
          {review.clientName} · reporte del {formatDate(review.reportDate)}
        </p>
        <p className="mt-1 text-[28px] font-semibold tabular-nums text-danger-ink">{review.debts.length}</p>
        <p className="text-[12px] text-text-secondary">
          deudas negativas ({review.debts.reduce((s, d) => s + d.rows.length, 0)} reportes en {review.totalItems} cuentas)
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {Object.entries(typeCounts).map(([type, count]) => (
            <span key={type} className="rounded-full bg-nav-hover px-2.5 py-0.5 text-[11px] font-medium text-ink">
              {CREDIT_NEGATIVE_TYPE_LABELS[type] ?? type}: {count}
            </span>
          ))}
        </div>
        {!review.caseOpen ? (
          <p className="mt-2 text-[12px] text-warning-ink">
            El servicio de crédito está cerrado: puedes revisar, pero no crear rondas.
          </p>
        ) : null}
      </div>

      {review.debts.map((debt) => (
        <DebtCard
          key={debt.key}
          clientId={clientId}
          debt={debt}
          pick={picks[debt.key]}
          disabled={!review.caseOpen || debt.inOpenRound}
          onToggle={() => toggleDebt(debt)}
          onChange={(next) => updatePick(debt, next)}
        />
      ))}

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-surface bg-surface-elevated px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] ring-1 ring-border-subtle">
        <p className="text-[13px] text-text-secondary">
          {created ??
            (selected.length === 0
              ? "Elige las deudas a disputar."
              : `${selected.length} deuda${selected.length === 1 ? "" : "s"} · ${disputeCount} disputa${disputeCount === 1 ? "" : "s"} · ${letterCount} carta${letterCount === 1 ? "" : "s"}`)}
        </p>
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
  );
}

function DebtCard({
  clientId,
  debt,
  pick,
  disabled,
  onToggle,
  onChange,
}: {
  clientId: string;
  debt: NegativeReviewDebt;
  pick: Pick | undefined;
  disabled: boolean;
  onToggle: () => void;
  onChange: (next: Partial<Pick>) => void;
}) {
  const included = (pick?.itemIds.length ?? 0) > 0;
  const reasons = pick?.reasons ?? debt.reasons.map((r) => r.code);
  const suggested = new Set(debt.reasons.map((r) => r.code));

  return (
    <article
      className={`rounded-surface p-3 ring-1 transition-colors ${
        included ? "bg-nav-active/40 ring-action-primary/40" : "bg-surface-panel ring-border-subtle"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={included}
          aria-label={`Disputar ${debt.creditorName}`}
          disabled={disabled}
          onClick={onToggle}
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-[5px] ring-1 transition-colors disabled:opacity-40 ${
            included ? "bg-action-primary text-action-primary-foreground ring-action-primary" : "ring-border-subtle"
          }`}
        >
          {included ? <Check className="size-3.5" aria-hidden /> : null}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="truncate text-[14px] font-semibold text-ink">
              {debt.creditorName}
              {debt.last4 ? <span className="font-normal text-text-secondary"> ****{debt.last4}</span> : null}
            </p>
            <span className="text-[13px] font-semibold tabular-nums text-ink">{money(debt.balance)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger-ink">
              {CREDIT_NEGATIVE_TYPE_LABELS[debt.type] ?? debt.type}
            </span>
            {debt.inOpenRound ? (
              <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info-ink">
                Ya está en una ronda abierta
              </span>
            ) : null}
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <tbody>
                {debt.rows.map((row) => {
                  const rowIncluded = pick?.itemIds.includes(row.itemId) ?? false;
                  return (
                    <tr key={row.itemId} className="border-t border-border-subtle/60">
                      <td className="py-1 pr-2">
                        <label className="inline-flex items-center gap-1.5">
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
                          <span className="size-2 rounded-full" style={{ background: BUREAU_COLOR[row.bureau] }} aria-hidden />
                          <span className="font-medium text-ink">{CREDIT_BUREAU_LABELS[row.bureau] ?? row.bureau}</span>
                        </label>
                      </td>
                      <td className="py-1 pr-2 text-text-secondary">{row.status ?? "Estado sin dato"}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-text-secondary">{money(row.balance)}</td>
                      <td className="py-1 text-right text-text-secondary">
                        {row.dateOpened ? `Abierta ${formatDate(row.dateOpened)}` : "Apertura sin dato"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Motivos de disputa">
            {ALL_REASONS.map((code) => {
              const on = reasons.includes(code);
              const hint = debt.reasons.find((r) => r.code === code)?.detail;
              if (!on && !suggested.has(code) && code !== "VERIFY") return null;
              return (
                <button
                  key={code}
                  type="button"
                  title={hint}
                  disabled={disabled}
                  onClick={() =>
                    onChange({ reasons: on ? reasons.filter((r) => r !== code) : [...reasons, code] })
                  }
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                    on ? "bg-warning-soft text-warning-ink" : "text-text-secondary ring-1 ring-border-subtle hover:bg-nav-hover"
                  }`}
                >
                  {REASON_TITLES[code]}
                </button>
              );
            })}
          </div>
          {debt.reasons.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-text-secondary">
              {debt.reasons.map((r) => (
                <li key={r.code} className="flex gap-1.5">
                  <FileWarning className="mt-0.5 size-3 shrink-0" aria-hidden />
                  <span>{r.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {suggested.has("INCONSISTENT") ? (
            <p className="mt-1 text-[11px] text-text-secondary">{ANOMALY_NOT_INACCURACY}</p>
          ) : null}

          <Interview clientId={clientId} debt={debt} />
        </div>
      </div>
    </article>
  );
}

function Interview({
  clientId,
  debt,
}: {
  clientId: string;
  debt: NegativeReviewDebt;
}) {
  const [answer, setAnswer] = useState<ClientAnswer | null>(debt.interview.answer);
  const [words, setWords] = useState(debt.interview.words ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(nextAnswer: ClientAnswer | null, nextWords: string) {
    setStatus("saving");
    const res = await saveNegativeInterviewAction({
      clientId,
      itemIds: debt.rows.map((r) => r.itemId),
      answer: nextAnswer,
      words: nextWords.trim() ? nextWords : null,
    });
    setStatus(res.ok ? "saved" : "error");
  }

  return (
    <fieldset className="mt-3 space-y-2 rounded-control bg-surface-app px-3 py-2">
      <legend className="sr-only">Entrevista al cliente</legend>
      <p className="text-[12px] font-medium text-ink">¿El dato reportado es correcto?</p>
      <div className="flex flex-wrap gap-1.5">
        {ANSWERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              const next = answer === option ? null : option;
              setAnswer(next);
              void save(next, words);
            }}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              answer === option ? "bg-action-primary text-action-primary-foreground" : "text-text-secondary ring-1 ring-border-subtle hover:bg-nav-hover"
            }`}
          >
            {CLIENT_ANSWER_LABELS[option]}
          </button>
        ))}
      </div>
      <label className="block text-[11.5px] text-text-secondary">
        Palabras del cliente
        <textarea
          value={words}
          onChange={(event) => setWords(event.target.value)}
          onBlur={() => {
            if (words !== (debt.interview.words ?? "")) void save(answer, words);
          }}
          rows={2}
          placeholder="Ej. Nunca abrí esta cuenta / La pagué en 2023"
          className="mt-1 w-full rounded-control bg-surface-panel px-3 py-2 text-[13px] text-ink ring-1 ring-border-subtle"
        />
      </label>
      <p className="text-[11px] text-text-secondary">
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
