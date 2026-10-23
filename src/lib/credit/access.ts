/**
 * Autorización de crédito. La organización sale del actor de sesión.
 * Un organizationId recibido en el body no es argumento de esta función.
 */
import type { Role } from "@prisma/client";
import { ForbiddenError } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { assertSameCreditScope, type CreditScope } from "./contracts";

export type CreditActor = {
  organizationId: string;
  role: Role;
};

export type CreditAccessMode = "view" | "manage";

const ACTION = {
  view: "creditReports.view",
  manage: "creditReports.manage",
} as const;

export function assertCreditAccess(input: {
  actor: CreditActor;
  clientId: string;
  resource: CreditScope;
  mode: CreditAccessMode;
}): void {
  if (!can(input.actor.role, ACTION[input.mode])) {
    throw new ForbiddenError();
  }
  assertSameCreditScope(
    { organizationId: input.actor.organizationId, clientId: input.clientId },
    input.resource,
  );
}

export function creditClientForRole<T extends { ssnLast4: string | null }>(
  role: Role,
  client: T | null,
): T | null {
  if (client == null) return null;
  if (can(role, "sensitive.view")) return client;
  return { ...client, ssnLast4: null };
}

export function creditProposalClientForRole<
  T extends { ssnLast4?: string | null; dateOfBirth?: string | null },
>(role: Role, client: T | null | undefined): T | null | undefined {
  if (client == null) return client;
  if (can(role, "sensitive.view")) return client;
  return { ...client, ssnLast4: null, dateOfBirth: null };
}
