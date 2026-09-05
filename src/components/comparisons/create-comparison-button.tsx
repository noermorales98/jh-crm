"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Field,
  Modal,
  Select,
  Textarea,
} from "@/src/components/ui";
import { createComparison } from "@/src/actions/comparisons";
import { playActionResult } from "@/src/lib/cuelume";
import { CREDIT_REPORT_TYPE_LABELS, labelFor } from "@/src/lib/labels";
import { formatDate } from "@/src/lib/format";

export type ReportOption = {
  id: string;
  reportDate: Date | string;
  type: string;
};

export function CreateComparisonButton({
  caseId,
  reports,
}: {
  caseId: string;
  reports: ReportOption[];
}) {
  const router = useRouter();
  const sorted = [...reports].sort(
    (a, b) =>
      new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime(),
  );
  const defaultBase =
    sorted.find((r) => r.type === "INITIAL")?.id ?? sorted[0]?.id ?? "";
  const defaultCompare =
    [...sorted].reverse().find((r) => r.id !== defaultBase)?.id ?? "";

  const [open, setOpen] = useState(false);
  const [baseReportId, setBaseReportId] = useState(defaultBase);
  const [compareReportId, setCompareReportId] = useState(defaultCompare);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createComparison({
        caseId,
        baseReportId,
        compareReportId,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setOpen(false);
      router.push(`/crm/casos/${caseId}/comparaciones/${result.data.id}`);
      router.refresh();
    });
  }

  if (reports.length < 2) {
    return (
      <Button size="sm" variant="secondary" disabled>
        Comparar reportes
      </Button>
    );
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Comparar reportes
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Comparar reportes"
        description="Compara un reporte base con uno actualizado. Podrás corregir resultados manualmente."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Reporte base" htmlFor="cmp-base" required>
            <Select
              id="cmp-base"
              value={baseReportId}
              onChange={(e) => setBaseReportId(e.target.value)}
              required
            >
              {sorted.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatDate(r.reportDate)} ·{" "}
                  {labelFor(CREDIT_REPORT_TYPE_LABELS, r.type)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reporte a comparar" htmlFor="cmp-new" required>
            <Select
              id="cmp-new"
              value={compareReportId}
              onChange={(e) => setCompareReportId(e.target.value)}
              required
            >
              {sorted.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatDate(r.reportDate)} ·{" "}
                  {labelFor(CREDIT_REPORT_TYPE_LABELS, r.type)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notas" htmlFor="cmp-notes">
            <Textarea
              id="cmp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
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
              {pending ? "Comparando…" : "Crear comparación"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
