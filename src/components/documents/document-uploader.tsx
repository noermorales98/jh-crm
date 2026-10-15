"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { Alert, Button, Select } from "@/src/components/ui";
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_SENSITIVITY_LABELS,
} from "@/src/lib/labels";
import { classifyUploadError } from "@/src/lib/uploads/fetch-error";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];

/**
 * Wizard de subida: (1) categoría + sensibilidad → (2) archivo.
 * Sube por POST same-origin a /api/files/upload (sin PUT al bucket).
 */
export function DocumentUploader({
  clientId,
  caseId,
  roundId,
  wizard = true,
  onUploaded,
}: {
  clientId: string;
  caseId?: string;
  roundId?: string;
  /** Si true, pide categoría/sensibilidad antes de mostrar el dropzone. */
  wizard?: boolean;
  onUploaded?: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(wizard ? 1 : 2);
  const [category, setCategory] = useState("IDENTITY");
  const [sensitivity, setSensitivity] = useState("CONFIDENTIAL");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function uploadFile(file: File) {
    setError(null);
    setSuccess(null);

    if (!ALLOWED.includes(file.type)) {
      setError("Solo se aceptan PDF, JPG y PNG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("El archivo excede el límite de 15 MB.");
      return;
    }

    try {
      setBusy("Subiendo…");
      const form = new FormData();
      form.set("file", file);
      form.set("clientId", clientId);
      if (caseId) form.set("caseId", caseId);
      if (roundId) form.set("roundId", roundId);
      form.set("category", category);
      form.set("sensitivity", sensitivity);
      form.set("originalName", file.name);

      const res = await fetch("/api/files/upload", {
        method: "POST",
        body: form,
        redirect: "error",
      });

      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }

      const payload = json as
        | { ok: true; data: Record<string, unknown> }
        | { ok: false; error: string }
        | null;

      if (!res.ok || !payload || payload.ok !== true) {
        const classified = classifyUploadError({
          error: new Error(
            payload && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "No se pudo subir el archivo.",
          ),
          phase: "upload",
          httpStatus: res.status,
          responseBody: json,
        });
        throw new Error(classified.message);
      }

      setSuccess(`“${file.name}” listo.`);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
      onUploaded?.();
    } catch (err) {
      const classified = classifyUploadError({
        error: err,
        phase: "upload",
      });
      setError(classified.message);
    } finally {
      setBusy(null);
    }
  }

  function takeFile(files: FileList | null) {
    const file = files?.[0];
    if (file) void uploadFile(file);
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      {wizard ? (
        <p className="text-xs text-text-secondary">
          Paso {step} de 2 ·{" "}
          {step === 1 ? "Tipo de documento" : "Subir archivo"}
        </p>
      ) : null}

      {step === 1 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-text-secondary">
                Categoría
              </span>
              <Select
                id="doc-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="min-h-10 py-2 text-sm"
              >
                {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-text-secondary">
                Sensibilidad
              </span>
              <Select
                id="doc-sensitivity"
                value={sensitivity}
                onChange={(e) => setSensitivity(e.target.value)}
                className="min-h-10 py-2 text-sm"
              >
                {Object.entries(DOCUMENT_SENSITIVITY_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </Select>
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setStep(2)}>
              Continuar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {wizard ? (
            <button
              type="button"
              className="text-xs font-medium text-action-primary hover:underline"
              onClick={() => setStep(1)}
            >
              ← Cambiar categoría
            </button>
          ) : null}
          <input
            ref={fileRef}
            id="doc-file"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="sr-only"
            disabled={busy !== null}
            onChange={(e) => takeFile(e.target.files)}
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => fileRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              takeFile(e.dataTransfer.files);
            }}
            className={`flex w-full items-center gap-3 rounded-control border border-dashed px-3 py-4 text-left transition-colors ${
              dragging
                ? "border-action-primary bg-nav-active"
                : "border-border-subtle bg-surface-app hover:border-action-primary hover:bg-nav-hover"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {busy ? (
              <Loader2
                className="size-5 shrink-0 animate-spin text-action-primary"
                aria-hidden
              />
            ) : (
              <FileUp className="size-5 shrink-0 text-action-primary" aria-hidden />
            )}
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">
                {busy ?? (dragging ? "Suelta el archivo" : "Suelta aquí o haz clic")}
              </span>
              <span className="block text-xs text-text-secondary">
                PDF, JPG o PNG · máximo 15 MB
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
