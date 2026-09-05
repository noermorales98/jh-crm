"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { Alert, Select } from "@/src/components/ui";
import { DOCUMENT_CATEGORY_LABELS } from "@/src/lib/labels";
import { PORTAL_UPLOAD_CATEGORIES } from "@/src/lib/validation/portal";
import {
  confirmPortalUploadAction,
  requestPortalUploadAction,
} from "@/src/actions/portal";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];

export function PortalDocumentUploader() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string>("IDENTITY");
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
      setBusy("Preparando…");
      const prep = await requestPortalUploadAction({
        category,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (!prep.ok) throw new Error(prep.error);

      setBusy("Subiendo…");
      const put = await fetch(prep.data.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("La subida al almacenamiento falló.");

      setBusy("Registrando…");
      const confirm = await confirmPortalUploadAction({
        category,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        storageKey: prep.data.storageKey,
      });
      if (!confirm.ok) throw new Error(confirm.error);

      setSuccess(`“${file.name}” listo.`);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo subir el archivo.",
      );
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

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-text-secondary">
          Categoría
        </span>
        <Select
          id="portal-doc-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="min-h-10 py-2 text-sm"
          disabled={busy !== null}
        >
          {PORTAL_UPLOAD_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {DOCUMENT_CATEGORY_LABELS[value] ?? value}
            </option>
          ))}
        </Select>
      </label>

      <input
        ref={fileRef}
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
  );
}
