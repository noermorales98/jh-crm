import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pago cancelado",
};

export default async function PayCancelPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-ink">Pago cancelado</h1>
      <p className="text-sm text-text-secondary">
        No se realizó ningún cargo. Puedes cerrar esta ventana o intentar de
        nuevo cuando el equipo te envíe el enlace.
      </p>
      <Link
        href="/"
        className="text-sm font-medium text-action-primary hover:underline"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
