import { FileQuestion } from "lucide-react";
import { ButtonLink } from "@/src/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-app px-4">
      <div className="w-full max-w-md rounded-surface bg-surface-elevated p-8 text-center jh-overlay-shadow">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface-panel text-text-secondary">
          <FileQuestion className="size-6" strokeWidth={1.75} aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-ink">Página no encontrada</h1>
        <p className="mt-2 text-pretty text-sm text-text-secondary">
          La ruta que buscas no existe o fue movida.
        </p>
        <ButtonLink href="/" className="mt-6">
          Volver al inicio
        </ButtonLink>
      </div>
    </div>
  );
}
