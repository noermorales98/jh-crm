import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";

/**
 * Compuerta previa al envío de rondas y a los enlaces de pago de un caso.
 * Vale un contrato SIGNED del cliente para ese caso o sin caso asignado.
 */

export const MISSING_SIGNED_CONTRACT =
  "Falta el contrato firmado del cliente. Envíalo a firmar desde Contratos.";

export type SignedContractGate = {
  allowed: boolean;
  reason: string | null;
};

export async function getSignedContractGate(
  organizationId: string,
  clientId: string,
  caseId: string,
): Promise<SignedContractGate> {
  const signed = await prisma.clientContract.findFirst({
    where: {
      organizationId,
      clientId,
      status: "SIGNED",
      OR: [{ caseId }, { caseId: null }],
    },
    select: { id: true },
  });
  return signed
    ? { allowed: true, reason: null }
    : { allowed: false, reason: MISSING_SIGNED_CONTRACT };
}

export async function assertSignedContract(
  organizationId: string,
  clientId: string,
  caseId: string,
): Promise<void> {
  const gate = await getSignedContractGate(organizationId, clientId, caseId);
  if (!gate.allowed) throw new DomainError(MISSING_SIGNED_CONTRACT);
}
