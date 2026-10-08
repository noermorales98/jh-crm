"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Modal, Textarea } from "@/src/components/ui";
import { generateClientProgressReport } from "@/src/actions/letters";
import { playActionResult } from "@/src/lib/cuelume";
import { notifyEmbedRefresh } from "@/src/lib/embed-refresh";

export function GenerateProgressReportButton({
  caseId,
  roundId,
  stayOnPage = false,
  onCreated,
}: {
  caseId: string;
  roundId?: string | null;
  /** Si true, no navega a /crm/casos/.../reportes. */
  stayOnPage?: boolean;
  onCreated?: (reportId: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nextSteps, setNextSteps] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await generateClientProgressReport({
        caseId,
        ...(roundId ? { roundId } : {}),
        ...(nextSteps.trim() ? { nextSteps: nextSteps.trim() } : {}),
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setOpen(false);
      onCreated?.(result.data.reportId);
      notifyEmbedRefresh();
      if (stayOnPage) {
        router.refresh();
        window.open(`/api/progress-reports/${result.data.reportId}/pdf`, "_blank");
        return;
      }
      router.push(
        `/crm/casos/${result.data.caseId}/reportes/${result.data.reportId}`,
      );
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Reporte visual
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Generar reporte de progreso"
        description="Se guarda un snapshot en el historial. Puedes verlo en HTML y descargar PDF cuando quieras."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Próximos pasos (opcional)" htmlFor="prog-steps">
            <Textarea
              id="prog-steps"
              value={nextSteps}
              onChange={(e) => setNextSteps(e.target.value)}
              maxLength={2000}
              placeholder="Revisar próximo reporte, continuar seguimiento…"
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
              {pending
                ? "Generando…"
                : stayOnPage
                  ? "Generar"
                  : "Generar y ver"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
