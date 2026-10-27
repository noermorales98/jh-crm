"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileScan } from "lucide-react";
import { Alert, Button, Field, Modal, Select } from "@/src/components/ui";
import {
  listAnalyzableCreditPdfsAction,
  startCreditPdfImportAction,
} from "@/src/actions/credit-import";
import { playActionResult } from "@/src/lib/cuelume";
import { kickCreditPdfImportProcess } from "@/src/lib/credit/kick-pdf-import";
import { useCreditPdfImportLock } from "./credit-pdf-import-lock";

type PdfOption = {
  id: string;
  category: string;
  name: string;
  sizeBytes: number;
  createdAt: Date | string;
};

/**
 * Elige PDF y encola análisis en segundo plano (idempotente por documento).
 * Redirige a la página de progreso; no bloquea navegación ni cierre de pestaña.
 */
export function AnalyzePdfImportButton({
  caseId,
  menuItem = false,
  label = "Analizar PDF",
}: {
  caseId: string;
  menuItem?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const { engageLock } = useCreditPdfImportLock();
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
      void kickCreditPdfImportProcess(result.data.jobId);
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

  function openModal() {
    setError(null);
    setOpen(true);
  }

  return (
    <>
      {menuItem ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-nav-hover"
          onClick={openModal}
        >
          <FileScan
            className="size-3.5 shrink-0 text-text-secondary"
            aria-hidden
          />
          {label}
        </button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={openModal}
        >
          {label}
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Analizar PDF de crédito"
        description="El análisis corre en el servidor. Puedes cerrar la app y volver luego a revisar el resultado."
        size="md"
      >
        <div className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Alert tone="info">
            Reportes largos pueden tardar varios minutos. Se abrirá una página de
            progreso; puedes navegar o cerrar la pestaña — el análisis sigue
            en el servidor y verás el aviso cuando esté listo.
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
