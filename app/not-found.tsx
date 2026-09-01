import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-panel px-4">
      <div className="w-full max-w-md rounded-surface border border-border-subtle bg-surface-elevated p-8 text-center">
        <FileQuestion className="mx-auto mb-4 size-10 text-text-secondary" aria-hidden />
        <h1 className="text-lg font-semibold text-ink">
          Página no encontrada
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          La ruta que buscas no existe o fue movida.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white hover:bg-action-secondary"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
