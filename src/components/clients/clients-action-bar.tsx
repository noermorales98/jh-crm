"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Link2, Plus, Upload } from "lucide-react";
import { Button } from "@/src/components/ui";
import { AgencyModal } from "@/src/components/agency/agency-modal";
import {
  createClient,
  importClientsCsv,
} from "@/src/actions/clients";

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

  function onAdd(formData: FormData) {
    setError(null);
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    startTransition(async () => {
      const result = await createClient({
        firstName,
        lastName: lastName || undefined,
        email: email || undefined,
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

  function onImport(formData: FormData) {
    setError(null);
    setImportResult(null);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Selecciona un archivo CSV.");
      return;
    }
    startTransition(async () => {
      const text = await file.text();
      const result = await importClientsCsv(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setImportResult(
        `Importados: ${result.data.created}. Errores: ${result.data.errors.length}.`,
      );
      if (result.data.errors.length === 0) {
        setImportOpen(false);
        router.refresh();
      } else {
        router.refresh();
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
      >
        <form action={onAdd} className="space-y-3">
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium text-ink">Nombre</span>
            <input
              name="firstName"
              required
              className="w-full rounded-xl border border-border-subtle bg-surface-app px-3 py-2.5 text-sm outline-none focus:border-action-primary"
            />
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium text-ink">Apellido</span>
            <input
              name="lastName"
              className="w-full rounded-xl border border-border-subtle bg-surface-app px-3 py-2.5 text-sm outline-none focus:border-action-primary"
            />
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium text-ink">Correo</span>
            <input
              name="email"
              type="email"
              className="w-full rounded-xl border border-border-subtle bg-surface-app px-3 py-2.5 text-sm outline-none focus:border-action-primary"
            />
          </label>
          {error ? (
            <p className="text-[13px] text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={pending}
          >
            Agregar
          </Button>
        </form>
      </AgencyModal>

      <AgencyModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importar clientes"
      >
        <form action={onImport} className="space-y-3">
          <p className="text-[13px] text-text-secondary">
            CSV con columnas <code className="font-mono">name,email</code> (o{" "}
            <code className="font-mono">firstName,lastName,email</code>).
            Compatible con exportaciones tipo Dispute Fox / Credit Repair Cloud.
          </p>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border-subtle bg-surface-app px-4 py-8 text-center">
            <Upload className="mb-2 size-6 text-action-primary" aria-hidden />
            <span className="text-[13px] font-medium text-ink">
              Arrastra o elige un CSV / XLSX
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
            Importar
          </Button>
        </form>
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
            <p className="break-all rounded-xl border border-border-subtle bg-surface-app px-3 py-2 font-mono text-[12px] text-ink">
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
