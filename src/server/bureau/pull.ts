import { DomainError } from "@/src/server/errors";
import type { OrganizationContext } from "@/src/server/auth/guards";
import {
  attemptBureauPull,
  type BureauPullRequest,
} from "@/src/lib/bureau/provider";

/**
 * Staff-facing bureau pull entry. Fail-closed until AU-006 provider is wired.
 */
export async function requestBureauPull(
  ctx: OrganizationContext,
  input: Omit<BureauPullRequest, "organizationId">,
): Promise<never> {
  const result = attemptBureauPull({
    ...input,
    organizationId: ctx.organizationId,
  });
  if (!result.ok) {
    throw new DomainError(result.message);
  }
  // Future: persist CreditReport from provider payload.
  throw new DomainError(
    "El proveedor respondió OK pero el adaptador de persistencia aún no está implementado.",
  );
}
