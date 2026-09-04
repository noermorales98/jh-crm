"use client";

import type { CreditBureau } from "@prisma/client";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";

export type ScoreHistoryPoint = {
  label: string;
  reportDate: string;
  scores: Record<CreditBureau, number | null>;
};

const SERIES: { bureau: CreditBureau; color: string }[] = [
  { bureau: "EXPERIAN", color: "var(--color-action-primary, #4f46e5)" },
  { bureau: "EQUIFAX", color: "var(--color-success-ink, #15803d)" },
  { bureau: "TRANSUNION", color: "var(--color-warning-ink, #b45309)" },
];

/**
 * Gráfico SVG simple de evolución de scores (sin dependencia externa).
 */
export function ScoreEvolutionChart({ history }: { history: ScoreHistoryPoint[] }) {
  const width = 640;
  const height = 220;
  const padX = 36;
  const padY = 24;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const values = history.flatMap((h) =>
    SERIES.map((s) => h.scores[s.bureau]).filter((v): v is number => v != null),
  );
  if (values.length === 0 || history.length === 0) return null;

  const min = Math.max(300, Math.min(...values) - 20);
  const max = Math.min(900, Math.max(...values) + 20);
  const range = Math.max(1, max - min);
  const n = history.length;

  function xAt(i: number) {
    if (n === 1) return padX + plotW / 2;
    return padX + (i / (n - 1)) * plotW;
  }
  function yAt(score: number) {
    return padY + plotH - ((score - min) / range) * plotH;
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[320px] max-w-3xl"
        role="img"
        aria-label="Evolución de puntajes por buró"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padY + plotH * (1 - t);
          const val = Math.round(min + range * t);
          return (
            <g key={t}>
              <line
                x1={padX}
                x2={width - padX}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.12}
              />
              <text
                x={padX - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-text-secondary"
                fontSize={10}
              >
                {val}
              </text>
            </g>
          );
        })}

        {SERIES.map(({ bureau, color }) => {
          const pts = history
            .map((h, i) => {
              const score = h.scores[bureau];
              if (score == null) return null;
              return `${xAt(i)},${yAt(score)}`;
            })
            .filter(Boolean);
          if (pts.length < 2) {
            const single = history
              .map((h, i) => {
                const score = h.scores[bureau];
                if (score == null) return null;
                return { x: xAt(i), y: yAt(score) };
              })
              .find(Boolean);
            if (!single) return null;
            return (
              <circle
                key={bureau}
                cx={single.x}
                cy={single.y}
                r={4}
                fill={color}
              />
            );
          }
          return (
            <g key={bureau}>
              <polyline
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={pts.join(" ")}
              />
              {history.map((h, i) => {
                const score = h.scores[bureau];
                if (score == null) return null;
                return (
                  <circle
                    key={`${bureau}-${i}`}
                    cx={xAt(i)}
                    cy={yAt(score)}
                    r={3.5}
                    fill={color}
                  />
                );
              })}
            </g>
          );
        })}

        {history.map((h, i) => (
          <text
            key={h.reportDate + i}
            x={xAt(i)}
            y={height - 6}
            textAnchor="middle"
            className="fill-text-secondary"
            fontSize={10}
          >
            {h.label}
          </text>
        ))}
      </svg>
      <ul className="mt-3 flex flex-wrap gap-4 text-xs text-text-secondary">
        {SERIES.map(({ bureau, color }) => (
          <li key={bureau} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            {CREDIT_BUREAU_LABELS[bureau]}
          </li>
        ))}
      </ul>
    </div>
  );
}
