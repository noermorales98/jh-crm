"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  DateInput,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/src/components/ui";
import { createCreditReport } from "@/src/actions/credit-reports";
import { playActionResult } from "@/src/lib/cuelume";
import { CREDIT_BUREAU_LABELS, CREDIT_REPORT_TYPE_LABELS } from "@/src/lib/labels";

const BUREAUS = ["EXPERIAN", "EQUIFAX", "TRANSUNION"] as const;

type ScoreDraft = Record<(typeof BUREAUS)[number], string>;

/**
 * Modal para registrar un reporte de crédito con scores por buró.
 * Los elementos de cuenta se añaden en el detalle del reporte.
 */
export function CreateCreditReportButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"INITIAL" | "UPDATE" | "MANUAL">("INITIAL");
  const [reportDate, setReportDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");
  const [scores, setScores] = useState<ScoreDraft>({
    EXPERIAN: "",
    EQUIFAX: "",
    TRANSUNION: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setType("INITIAL");
    setReportDate(new Date().toISOString().slice(0, 10));
    setProvider("");
    setNotes("");
    setScores({ EXPERIAN: "", EQUIFAX: "", TRANSUNION: "" });
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const snapshots = BUREAUS.filter((b) => scores[b].trim()).map((bureau) => ({
        bureau,
        score: Number(scores[bureau]),
      }));
      const result = await createCreditReport({
        caseId,
        type,
        reportDate,
        ...(provider.trim() ? { provider: provider.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(snapshots.length ? { snapshots } : {}),
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setOpen(false);
      reset();
      router.push(`/crm/casos/${caseId}/credito/reportes/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Registrar reporte
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar reporte de crédito"
        description="Captura la fecha, tipo y puntajes por buró. Luego podrás añadir elementos."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="cr-type">
              <Select
                id="cr-type"
                value={type}
                onChange={(e) =>
                  setType(e.target.value as "INITIAL" | "UPDATE" | "MANUAL")
                }
              >
                {Object.entries(CREDIT_REPORT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha del reporte" htmlFor="cr-date" required>
              <DateInput
                id="cr-date"
                required
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Proveedor" htmlFor="cr-provider">
            <Input
              id="cr-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="SmartCredit, AnnualCreditReport…"
              maxLength={120}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            {BUREAUS.map((bureau) => (
              <Field
                key={bureau}
                label={CREDIT_BUREAU_LABELS[bureau]}
                htmlFor={`score-${bureau}`}
              >
                <Input
                  id={`score-${bureau}`}
                  type="number"
                  min={300}
                  max={900}
                  value={scores[bureau]}
                  onChange={(e) =>
                    setScores((prev) => ({ ...prev, [bureau]: e.target.value }))
                  }
                  placeholder="—"
                />
              </Field>
            ))}
          </div>
          <Field label="Notas" htmlFor="cr-notes">
            <Textarea
              id="cr-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
              placeholder="Observaciones internas del reporte…"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar reporte"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
