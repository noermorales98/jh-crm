"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/src/components/ui";

/**
 * Botón de eliminación (soft delete) de un documento.
 * DELETE /api/files/[documentId] — trata 307 como sesión expirada.
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
            className="inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Eliminar
          </button>
        }
        onConfirm={async () => {
          setError(null);
          try {
            const res = await fetch(`/api/files/${documentId}`, {
              method: "DELETE",
              redirect: "error",
            });
            const json = (await res.json()) as { ok: boolean; error?: string };
            if (!json.ok) return json.error ?? "No se pudo eliminar.";
            router.refresh();
          } catch (err) {
            if (err instanceof TypeError) {
              return "Tu sesión expiró. Vuelve a iniciar sesión.";
            }
            return "No se pudo eliminar el documento.";
          }
        }}
      />
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
