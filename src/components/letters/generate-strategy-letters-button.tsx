"use client";

import { useState, useTransition } from "react";
import { FileStack } from "lucide-react";
import { Button, Modal } from "@/src/components/ui";
import { generateLettersByStrategyAction } from "@/src/actions/dispute-methods";
import { playActionResult } from "@/src/lib/cuelume";
import { notifyEmbedRefresh } from "@/src/lib/embed-refresh";
import { STRATEGY_INFO, isDisputeStrategy } from "@/src/lib/disputes/strategies";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";

/**
 * Arma de una vez las cartas de la ronda: una por buró y método, con la
 * plantilla de ese método. Opcional: la queja al CFPB por buró.
 */
export function GenerateStrategyLettersButton({
  roundId,
  pending: pendingItems,
}: {
  roundId: string;
  /** Disputas que todavía no tienen carta. */
  pending: { bureau: string; strategy: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [cfpb, setCfpb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const groups = new Map<string, number>();
  for (const item of pendingItems) {
    const key = `${item.bureau}#${isDisputeStrategy(item.strategy) ? item.strategy : "GENERAL"}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const bureaus = new Set(pendingItems.map((i) => i.bureau));

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await generateLettersByStrategyAction({ roundId, cfpb });
      playActionResult(result.ok);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      notifyEmbedRefresh();
    });
  }

  return (
    <>
      <Button type="button" variant="primary" size="sm" disabled={pendingItems.length === 0} onClick={() => setOpen(true)}>
        <FileStack className="size-3.5" aria-hidden />
        Cartas por método
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Generar cartas por método"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" disabled={busy} onClick={run}>
              {busy ? "Generando…" : `Generar ${groups.size + (cfpb ? bureaus.size : 0)}`}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-[13px] text-text-secondary">
            Una carta por buró y método, con la plantilla de cada método. Quedan como borrador para revisarlas antes de
            enviar.
          </p>
          <ul className="divide-y divide-border-subtle/50 text-[13px]">
            {[...groups.entries()].map(([key, count]) => {
              const [bureau, strategy] = key.split("#") as [string, string];
              return (
                <li key={key} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-ink">
                    {CREDIT_BUREAU_LABELS[bureau] ?? bureau} ·{" "}
                    {isDisputeStrategy(strategy) ? STRATEGY_INFO[strategy].label : strategy}
                  </span>
                  <span className="tabular-nums text-text-secondary">
                    {count} elemento{count === 1 ? "" : "s"}
                  </span>
                </li>
              );
            })}
          </ul>
          <label className="flex items-start gap-2.5 rounded-control bg-surface-app px-3 py-2.5 text-[13px]">
            <input type="checkbox" checked={cfpb} onChange={(e) => setCfpb(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-medium text-ink">También la queja al CFPB</span>
              <span className="block text-[12px] text-text-secondary">
                Un texto por buró para pegar en consumerfinance.gov/complaint. Al enviarla, guarda el Complaint ID en
                la lista de cartas.
              </span>
            </span>
          </label>
          {error ? <p className="text-[13px] text-danger-ink">{error}</p> : null}
        </div>
      </Modal>
    </>
  );
}
