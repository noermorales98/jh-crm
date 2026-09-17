"use client";

import { useState } from "react";
import type { CreditBureau } from "@prisma/client";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";

export type ScoreHistoryPoint = {
  label: string;
  reportDate: string;
  scores: Record<CreditBureau, number | null>;
  reportId?: string;
};

export type ScorePointEvent = {
  bureau: CreditBureau;
  index: number;
  reportId?: string;
  label: string;
  reportDate: string;
  score: number;
  previousScore: number | null;
  delta: number | null;
};

const SERIES: { bureau: CreditBureau; color: string }[] = [
  { bureau: "EXPERIAN", color: "var(--color-action-primary)" },
  { bureau: "EQUIFAX", color: "var(--color-success-ink)" },
  { bureau: "TRANSUNION", color: "var(--color-warning-ink)" },
];

/**
 * Gráfico SVG de evolución de scores.
 * Con `interactive`, emite hover/click con datos del punto (sin fetch).
 */
export function ScoreEvolutionChart({
  history,
  compact = false,
  interactive = false,
  fillDesktop = false,
  onPointHover,
  onPointClick,
}: {
  history: ScoreHistoryPoint[];
  compact?: boolean;
  interactive?: boolean;
  /** En desktop usa todo el ancho del contenedor (sin max-w-3xl). */
  fillDesktop?: boolean;
  onPointHover?: (point: ScorePointEvent | null) => void;
  onPointClick?: (point: ScorePointEvent) => void;
}) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const width = 640;
  const height = compact ? 132 : 220;
  const padX = compact ? 28 : 36;
  const padY = compact ? 14 : 24;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const strokeW = compact ? 2 : 2.5;
  const pointR = compact ? 2.5 : 3.5;
  const fontSize = compact ? 9 : 10;

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

  function eventAt(bureau: CreditBureau, i: number): ScorePointEvent | null {
    const h = history[i];
    if (!h) return null;
    const score = h.scores[bureau];
    if (score == null) return null;
    let previousScore: number | null = null;
    for (let j = i - 1; j >= 0; j -= 1) {
      const prev = history[j]?.scores[bureau];
      if (prev != null) {
        previousScore = prev;
        break;
      }
    }
    return {
      bureau,
      index: i,
      reportId: h.reportId,
      label: h.label,
      reportDate: h.reportDate,
      score,
      previousScore,
      delta: previousScore != null ? score - previousScore : null,
    };
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`h-auto w-full min-w-[280px] ${
          compact || fillDesktop ? "max-w-full" : "max-w-3xl"
        }`}
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
                x={padX - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-text-secondary"
                fontSize={fontSize}
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
          return (
            <g key={bureau}>
              {pts.length >= 2 ? (
                <polyline
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeW}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={pts.join(" ")}
                />
              ) : null}
              {history.map((h, i) => {
                const score = h.scores[bureau];
                if (score == null) return null;
                const key = `${bureau}-${i}`;
                const active = hoverKey === key;
                return (
                  <g key={key}>
                    {interactive ? (
                      <circle
                        cx={xAt(i)}
                        cy={yAt(score)}
                        r={10}
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() => {
                          setHoverKey(key);
                          onPointHover?.(eventAt(bureau, i));
                        }}
                        onMouseLeave={() => {
                          setHoverKey(null);
                          onPointHover?.(null);
                        }}
                        onClick={() => {
                          const ev = eventAt(bureau, i);
                          if (ev) onPointClick?.(ev);
                        }}
                      />
                    ) : null}
                    <circle
                      cx={xAt(i)}
                      cy={yAt(score)}
                      r={active ? pointR + 1.5 : pointR}
                      fill={color}
                      className={interactive ? "pointer-events-none" : undefined}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}

        {history.map((h, i) => (
          <text
            key={h.reportDate + i}
            x={xAt(i)}
            y={height - 4}
            textAnchor="middle"
            className="fill-text-secondary"
            fontSize={fontSize}
          >
            {h.label}
          </text>
        ))}
      </svg>
      <ul
        className={`flex flex-wrap gap-3 text-xs text-text-secondary ${
          compact ? "mt-1.5" : "mt-3 gap-4"
        }`}
      >
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
