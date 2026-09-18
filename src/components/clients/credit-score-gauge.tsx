"use client";

import { ScoreDelta } from "@/src/components/credit-reports/bureau-score-strip";

const MIN_SCORE = 300;
const MAX_SCORE = 850;

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) {
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

/**
 * Medidor semicircular de score de crédito (300–850).
 * Estética limpia con arco azul de marca sobre pista gris.
 */
export function CreditScoreGauge({
  score,
  label = "Score",
  delta,
  size = "md",
  className = "",
}: {
  score: number | null;
  label?: string;
  delta?: number | null;
  size?: "md" | "sm";
  className?: string;
}) {
  const isSm = size === "sm";
  const cx = 100;
  const cy = isSm ? 88 : 92;
  const r = isSm ? 58 : 74;
  const stroke = isSm ? 9 : 11;
  const startAngle = 180;
  const endAngle = 0;
  const arcPath = describeArc(cx, cy, r, startAngle, endAngle);
  const arcLength = Math.PI * r;

  const progress =
    score != null
      ? Math.min(1, Math.max(0, (score - MIN_SCORE) / (MAX_SCORE - MIN_SCORE)))
      : 0;
  const dashOffset = arcLength * (1 - progress);

  return (
    <div
      className={`flex flex-col items-center ${className}`}
      role="img"
      aria-label={
        score != null
          ? `${label}: ${score} de ${MAX_SCORE}`
          : `${label}: sin dato`
      }
    >
      <div className={`relative w-full ${isSm ? "max-w-[6.5rem]" : "max-w-[11rem]"}`}>
        <svg
          viewBox={isSm ? "0 0 200 96" : "0 0 200 108"}
          className="w-full"
          aria-hidden
        >
          <path
            d={arcPath}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            className="text-border-subtle"
          />
          {score != null ? (
            <path
              d={arcPath}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={arcLength}
              strokeDashoffset={dashOffset}
              className="text-action-primary transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
            />
          ) : null}
        </svg>

        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-0.5">
          <span
            className={`font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink ${
              isSm ? "text-lg" : "text-[2rem]"
            }`}
          >
            {score ?? "—"}
          </span>
          {!isSm && delta != null ? (
            <span className="mt-1 text-sm">
              <ScoreDelta value={delta} />
            </span>
          ) : null}
        </div>
      </div>

      <p
        className={`mt-1 font-medium uppercase tracking-wide text-text-secondary ${
          isSm ? "text-[10px]" : "text-[11px]"
        }`}
      >
        {label}
      </p>
      {isSm && delta != null ? (
        <span className="mt-0.5 text-[11px]">
          <ScoreDelta value={delta} />
        </span>
      ) : null}
      {!isSm ? (
        <p className="mt-0.5 flex w-full max-w-[11rem] justify-between text-[10px] tabular-nums text-text-placeholder">
          <span>{MIN_SCORE}</span>
          <span>{MAX_SCORE}</span>
        </p>
      ) : null}
    </div>
  );
}
