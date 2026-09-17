import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pago recibido",
};

export default async function PaySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; id?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-ink">Pago recibido</h1>
      <p className="text-sm text-text-secondary">
        Gracias. Si el pago se confirmó, el equipo lo verá automáticamente en el
        CRM.
        {params.kind === "consultation"
          ? " Tu consulta quedó registrada como pagada."
          : params.kind === "quote"
            ? " El pago de la cotización quedó registrado."
            : null}
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
