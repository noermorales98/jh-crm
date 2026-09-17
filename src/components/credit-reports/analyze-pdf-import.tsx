"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Modal, Select } from "@/src/components/ui";
import {
  listAnalyzableCreditPdfsAction,
  startCreditPdfImportAction,
} from "@/src/actions/credit-import";
import { playActionResult } from "@/src/lib/cuelume";
import { useCreditPdfImportLock } from "./credit-pdf-import-lock";

type PdfOption = {
  id: string;
  category: string;
  name: string;
  sizeBytes: number;
  createdAt: Date | string;
};

/**
 * Elige PDF y encola análisis en segundo plano.
 * Redirige a la página de progreso y activa bloqueo de navegación.
 */
export function AnalyzePdfImportButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const { engageLock, isLocked } = useCreditPdfImportLock();
  const [open, setOpen] = useState(false);
  const [pdfs, setPdfs] = useState<PdfOption[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      const result = await listAnalyzableCreditPdfsAction(caseId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPdfs(result.data);
      if (result.data[0]) setDocumentId(result.data[0].id);
    });
  }, [open, caseId]);

  function handleStart() {
    if (!documentId) {
      setError("Elige un PDF.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await startCreditPdfImportAction({ caseId, documentId });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      const selected = pdfs.find((p) => p.id === documentId);
      engageLock({
        jobId: result.data.jobId,
        caseId: result.data.caseId,
        progressPath: result.data.progressPath,
        fileName: selected?.name ?? null,
      });
      setOpen(false);
      router.push(result.data.progressPath);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={isLocked}
        title={
          isLocked
            ? "Hay un análisis en curso; no puedes iniciar otro"
            : undefined
        }
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Analizar PDF
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Analizar PDF de crédito"
        description="El análisis corre en segundo plano. No cierres la pestaña hasta que termine."
        size="md"
      >
        <div className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Alert tone="info">
            Reportes largos pueden tardar 30–90 s. Se abrirá una página de
            progreso y <strong>no podrás navegar fuera</strong> hasta que
            termine. Al cerrar la pestaña el navegador pedirá confirmación.
          </Alert>
          {pdfs.length === 0 ? (
            <Alert tone="info">
              No hay PDFs de crédito/update en este caso. Súbelos en Documentos.
            </Alert>
          ) : (
            <Field label="PDF" htmlFor="creditPdfDoc">
              <Select
                id="creditPdfDoc"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
              >
                {pdfs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.category}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending || !documentId}
              onClick={handleStart}
            >
              {pending ? "Iniciando…" : "Iniciar análisis"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
