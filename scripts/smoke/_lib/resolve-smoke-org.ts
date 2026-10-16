/**
 * Org resolution for write smokes (e2e-flow, letters-smoke, …).
 *
 * Allowlist (default):
 *   1. SMOKE_ORG_NAME exact match, if the name is smoke-safe
 *   2. First org whose name contains "TEST JH-CRM"
 *
 * Production JH ("J&H Multiservices …") is refused unless SMOKE_ALLOW_JH=1.
 * Never silently pick the first OWNER membership on a live org.
 */
import type { PrismaClient } from "@prisma/client";

export const SMOKE_TEST_ORG_NEEDLE = "TEST JH-CRM";
export const SMOKE_PROD_JH_NEEDLE = "J&H Multiservices";

export type SmokeOrgRow = {
  id: string;
  name: string;
};

export type ResolveSmokeOrgOptions = {
  /** Exact org name override (env SMOKE_ORG_NAME). */
  smokeOrgName?: string | null;
  /** Explicit escape hatch (env SMOKE_ALLOW_JH). */
  allowJh?: boolean;
  /** Prod JH name needle; default "J&H Multiservices". */
  prodJhNeedle?: string;
  /** Safe TEST needle; default "TEST JH-CRM". */
  testNeedle?: string;
};

export function isTruthyEnv(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isSmokeSafeOrgName(
  name: string,
  opts: ResolveSmokeOrgOptions = {},
): boolean {
  const testNeedle = opts.testNeedle ?? SMOKE_TEST_ORG_NEEDLE;
  const prodNeedle = opts.prodJhNeedle ?? SMOKE_PROD_JH_NEEDLE;
  const allowJh = opts.allowJh ?? false;

  if (name.includes(testNeedle)) return true;
  if (name.includes(prodNeedle)) return allowJh;
  // Explicit SMOKE_ORG_NAME for a non-JH sandbox (e.g. "PRUEBA Sandbox")
  // is allowed when it does not look like the live JH org.
  if (opts.smokeOrgName && name === opts.smokeOrgName && !name.includes(prodNeedle)) {
    return true;
  }
  return false;
}

export function pickSmokeOrg(
  orgs: SmokeOrgRow[],
  opts: ResolveSmokeOrgOptions = {},
): SmokeOrgRow {
  const testNeedle = opts.testNeedle ?? SMOKE_TEST_ORG_NEEDLE;
  const allowJh = opts.allowJh ?? false;
  const named = opts.smokeOrgName?.trim() || null;

  if (named) {
    const hit = orgs.find((o) => o.name === named);
    if (!hit) {
      throw new Error(
        `SMOKE_ORG_NAME="${named}" not found. Create a TEST JH-CRM org or fix the name.`,
      );
    }
    if (!isSmokeSafeOrgName(hit.name, { ...opts, smokeOrgName: named, allowJh })) {
      throw new Error(
        `Refusing org "${hit.name}": not a smoke-safe org. ` +
          `Use a name containing "${testNeedle}", or set SMOKE_ALLOW_JH=1 for live JH.`,
      );
    }
    return hit;
  }

  const testOrg = orgs.find((o) => o.name.includes(testNeedle));
  if (testOrg) return testOrg;

  if (allowJh) {
    const prodNeedle = opts.prodJhNeedle ?? SMOKE_PROD_JH_NEEDLE;
    const jh = orgs.find((o) => o.name.includes(prodNeedle));
    if (jh) return jh;
    throw new Error(
      `SMOKE_ALLOW_JH=1 but no org matching "${prodNeedle}" was found.`,
    );
  }

  throw new Error(
    `No smoke-safe organization found. Prefer an org whose name contains ` +
      `"${testNeedle}", set SMOKE_ORG_NAME=<exact>, or (explicit only) SMOKE_ALLOW_JH=1.`,
  );
}

export async function resolveSmokeOrg(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SmokeOrgRow & { ownerUserId: string }> {
  const opts: ResolveSmokeOrgOptions = {
    smokeOrgName: env.SMOKE_ORG_NAME ?? null,
    allowJh: isTruthyEnv(env.SMOKE_ALLOW_JH),
  };

  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  const org = pickSmokeOrg(orgs, opts);

  const owner = await prisma.organizationMember.findFirst({
    where: { organizationId: org.id, role: "OWNER" },
    select: { userId: true },
  });
  if (!owner) {
    throw new Error(`Org "${org.name}" (${org.id}) has no OWNER member.`);
  }

  return { ...org, ownerUserId: owner.userId };
}
