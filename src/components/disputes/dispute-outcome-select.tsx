"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/src/components/ui";
import { updateDisputeItem } from "@/src/actions/disputes";
import { playActionResult } from "@/src/lib/cuelume";
import { DISPUTE_OUTCOME_LABELS } from "@/src/lib/labels";

export function DisputeOutcomeSelect({
  disputeItemId,
  value,
}: {
  disputeItemId: string;
  value: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={value ?? ""}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          const result = await updateDisputeItem(disputeItemId, {
            outcome: next ? (next as keyof typeof DISPUTE_OUTCOME_LABELS) : null,
            ...(next && next !== "NOT_RESPONDED" && next !== "NO_CHANGE"
              ? { status: "COMPLETED" as const }
              : {}),
          });
          playActionResult(result.ok);
          if (result.ok) router.refresh();
        });
      }}
      className="min-h-9 py-1.5 text-xs"
    >
      <option value="">Pendiente</option>
      {Object.entries(DISPUTE_OUTCOME_LABELS).map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </Select>
  );
}
