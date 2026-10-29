"use client";

import { useTransition } from "react";
import { Select } from "@/src/components/ui";
import { setDisputeStrategyAction } from "@/src/actions/dispute-methods";
import { playActionResult } from "@/src/lib/cuelume";
import { notifyEmbedRefresh } from "@/src/lib/embed-refresh";
import {
  DISPUTE_STRATEGIES,
  STRATEGY_INFO,
  isDisputeStrategy,
  type DisputeTarget,
} from "@/src/lib/disputes/strategies";

/** Método de una disputa de cuenta; editable hasta que se genera su carta. */
export function DisputeStrategySelect({
  disputeItemId,
  value,
  target,
  editable,
}: {
  disputeItemId: string;
  value: string | null;
  target: DisputeTarget;
  editable: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const current = isDisputeStrategy(value) ? value : "GENERAL";
  if (!editable || target !== "ACCOUNT") {
    return <span className="text-sm text-text-secondary-strong">{STRATEGY_INFO[current].short}</span>;
  }
  return (
    <Select
      value={current}
      disabled={pending}
      pickerTitle="Método de disputa"
      aria-label="Método de disputa"
      onChange={(event) => {
        const next = event.target.value;
        startTransition(async () => {
          const result = await setDisputeStrategyAction({ disputeItemId, strategy: next });
          playActionResult(result.ok);
          if (result.ok) notifyEmbedRefresh();
        });
      }}
      className="min-h-9 py-1.5 text-xs"
    >
      {DISPUTE_STRATEGIES.filter((s) => STRATEGY_INFO[s].target === "ACCOUNT").map((s) => (
        <option key={s} value={s}>
          {STRATEGY_INFO[s].short}
        </option>
      ))}
    </Select>
  );
}
