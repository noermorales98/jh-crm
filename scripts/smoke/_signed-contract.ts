/**
 * Contrato firmado para smokes que deben llamar markRoundSent.
 */
import { prisma } from "../../src/lib/db";
import type { OrganizationContext } from "../../src/server/auth/guards";

export async function signContractForRound(ctx: OrganizationContext, roundId: string) {
  const round = await prisma.creditRound.findFirstOrThrow({
    where: { id: roundId, case: { organizationId: ctx.organizationId } },
    select: { caseId: true, case: { select: { clientId: true } } },
  });
  await prisma.clientContract.create({
    data: {
      organizationId: ctx.organizationId,
      clientId: round.case.clientId,
      caseId: round.caseId,
      title: "Contrato de smoke",
      version: "smoke-1",
      contentSnapshot: "Contrato de smoke",
      status: "SIGNED",
      signedAt: new Date(),
    },
  });
}
