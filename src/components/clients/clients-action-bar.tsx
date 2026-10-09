"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Link2, Plus, Upload } from "lucide-react";
import { Button } from "@/src/components/ui";
import { AgencyModal } from "@/src/components/agency/agency-modal";
import {
  commitClientImport,
  createClient,
  previewClientImport,
  type ClientImportPreviewActionResult,
} from "@/src/actions/clients";

const STATUS_LABEL: Record<
  keyof ClientImportPreviewActionResult["counts"],
  string
> = {
  create: "Nuevos",
  exists: "Ya existen",
  no_email: "Sin correo",
  invalid: "Inválidos",
  duplicate_in_file: "Duplicados en archivo",
};

const PREVIEW_ROW_LIMIT = 50;

function rejectNonCsvFile(file: File): string | null {
  const name = file.name.trim().toLowerCase();
  const mime = (file.type ?? "").trim().toLowerCase();
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    mime.includes("spreadsheet") ||
    mime.includes("excel")
  ) {
    return "Solo se admiten archivos CSV. El formato Excel no está soportado todavía.";
  }
  if (name.includes(".") && !name.endsWith(".csv")) {
    return "Solo se admiten archivos CSV.";
  }
  return null;
}

export function ClientsActionBar({
  canCreate,
  shareUrl,
}: {
  canCreate: boolean;
  shareUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{
    fileName: string;
    mimeType: string | null;
  } | null>(null);
  const [preview, setPreview] =
    useState<ClientImportPreviewActionResult | null>(null);

  function resetImportState() {
    setError(null);
    setImportResult(null);
    setCsvText(null);
    setFileMeta(null);
    setPreview(null);
  }

  function onAdd(formData: FormData) {
    setError(null);
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const source = String(formData.get("source") ?? "").trim();
    const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
    const addressLine2 = String(formData.get("addressLine2") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    const state = String(formData.get("state") ?? "").trim();
    const postalCode = String(formData.get("postalCode") ?? "").trim();
    startTransition(async () => {
      const result = await createClient({
        firstName,
        lastName: lastName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        source: source || undefined,
        addressLine1: addressLine1 || undefined,
        addressLine2: addressLine2 || undefined,
        city: city || undefined,
        state: state || undefined,
        postalCode: postalCode || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAddOpen(false);
      router.push(`/crm/clientes/${result.data.id}`);
      router.refresh();
    });
  }

  const fieldClass =
    "w-full rounded-control bg-nav-hover px-3 py-2.5 text-sm outline-none focus:bg-surface-app focus:ring-2 focus:ring-focus/25";

  function onPreview(formData: FormData) {
    setError(null);
    setImportResult(null);
    setPreview(null);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Selecciona un archivo CSV.");
      return;
    }
    const reject = rejectNonCsvFile(file);
    if (reject) {
      setError(reject);
      return;
    }
    startTransition(async () => {
      const text = await file.text();
      const meta = { fileName: file.name, mimeType: file.type || null };
      const result = await previewClientImport(text, meta);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCsvText(text);
      setFileMeta(meta);
      setPreview(result.data);
    });
  }

  function onConfirmImport() {
    if (!csvText || !preview || preview.counts.create === 0) return;
    setError(null);
    setImportResult(null);
    startTransition(async () => {
      const result = await commitClientImport(
        csvText,
        fileMeta ?? undefined,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setImportResult(
        `Importados: ${result.data.created}. Omitidos (existen/sin correo/inválidos): ${
          result.data.counts.exists +
          result.data.counts.no_email +
          result.data.counts.invalid +
          result.data.counts.duplicate_in_file
        }.`,
      );
      setPreview(null);
      setCsvText(null);
      setFileMeta(null);
      if (result.data.created > 0) {
        router.refresh();
      }
      if (result.data.errors.length === 0 && result.data.created > 0) {
        setImportOpen(false);
        resetImportState();
      }
    });
  }

  async function copyShare() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShareOpen(true)}
        >
          <Link2 className="size-3.5" aria-hidden />
          Comparte tu enlace
        </Button>
        {canCreate ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="size-3.5" aria-hidden />
              Importar clientes
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="size-3.5" aria-hidden />
              Agregar cliente
            </Button>
          </>
        ) : null}
      </div>

      <AgencyModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Agregar cliente"
        size="lg"
      >
        <form action={onAdd} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium text-ink">Nombre</span>
            <input name="firstName" required className={fieldClass} />
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium text-ink">Apellido</span>
            <input name="lastName" className={fieldClass} />
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium text-ink">Correo</span>
            <input name="email" type="email" className={fieldClass} />
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium text-ink">Teléfono</span>
            <input name="phone" type="tel" className={fieldClass} />
          </label>
          <label className="block text-[13px] sm:col-span-2">
            <span className="mb-1 block font-medium text-ink">Fuente</span>
            <input
              name="source"
              placeholder="Referido, web, Facebook…"
              className={fieldClass}
            />
          </label>
          <label className="block text-[13px] sm:col-span-2">
            <span className="mb-1 block font-medium text-ink">Dirección</span>
            <input name="addressLine1" className={fieldClass} />
          </label>
          <label className="block text-[13px] sm:col-span-2">
            <span className="mb-1 block font-medium text-ink">
              Dirección (línea 2)
            </span>
            <input name="addressLine2" className={fieldClass} />
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium text-ink">Ciudad</span>
            <input name="city" className={fieldClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[13px]">
              <span className="mb-1 block font-medium text-ink">Estado</span>
              <input
                name="state"
                maxLength={2}
                placeholder="TX"
                className={`${fieldClass} uppercase`}
              />
            </label>
            <label className="block text-[13px]">
              <span className="mb-1 block font-medium text-ink">C.P.</span>
              <input name="postalCode" className={fieldClass} />
            </label>
          </div>
          {error ? (
            <p className="text-[13px] text-danger sm:col-span-2" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            className="w-full sm:col-span-2"
            disabled={pending}
          >
            Agregar
          </Button>
        </form>
      </AgencyModal>

      <AgencyModal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          resetImportState();
        }}
        title="Importar clientes"
      >
        <div className="space-y-3">
          <p className="text-[13px] text-text-secondary">
            CSV con columnas <code className="font-mono">name,email</code> (o{" "}
            <code className="font-mono">firstName,lastName,email</code>).
            Primero previsualiza; solo se crean filas nuevas con correo.
          </p>
          {!preview ? (
            <form action={onPreview} className="space-y-3">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-surface bg-nav-hover px-4 py-8 text-center">
                <Upload className="mb-2 size-6 text-action-primary" aria-hidden />
                <span className="text-[13px] font-medium text-ink">
                  Arrastra o elige un CSV
                </span>
                <input
                  name="file"
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  required
                />
              </label>
              {error ? (
                <p className="text-[13px] text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              {importResult ? (
                <p className="text-[13px] text-text-secondary">{importResult}</p>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={pending}
              >
                Previsualizar
              </Button>
            </form>
          ) : (
            <div className="space-y-3">
              <ul className="grid grid-cols-2 gap-2 text-[12px] text-text-secondary sm:grid-cols-3">
                {(
                  Object.keys(STATUS_LABEL) as Array<
                    keyof typeof STATUS_LABEL
                  >
                ).map((key) => (
                  <li
                    key={key}
                    className="rounded-control bg-nav-hover px-2 py-1.5"
                  >
                    <span className="font-medium text-ink">
                      {preview.counts[key]}
                    </span>{" "}
                    {STATUS_LABEL[key]}
                  </li>
                ))}
              </ul>
              <div className="max-h-56 overflow-auto rounded-control border border-border-subtle">
                <table className="w-full text-left text-[12px]">
                  <thead className="sticky top-0 bg-surface-app text-text-secondary">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Fila</th>
                      <th className="px-2 py-1.5 font-medium">Nombre</th>
                      <th className="px-2 py-1.5 font-medium">Correo</th>
                      <th className="px-2 py-1.5 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, PREVIEW_ROW_LIMIT).map((row) => (
                      <tr key={row.row} className="border-t border-border-subtle">
                        <td className="px-2 py-1 tabular-nums">{row.row}</td>
                        <td className="px-2 py-1">
                          {[row.firstName, row.lastName]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </td>
                        <td className="px-2 py-1 font-mono text-[11px]">
                          {row.email ?? "—"}
                        </td>
                        <td className="px-2 py-1">
                          {STATUS_LABEL[row.status]}
                          {row.message ? (
                            <span className="block text-text-secondary">
                              {row.message}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > PREVIEW_ROW_LIMIT ? (
                <p className="text-[12px] text-text-secondary">
                  y {preview.rows.length - PREVIEW_ROW_LIMIT} filas más…
                </p>
              ) : null}
              {error ? (
                <p className="text-[13px] text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              {importResult ? (
                <p className="text-[13px] text-text-secondary">{importResult}</p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={pending}
                  onClick={() => {
                    resetImportState();
                  }}
                >
                  Otro archivo
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="w-full"
                  disabled={pending || preview.counts.create === 0}
                  onClick={onConfirmImport}
                >
                  Confirmar importación
                  {preview.counts.create > 0
                    ? ` (${preview.counts.create})`
                    : ""}
                </Button>
              </div>
            </div>
          )}
        </div>
      </AgencyModal>

      <AgencyModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Comparte tu enlace"
        closeOnEscape
      >
        {shareUrl ? (
          <div className="space-y-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-action-primary">
              Enlace de intake / registro
            </p>
            <p className="break-all rounded-control bg-surface-app px-3 py-2 font-mono text-[12px] text-ink">
              {shareUrl}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="primary" onClick={copyShare}>
                Copiar
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  window.open(
                    `https://wa.me/?text=${encodeURIComponent(shareUrl)}`,
                    "_blank",
                  )
                }
              >
                WhatsApp
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  window.open(
                    `mailto:?subject=${encodeURIComponent("Tu enlace")}&body=${encodeURIComponent(shareUrl)}`,
                  )
                }
              >
                Email
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  window.open(
                    `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}`,
                    "_blank",
                  )
                }
              >
                QR
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-text-secondary">
            No hay enlace de intake activo. Crea uno desde un cliente o activa
            FEATURE_PUBLIC_INTAKE.
          </p>
        )}
      </AgencyModal>
    </>
  );
}
