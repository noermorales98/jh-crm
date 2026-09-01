"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Alert, Button, Field, Select } from "@/src/components/ui";
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_SENSITIVITY_LABELS,
} from "@/src/lib/labels";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];

/**
 * DocumentUploader: subida directa a S3 en 3 pasos:
 *   1. POST /api/files/upload-url  → URL firmada
 *   2. PUT del archivo a la URL firmada (directo al bucket)
 *   3. POST /api/files/confirm     → registro Document
 * Trata 307/redirect como sesión expirada. Solo se renderiza si el
 * servidor confirma que el almacenamiento está configurado.
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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function postJson(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // El proxy redirige (307) a /login si la sesión expiró.
      redirect: "error",
    });
    const json = (await res.json()) as
      | { ok: true; data: Record<string, unknown> }
      | { ok: false; error: string };
    if (!json.ok) throw new Error(json.error);
    return json.data;
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Selecciona un archivo PDF, JPG o PNG.");
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      setError("Tipo de archivo no permitido. Solo PDF, JPG y PNG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("El archivo excede el límite de 15 MB.");
      return;
    }

    try {
      setBusy("Solicitando URL de subida…");
      const linkInfo = { clientId, ...(caseId ? { caseId } : {}), ...(roundId ? { roundId } : {}) };
      const upload = await postJson("/api/files/upload-url", {
        ...linkInfo,
        category,
        sensitivity,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      setBusy("Subiendo archivo…");
      const put = await fetch(upload.url as string, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("La subida al almacenamiento falló.");

      setBusy("Registrando documento…");
      await postJson("/api/files/confirm", {
        ...linkInfo,
        storageKey: upload.storageKey,
        category,
        sensitivity,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      setSuccess(`Documento "${file.name}" subido correctamente.`);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      if (err instanceof TypeError) {
        // fetch con redirect:"error" lanza TypeError ante un 307 del proxy.
        setError("Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo.");
      } else {
        setError(err instanceof Error ? err.message : "No se pudo subir el archivo.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={handleUpload} className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoría" htmlFor="doc-category">
          <Select
            id="doc-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sensibilidad" htmlFor="doc-sensitivity">
          <Select
            id="doc-sensitivity"
            value={sensitivity}
            onChange={(e) => setSensitivity(e.target.value)}
          >
            {Object.entries(DOCUMENT_SENSITIVITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Archivo" htmlFor="doc-file" hint="PDF, JPG o PNG. Máximo 15 MB.">
        <input
          ref={fileRef}
          id="doc-file"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="block w-full text-sm text-text-secondary-strong file:mr-3 file:rounded-control file:border-0 file:bg-nav-active file:px-3 file:py-2 file:text-sm file:font-medium file:text-action-primary hover:file:bg-nav-active"
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy !== null}>
          <Upload className="size-4" aria-hidden />
          {busy ?? "Subir documento"}
        </Button>
      </div>
    </form>
  );
}
