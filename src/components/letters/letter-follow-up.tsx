"use client";

import { useState, useTransition } from "react";
import { updateLetterFollowUpAction } from "@/src/actions/dispute-methods";
import { playActionResult } from "@/src/lib/cuelume";
import { formatDate } from "@/src/lib/format";

/** Canal, Complaint ID del CFPB y fecha de revisión de una carta. */
export function LetterFollowUp({
  letterId,
  channel,
  complaintId,
  followUpAt,
  editable,
}: {
  letterId: string;
  channel: string;
  complaintId: string | null;
  followUpAt: Date | string | null;
  editable: boolean;
}) {
  const [value, setValue] = useState(complaintId ?? "");
  const [saved, setSaved] = useState(complaintId ?? "");
  const [pending, startTransition] = useTransition();
  // Fecha de referencia fijada al montar (no leer el reloj en cada render).
  const [now] = useState(() => Date.now());
  const due = followUpAt ? new Date(followUpAt) : null;
  const overdue = due != null && due.getTime() < now;

  return (
    <div className="space-y-1 text-[12px]">
      {channel === "CFPB" ? (
        editable ? (
          <input
            type="text"
            value={value}
            placeholder="Complaint ID"
            aria-label="Complaint ID del CFPB"
            disabled={pending}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              if (value.trim() === saved) return;
              startTransition(async () => {
                const result = await updateLetterFollowUpAction({ letterId, complaintId: value.trim() || null });
                playActionResult(result.ok);
                if (result.ok) setSaved(value.trim());
              });
            }}
            className="w-36 rounded-control bg-surface-app px-2 py-1 text-[12px] tabular-nums text-ink outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
          />
        ) : (
          <span className="tabular-nums text-ink">{complaintId ?? "Sin Complaint ID"}</span>
        )
      ) : null}
      {due ? (
        <p className={overdue ? "font-medium text-warning-ink" : "text-text-secondary"}>
          {overdue ? "Revisar ya" : "Revisar"} {formatDate(due)}
        </p>
      ) : null}
    </div>
  );
}
