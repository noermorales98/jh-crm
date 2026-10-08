import { redirect, notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { resolveClientIdForCase } from "@/src/server/rounds/embedded-detail";

/**
 * Legacy: el centro de rondas vive en Avance del hub de cliente.
 */
export default async function CaseRoundsRedirectPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const ctx = await requireOrganization();
  const clientId = await resolveClientIdForCase(ctx, caseId);
  if (!clientId) notFound();
  redirect(`/crm/clientes/${clientId}?panel=avance`);
}
