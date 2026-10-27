import { redirect, notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { resolveClientIdForCase } from "@/src/server/rounds/embedded-detail";

/**
 * Legacy: detalle de ronda abre en Avance → Gestión del hub de cliente.
 */
export default async function CaseRoundDetailRedirectPage({
  params,
}: {
  params: Promise<{ caseId: string; roundId: string }>;
}) {
  const { caseId, roundId } = await params;
  const ctx = await requireOrganization();
  const clientId = await resolveClientIdForCase(ctx, caseId);
  if (!clientId) notFound();
  redirect(
    `/crm/clientes/${clientId}?panel=avance&roundId=${encodeURIComponent(roundId)}`,
  );
}
