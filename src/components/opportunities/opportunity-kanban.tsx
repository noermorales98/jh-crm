"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Button,
  Field,
  Modal,
  Select,
  Textarea,
} from "@/src/components/ui";
import {
  markOpportunityLostAction,
  markOpportunityWonAction,
  updateOpportunityStageAction,
} from "@/src/actions/opportunities";
import { playActionResult } from "@/src/lib/cuelume";
import {
  labelFor,
  OPPORTUNITY_STAGE_LABELS,
} from "@/src/lib/labels";
import { OPPORTUNITY_STAGES } from "@/src/lib/validation/opportunities";
import { formatMoney } from "@/src/lib/format";

type OppCard = {
  id: string;
  stage: string;
  estimatedValue: { toString(): string } | null;
  source: string | null;
  campaign: string | null;
  client: {
    id: string;
    clientCode: string;
    firstName: string;
    lastName: string | null;
  };
  owner: { id: string; name: string | null } | null;
  wonCase: { id: string; caseCode: string } | null;
};

const MOVE_STAGES = OPPORTUNITY_STAGES.filter((s) => s !== "WON" && s !== "LOST");

export function OpportunityKanban({
  columns,
  canManage,
}: {
  columns: Record<string, OppCard[]>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lostFor, setLostFor] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState("");

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        playActionResult(false);
        setError(result.error ?? "Error");
        return;
      }
      playActionResult(true);
      setLostFor(null);
      setLostReason("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {OPPORTUNITY_STAGES.map((stage) => {
          const items = columns[stage] ?? [];
          return (
            <div
              key={stage}
              className="flex w-64 shrink-0 flex-col rounded-surface bg-surface-app"
            >
              <div className="border-border-subtle border-b px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {labelFor(OPPORTUNITY_STAGE_LABELS, stage)}
                </p>
                <p className="text-sm font-semibold tabular-nums text-ink">
                  {items.length}
                </p>
              </div>
              <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
                {items.map((opp) => {
                  const name = [opp.client.firstName, opp.client.lastName]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <li
                      key={opp.id}
                      className="rounded-control border border-border-subtle bg-surface-panel p-3"
                    >
                      <Link
                        href={`/crm/clientes/${opp.client.id}`}
                        className="text-sm font-medium text-ink hover:text-action-primary"
                      >
                        {name}
                      </Link>
                      <p className="text-xs text-text-secondary">
                        {opp.client.clientCode}
                        {opp.owner ? ` · ${opp.owner.name}` : ""}
                      </p>
                      {opp.estimatedValue ? (
                        <p className="mt-1 text-xs tabular-nums text-text-secondary-strong">
                          {formatMoney(opp.estimatedValue)}
                        </p>
                      ) : null}
                      {opp.wonCase ? (
                        <Link
                          href={`/crm/casos/${opp.wonCase.id}`}
                          className="mt-1 block text-xs font-medium text-action-primary"
                        >
                          Caso {opp.wonCase.caseCode}
                        </Link>
                      ) : null}
                      {canManage && stage !== "WON" && stage !== "LOST" ? (
                        <div className="mt-2 space-y-1.5">
                          <Select
                            className="text-xs"
                            disabled={pending}
                            defaultValue=""
                            onChange={(e) => {
                              const next = e.target.value;
                              if (!next) return;
                              run(() =>
                                updateOpportunityStageAction(opp.id, {
                                  stage: next,
                                }),
                              );
                              e.target.value = "";
                            }}
                          >
                            <option value="">Mover a…</option>
                            {MOVE_STAGES.filter((s) => s !== stage).map((s) => (
                              <option key={s} value={s}>
                                {labelFor(OPPORTUNITY_STAGE_LABELS, s)}
                              </option>
                            ))}
                          </Select>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={pending}
                              className="flex-1 text-xs"
                              onClick={() =>
                                run(() => markOpportunityWonAction(opp.id))
                              }
                            >
                              Ganada
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              className="flex-1 text-xs"
                              onClick={() => setLostFor(opp.id)}
                            >
                              Perdida
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <Modal
        open={Boolean(lostFor)}
        onClose={() => setLostFor(null)}
        title="Marcar como perdida"
        description="Indica el motivo para el historial comercial."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!lostFor) return;
            run(() =>
              markOpportunityLostAction(lostFor, { lostReason }),
            );
          }}
        >
          <Field label="Motivo" htmlFor="lost-reason" required>
            <Textarea
              id="lost-reason"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              required
              maxLength={2000}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setLostFor(null)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !lostReason.trim()}>
              {pending ? "Guardando…" : "Confirmar"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
