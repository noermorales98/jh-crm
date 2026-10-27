import { redirect, notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { resolveClientIdForCase } from "@/src/server/rounds/embedded-detail";

/**
 * Legacy: cartas se abren en el stack de Avance (Gestión → ronda → carta).
 * Redirige al detalle de ronda en el hub; el asesor abre la carta desde ahí.
 */
export default async function CaseLetterRedirectPage({
  params,
}: {
  params: Promise<{ caseId: string; roundId: string; letterId: string }>;
}) {
  const { caseId, roundId } = await params;
  const ctx = await requireOrganization();
  const clientId = await resolveClientIdForCase(ctx, caseId);
  if (!clientId) notFound();
  redirect(
    `/crm/clientes/${clientId}?panel=avance&roundId=${encodeURIComponent(roundId)}`,
  );
}
