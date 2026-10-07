import { redirect } from "next/navigation";

/**
 * Actividad vive en el Resumen (preview + panel). Deep link → Resumen.
 */
export default async function ClientActivityRedirect({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/crm/clientes/${clientId}#actividad`);
}
