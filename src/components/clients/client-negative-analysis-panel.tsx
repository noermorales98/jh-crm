"use client";

import { useEffect, useState } from "react";
import {
  loadClientNegativeAnalysis,
  type ClientNegativeAnalysisDto,
} from "@/src/actions/credit-reports";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";
import {
  ANOMALY_NOT_INACCURACY,
  NEGATIVES_NONE_LISTED,
  NEGATIVES_NOT_CERTIFIED,
} from "@/src/lib/credit/anomalies";
import { formatScorePlanMoney } from "@/src/lib/credit/score-plan";
import {
  assessAssertion,
  type AssertionAnswer,
} from "@/src/lib/credit/assertions";

export function ClientNegativeAnalysisPanel({
  clientId,
  reportId,
}: {
  clientId: string;
  reportId: string | null;
}) {
  const [analysis, setAnalysis] = useState<ClientNegativeAnalysisDto | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadClientNegativeAnalysis({ clientId, reportId }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        setAnalysis(null);
        return;
      }
      setAnalysis(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, reportId]);

  if (loading) {
    return (
      <p className="rounded-surface bg-nav-hover/50 px-4 py-6 text-center text-[13px] text-text-secondary">
        Cargando análisis…
      </p>
    );
  }

  if (error) {
    return <p className="text-center text-sm text-danger">{error}</p>;
  }

  if (!analysis) {
    return (
      <p className="rounded-surface bg-nav-hover/50 px-4 py-6 text-center text-[13px] text-text-secondary">
        {NEGATIVES_NOT_CERTIFIED}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-[12px] text-text-secondary">
          {analysis.clientName} · análisis del reporte
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-4">
          <div>
            <p className="text-[28px] font-semibold tabular-nums text-danger-ink">
              {analysis.negativeCount}
            </p>
            <p className="text-[12px] text-text-secondary">cuentas negativas</p>
          </div>
          <div>
            <p className="text-[28px] font-semibold tabular-nums text-ink">
              {analysis.totalItems}
            </p>
            <p className="text-[12px] text-text-secondary">cuentas en total</p>
          </div>
        </div>
        {analysis.negativeCount === 0 ? (
          <p className="mt-3 text-[13px] text-text-secondary">
            {analysis.negativeReading === "NONE_LISTED"
              ? NEGATIVES_NONE_LISTED
              : NEGATIVES_NOT_CERTIFIED}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {analysis.groups.map((g) => (
              <span
                key={g.key}
                className="rounded-full bg-nav-hover px-3 py-1 text-[11px] font-medium text-ink"
              >
                {g.title}: {g.count}
              </span>
            ))}
          </div>
        )}
      </div>

      {analysis.negativeCount > 0
        ? analysis.groups.map((g) => (
        <section
          key={g.key}
          className="rounded-surface bg-nav-hover/40 px-3 py-3 text-left"
        >
          <h3 className="text-[14px] font-semibold text-ink">
            {g.title}{" "}
            <span className="text-text-secondary">· {g.count}</span>
          </h3>
          <p className="mt-1 text-[12px] text-text-secondary">{g.description}</p>
          <ul className="mt-2 space-y-2">
            {g.items.map((item) => (
              <li
                key={item.id}
                className="rounded-control bg-surface-panel px-3 py-2 text-[13px]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-medium text-ink">
                      {item.creditorName}
                    </span>
                    <span className="mt-0.5 block text-[11px] uppercase text-text-secondary">
                      {item.label}
                    </span>
                  </span>
                  <span className="text-[11px] font-medium text-text-secondary">
                    {(CREDIT_BUREAU_LABELS[item.bureau] ?? item.bureau).slice(
                      0,
                      2,
                    )}
                  </span>
                </div>
                <AssertionInterview
                  itemId={item.id}
                  bureau={item.bureau}
                  reported={item.label}
                />
              </li>
            ))}
          </ul>
        </section>
      ))
        : null}
      {analysis.anomalies.length > 0 ? (
        <section className="rounded-surface bg-nav-hover/40 px-3 py-3 text-left">
          <h3 className="text-[14px] font-semibold text-ink">Diferencias entre burós</h3>
          <p className="mt-1 text-[12px] text-text-secondary">{ANOMALY_NOT_INACCURACY}</p>
          <ul className="mt-2 space-y-2">
            {analysis.anomalies.map((anomaly) => (
              <li
                key={`${anomaly.canonicalId}-${anomaly.field}`}
                className="rounded-control bg-surface-panel px-3 py-2 text-[13px]"
              >
                <p className="font-medium text-ink">{anomaly.creditorName}</p>
                <p className="mt-0.5 text-text-secondary">
                  {anomaly.field === "balance"
                    ? "Saldo"
                    : anomaly.field === "paymentStatus"
                      ? "Historial"
                      : "Responsabilidad"}
                  {" · "}
                  {anomaly.temporalComparability === "COMPARABLE"
                    ? "mismo mes"
                    : anomaly.temporalComparability === "DIFFERENT_DATES"
                      ? "meses distintos"
                      : "fecha desconocida"}
                  {anomaly.describedDeltaCents != null
                    ? ` · diferencia $${formatScorePlanMoney(anomaly.describedDeltaCents / 100)}`
                    : ""}
                </p>
                <p className="mt-0.5 text-[11px] text-text-secondary">
                  {anomaly.values.join(" · ")}
                  {anomaly.dates.some((date) => date != null)
                    ? ` · ${anomaly.dates.filter((date): date is string => date != null).join(", ")}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

const ANSWER_LABEL: Record<AssertionAnswer, string> = {
  CORRECT: "Sí",
  INCORRECT: "No",
  UNKNOWN: "No sé",
};

const STATE_LABEL = {
  DRAFT: "Borrador",
  CLIENT_CONFIRMED: "Confirmado por el cliente",
  LETTER_READY: "Listo para borrador de carta",
  CLOSED_NO_ACTION: "Cerrado, sin acción",
} as const;

function AssertionInterview({
  itemId,
  bureau,
  reported,
}: {
  itemId: string;
  bureau: string;
  reported: string;
}) {
  const [answer, setAnswer] = useState<AssertionAnswer | null>(null);
  const [claim, setClaim] = useState("");
  const assessment = assessAssertion({
    creditItemId: itemId,
    field: "negativeType",
    bureau,
    reportedValue: reported,
    consumerClaim: claim.trim() === "" ? null : claim.trim(),
    answer,
    evidenceDocumentIds: [],
    documents: [],
    clientId: "local",
    organizationId: "local",
    expectedRevision: 1,
    currentRevision: 1,
    clientActorId: "client",
    reviewerId: null,
  });
  return (
    <fieldset className="mt-2 space-y-2 border-0 p-0">
      <legend className="text-[12px] text-text-secondary">
        ¿El dato reportado es correcto?
      </legend>
      <div className="flex flex-wrap gap-3">
        {(Object.keys(ANSWER_LABEL) as AssertionAnswer[]).map((option) => (
          <label key={option} className="inline-flex items-center gap-1">
            <input
              type="radio"
              name={`assertion-${itemId}`}
              value={option}
              checked={answer === option}
              onChange={() => setAnswer(option)}
            />
            {ANSWER_LABEL[option]}
          </label>
        ))}
      </div>
      <label className="block text-[12px] text-text-secondary">
        Palabras del cliente
        <textarea
          value={claim}
          onChange={(event) => setClaim(event.target.value)}
          rows={2}
          className="mt-1 w-full rounded-control bg-surface-app px-3 py-2 text-[13px] text-ink"
        />
      </label>
      <p className="text-[12px] text-text-secondary">
        {STATE_LABEL[assessment.state]}. No crea una disputa.
      </p>
    </fieldset>
  );
}
