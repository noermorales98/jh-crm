"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Modal, Select } from "@/src/components/ui";
import { addInquiryOrPersonalDisputesAction } from "@/src/actions/dispute-methods";
import { playActionResult } from "@/src/lib/cuelume";
import { notifyEmbedRefresh } from "@/src/lib/embed-refresh";
import { formatDate } from "@/src/lib/format";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";
import {
  PERSONAL_INFO_KINDS,
  PERSONAL_INFO_LABEL,
  STRATEGY_INFO,
  type PersonalInfoKind,
} from "@/src/lib/disputes/strategies";

type Bureau = "EXPERIAN" | "EQUIFAX" | "TRANSUNION";
type PersonalRow = { key: number; bureau: Bureau; kind: PersonalInfoKind; value: string };

const BUREAUS: Bureau[] = ["EQUIFAX", "EXPERIAN", "TRANSUNION"];

/**
 * Agrega a la ronda lo que no es una cuenta: consultas duras del último
 * reporte que el cliente no reconoce, y datos personales que no son suyos.
 */
export function AddInquiryPersonalButton({
  roundId,
  inquiries,
}: {
  roundId: string;
  inquiries: { id: string; bureau: string; creditorName: string; inquiryDate: Date | string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<PersonalRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const validRows = rows.filter((r) => r.value.trim().length >= 2);
  const total = picked.size + validRows.length;

  function reset() {
    setPicked(new Set());
    setRows([]);
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addInquiryOrPersonalDisputesAction({
        roundId,
        inquiries: inquiries
          .filter((q) => picked.has(q.id))
          .map((q) => ({
            inquiryId: q.id,
            bureau: q.bureau,
            label: `${q.creditorName}${q.inquiryDate ? ` · ${formatDate(q.inquiryDate)}` : ""}`,
          })),
        personal: validRows.map((r) => ({ bureau: r.bureau, kind: r.kind, value: r.value })),
      });
      playActionResult(result.ok);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      notifyEmbedRefresh();
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden />
        Consultas e info personal
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Consultas e información personal"
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" disabled={busy || total === 0} onClick={submit}>
              {busy ? "Agregando…" : total === 0 ? "Agregar" : `Agregar ${total}`}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <section>
            <h3 className="text-[14px] font-semibold text-ink">Consultas duras</h3>
            <p className="mt-0.5 text-[12px] text-text-secondary">{STRATEGY_INFO.INQUIRY.when}</p>
            {inquiries.length === 0 ? (
              <p className="mt-2 rounded-control bg-surface-app px-3 py-2.5 text-[12.5px] text-text-secondary">
                El último reporte no trae consultas con detalle, o ya están todas en esta ronda.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border-subtle/50">
                {inquiries.map((q) => (
                  <li key={q.id}>
                    <label className="flex cursor-pointer items-center gap-3 py-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={picked.has(q.id)}
                        onChange={() =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (next.has(q.id)) next.delete(q.id);
                            else next.add(q.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">{q.creditorName}</span>
                      <span className="shrink-0 text-[12px] text-text-secondary">
                        {CREDIT_BUREAU_LABELS[q.bureau] ?? q.bureau}
                        {q.inquiryDate ? ` · ${formatDate(q.inquiryDate)}` : ""}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-[14px] font-semibold text-ink">Información personal</h3>
            <p className="mt-0.5 text-[12px] text-text-secondary">{STRATEGY_INFO.PERSONAL_INFO.when}</p>
            <div className="mt-2 space-y-2">
              {rows.map((row) => (
                <div key={row.key} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:grid-cols-[9rem_8rem_1fr_auto]">
                  <Select
                    value={row.bureau}
                    pickerTitle="Buró"
                    aria-label="Buró"
                    onChange={(e) =>
                      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, bureau: e.target.value as Bureau } : r)))
                    }
                  >
                    {BUREAUS.map((b) => (
                      <option key={b} value={b}>
                        {CREDIT_BUREAU_LABELS[b]}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={row.kind}
                    pickerTitle="Tipo de dato"
                    aria-label="Tipo de dato"
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) => (r.key === row.key ? { ...r, kind: e.target.value as PersonalInfoKind } : r)),
                      )
                    }
                  >
                    {PERSONAL_INFO_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {PERSONAL_INFO_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    value={row.value}
                    placeholder="Tal como aparece en el reporte"
                    aria-label="Dato a eliminar"
                    onChange={(e) =>
                      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, value: e.target.value } : r)))
                    }
                    className="col-span-2 sm:col-span-1"
                  />
                  <button
                    type="button"
                    aria-label="Quitar"
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                    className="grid size-9 place-items-center rounded-control text-text-secondary hover:bg-nav-hover hover:text-danger-ink"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setRows((prev) => [...prev, { key: Date.now(), bureau: "EQUIFAX", kind: "ADDRESS", value: "" }])
                }
                className="inline-flex items-center gap-1.5 rounded-control px-2 py-1.5 text-[12.5px] font-medium text-action-primary hover:bg-nav-hover"
              >
                <Plus className="size-3.5" aria-hidden />
                Agregar un dato
              </button>
            </div>
          </section>
          {error ? <p className="text-[13px] text-danger-ink">{error}</p> : null}
        </div>
      </Modal>
    </>
  );
}
