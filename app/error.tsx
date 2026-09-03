"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/src/components/ui";

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
    <div className="flex min-h-screen items-center justify-center bg-surface-app px-4">
      <div className="w-full max-w-md rounded-surface bg-surface-elevated p-8 text-center jh-overlay-shadow">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning-ink">
          <TriangleAlert className="size-6" strokeWidth={1.75} aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-ink">Algo salió mal</h1>
        <p className="mt-2 text-pretty text-sm text-text-secondary">
          Ocurrió un error inesperado. Puedes intentar de nuevo; si el problema
          persiste, contacta al administrador.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-text-secondary">
            Referencia: {error.digest}
          </p>
        ) : null}
        <Button onClick={reset} className="mt-6">
          Intentar de nuevo
        </Button>
      </div>
    </div>
  );
}
