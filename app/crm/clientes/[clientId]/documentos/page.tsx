import { redirect } from "next/navigation";

/** Compat: Documentos → Expediente (el expediente ya lista y sube documentos). */
export default async function ClientRedirect({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/crm/clientes/${clientId}/expediente`);
}
