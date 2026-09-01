"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Nunca loguear PII; solo el digest del error.
    console.error("Error no controlado:", error.digest ?? error.name);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-panel px-4">
      <div className="w-full max-w-md rounded-surface border border-border-subtle bg-surface-elevated p-8 text-center">
        <TriangleAlert className="mx-auto mb-4 size-10 text-amber-500" aria-hidden />
        <h1 className="text-lg font-semibold text-ink">
          Algo salió mal
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Ocurrió un error inesperado. Puedes intentar de nuevo; si el problema
          persiste, contacta al administrador.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-text-secondary">
            Referencia: {error.digest}
          </p>
        ) : null}
        <button
          onClick={reset}
          className="mt-6 rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white hover:bg-action-secondary"
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}
