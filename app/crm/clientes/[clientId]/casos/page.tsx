import { redirect } from "next/navigation";

/** Compat: /casos → /servicios (CL-002). */
export default async function ClientCasesRedirect({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/crm/clientes/${clientId}/servicios`);
}
