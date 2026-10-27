import { redirect } from "next/navigation";
import { caseHref } from "@/src/lib/routes/case-routes";

/** Compat: /servicios/:caseId/<sección> → la ruta de la sección en el cliente. */
export default async function LegacyServiceSectionRedirect({
  params,
}: {
  params: Promise<{ clientId: string; caseId: string; rest: string[] }>;
}) {
  const { clientId, caseId, rest } = await params;
  const target = caseHref(clientId, caseId, `/${rest.join("/")}`);
  redirect(target.endsWith(`/servicios/${caseId}/${rest.join("/")}`) ? `/crm/clientes/${clientId}/servicios/${caseId}` : target);
}
