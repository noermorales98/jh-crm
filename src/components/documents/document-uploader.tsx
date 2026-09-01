"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { Alert, Select } from "@/src/components/ui";
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_SENSITIVITY_LABELS,
} from "@/src/lib/labels";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];

/**
 * Subida directa a S3 en 3 pasos (URL firmada → PUT → confirm).
 * El archivo se envía al soltarlo o al elegirlo; categoría y sensibilidad
 * se eligen antes, en la misma fila.
 */
export function DocumentUploader({
  clientId,
  caseId,
  roundId,
}: {
  clientId: string;
  caseId?: string;
  roundId?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("IDENTITY");
  const [sensitivity, setSensitivity] = useState("CONFIDENTIAL");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function postJson(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
    });
    const json = (await res.json()) as
      | { ok: true; data: Record<string, unknown> }
      | { ok: false; error: string };
    if (!json.ok) throw new Error(json.error);
    return json.data;
  }

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
      setBusy("Preparando…");
      const linkInfo = {
        clientId,
        ...(caseId ? { caseId } : {}),
        ...(roundId ? { roundId } : {}),
      };
      const upload = await postJson("/api/files/upload-url", {
        ...linkInfo,
        category,
        sensitivity,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      setBusy("Subiendo…");
      const put = await fetch(upload.url as string, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("La subida al almacenamiento falló.");

      setBusy("Registrando…");
      await postJson("/api/files/confirm", {
        ...linkInfo,
        storageKey: upload.storageKey,
        category,
        sensitivity,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      setSuccess(`“${file.name}” listo.`);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      if (err instanceof TypeError) {
        setError("Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo.");
      } else {
        setError(err instanceof Error ? err.message : "No se pudo subir el archivo.");
      }
    } finally {
      setBusy(null);
    }
  }

  function takeFile(files: FileList | null) {
    const file = files?.[0];
    if (file) void uploadFile(file);
  }

  return (
    <div className="space-y-2.5">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-text-secondary">
            Categoría
          </span>
          <Select
            id="doc-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="min-h-10 py-2 text-sm"
            disabled={busy !== null}
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
            disabled={busy !== null}
          >
            {Object.entries(DOCUMENT_SENSITIVITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
      </div>

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
        className={`flex w-full items-center gap-3 rounded-control border border-dashed px-3 py-3 text-left transition-colors ${
          dragging
            ? "border-action-primary bg-nav-active"
            : "border-border-subtle bg-surface-app hover:border-action-primary hover:bg-nav-hover"
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {busy ? (
          <Loader2 className="size-5 shrink-0 animate-spin text-action-primary" aria-hidden />
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
  );
}
