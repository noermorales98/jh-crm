import { redirect } from "next/navigation";

/** Compat: Notas → Actividad (Fase 1: una sola pestaña). */
export default async function ClientRedirect({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/crm/clientes/${clientId}/actividad`);
}
