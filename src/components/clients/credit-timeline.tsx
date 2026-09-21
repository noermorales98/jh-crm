"use client";

import { useMemo, useState } from "react";
import type { ClientOverviewRound } from "@/src/server/clients/overview";
import type { ScoreHistoryPointDto } from "@/src/server/clients/overview";
import { formatDate } from "@/src/lib/format";
import { RoundPeekModal } from "@/src/components/clients/round-peek-modal";
import { ReportPeekModal } from "@/src/components/clients/report-peek-modal";

type TimelineEvent = {
  id: string;
  at: Date;
  kind: "report" | "round_sent" | "round_reviewed";
  label: string;
  reportId?: string;
  roundId?: string;
};

/**
 * Timeline crediticia interactiva del hub Client 360.
 * Hover = detalle local; click = peek (reporte o ronda).
 */
export function CreditTimeline({
  scoreHistory,
  rounds,
  caseId,
  selectedReportId = null,
  onSelectReport,
}: {
  scoreHistory: ScoreHistoryPointDto[];
  rounds: ClientOverviewRound[];
  caseId: string;
  selectedReportId?: string | null;
  onSelectReport?: (reportId: string | null) => void;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [peekReportId, setPeekReportId] = useState<string | null>(null);
  const [peekRoundId, setPeekRoundId] = useState<string | null>(null);

  const events = useMemo(() => {
    const list: TimelineEvent[] = [];
    for (const h of scoreHistory) {
      list.push({
        id: `report-${h.reportId}`,
        at: new Date(h.reportDate),
        kind: "report",
        label: h.label,
        reportId: h.reportId,
      });
    }
    for (const r of rounds) {
      if (r.sentAt) {
        list.push({
          id: `sent-${r.id}`,
          at: r.sentAt,
          kind: "round_sent",
          label: `Ronda #${r.roundNumber} enviada`,
          roundId: r.id,
        });
      }
      if (r.reviewedAt) {
        list.push({
          id: `reviewed-${r.id}`,
          at: r.reviewedAt,
          kind: "round_reviewed",
          label: `Ronda #${r.roundNumber} revisada`,
          roundId: r.id,
        });
      }
    }
    list.sort((a, b) => a.at.getTime() - b.at.getTime());
    return list.slice(-8);
  }, [scoreHistory, rounds]);

  if (events.length < 2) return null;

  return (
    <div className="space-y-1">
      <div className="overflow-x-auto">
        <ol className="flex min-w-[20rem] items-start gap-0">
          {events.map((ev, i) => {
            const selected =
              ev.reportId != null && ev.reportId === selectedReportId;
            const hovered = hoverId === ev.id;
            const tip = `${ev.label} · ${formatDate(ev.at)}`;
            return (
              <li
                key={ev.id}
                className="relative flex flex-1 flex-col items-center px-1 text-center"
              >
                {i < events.length - 1 ? (
                  <span
                    className="absolute left-1/2 top-1.5 h-px w-full bg-border-subtle"
                    aria-hidden
                  />
                ) : null}
                <button
                  type="button"
                  title={tip}
                  aria-label={tip}
                  aria-pressed={selected}
                  className={`relative z-[1] size-2.5 rounded-full outline-none ring-offset-2 transition-transform focus-visible:ring-2 focus-visible:ring-action-primary ${
                    selected || hovered ? "scale-125" : ""
                  } ${
                    ev.kind === "report"
                      ? "bg-action-primary"
                      : ev.kind === "round_reviewed"
                        ? "bg-warning-ink"
                        : "bg-success-ink"
                  }`}
                  onMouseEnter={() => setHoverId(ev.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onFocus={() => setHoverId(ev.id)}
                  onBlur={() => setHoverId(null)}
                  onClick={() => {
                    if (ev.reportId) {
                      onSelectReport?.(ev.reportId);
                      setPeekReportId(ev.reportId);
                    } else if (ev.roundId) {
                      setPeekRoundId(ev.roundId);
                    }
                  }}
                />
                <span className="mt-1 text-[10px] tabular-nums text-text-secondary">
                  {formatDate(ev.at)}
                </span>
                <span
                  className={`line-clamp-2 text-[10px] ${
                    selected ? "font-semibold text-ink" : "text-ink"
                  }`}
                >
                  {ev.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {hoverId ? (
        <p className="text-[10px] text-text-secondary" aria-live="polite">
          {events.find((e) => e.id === hoverId)?.label} ·{" "}
          {formatDate(events.find((e) => e.id === hoverId)!.at)}
        </p>
      ) : null}

      <ReportPeekModal
        reportId={peekReportId}
        caseId={caseId}
        onClose={() => {
          setPeekReportId(null);
          onSelectReport?.(null);
        }}
      />
      <RoundPeekModal
        roundId={peekRoundId}
        caseId={caseId}
        onClose={() => setPeekRoundId(null)}
      />
    </div>
  );
}
