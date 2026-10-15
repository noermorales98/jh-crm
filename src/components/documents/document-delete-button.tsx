"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/src/components/ui";
import { classifyUploadError } from "@/src/lib/uploads/fetch-error";

/**
 * Botón de eliminación (soft delete) de un documento.
 * DELETE /api/files/[documentId] — errores de auth/red diferenciados.
 */
export function DocumentDeleteButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <ConfirmDialog
        title="Eliminar documento"
        message="El documento se eliminará de la lista (borrado lógico). Esta acción queda registrada en auditoría."
        confirmLabel="Eliminar"
        danger
        trigger={
          <button
            type="button"
            title="Eliminar"
            aria-label="Eliminar documento"
            className="inline-flex size-8 items-center justify-center rounded-control text-danger-ink transition-colors hover:bg-danger-soft"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        }
        onConfirm={async () => {
          setError(null);
          try {
            const res = await fetch(`/api/files/${documentId}`, {
              method: "DELETE",
              redirect: "error",
            });
            let json: unknown = null;
            try {
              json = await res.json();
            } catch {
              json = null;
            }
            const payload = json as { ok?: boolean; error?: string } | null;
            if (!res.ok || !payload?.ok) {
              const classified = classifyUploadError({
                error: new Error(payload?.error ?? "No se pudo eliminar."),
                phase: "delete",
                httpStatus: res.status,
                responseBody: json,
              });
              return classified.message;
            }
            router.refresh();
          } catch (err) {
            return classifyUploadError({
              error: err,
              phase: "delete",
            }).message;
          }
        }}
      />
      {error ? <span className="text-xs text-danger-ink">{error}</span> : null}
    </div>
  );
}
