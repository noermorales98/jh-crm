"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/src/components/ui";
import { overrideComparisonItem } from "@/src/actions/comparisons";
import { playActionResult } from "@/src/lib/cuelume";
import { COMPARISON_RESULT_LABELS } from "@/src/lib/labels";

export function ComparisonResultOverride({
  itemId,
  autoResult,
  manualResult,
}: {
  itemId: string;
  autoResult: string;
  manualResult: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const value = manualResult ?? "";

  return (
    <div className="space-y-1">
      <Select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            const result = await overrideComparisonItem(itemId, {
              manualResult: next
                ? (next as keyof typeof COMPARISON_RESULT_LABELS)
                : null,
            });
            playActionResult(result.ok);
            if (result.ok) router.refresh();
          });
        }}
        className="min-h-9 py-1.5 text-xs"
      >
        <option value="">Auto: {COMPARISON_RESULT_LABELS[autoResult]}</option>
        {Object.entries(COMPARISON_RESULT_LABELS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </Select>
      {manualResult ? (
        <p className="text-[11px] text-text-secondary">Corregido manualmente</p>
      ) : null}
    </div>
  );
}
