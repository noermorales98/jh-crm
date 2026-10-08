/**
 * PR-SEC-02 — PUBLIC_ORG_ID + rate limit del contacto.
 *
 * Parte A (siempre, sin DB): sin PUBLIC_ORG_ID no se resuelve org.
 * Parte B (si hay DATABASE_URL): dos orgs sintéticas + rate limit.
 *
 * Uso:
 *   npx tsx scripts/smoke/contact-public-org.ts
 *   npm run smoke:contact-public   # con .env.local para parte B
 */
import { contactFormSchema } from "../../src/lib/validation/contact";
import {
  readPublicOrganizationIdFromEnv,
  resolvePublicOrganizationId,
} from "../../src/server/contact";
import { DomainError, RateLimitError } from "../../src/server/errors";
import { assertRateLimit } from "../../src/server/security/rate-limit";

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function partA_noEnv() {
  console.log("\n[PR-SEC-02] A — sin PUBLIC_ORG_ID (sin DB)");
  const prev = process.env.PUBLIC_ORG_ID;
  delete process.env.PUBLIC_ORG_ID;

  check("env ausente → null", readPublicOrganizationIdFromEnv() === null);

  process.env.PUBLIC_ORG_ID = "   ";
  check("env solo espacios → null", readPublicOrganizationIdFromEnv() === null);

  process.env.PUBLIC_ORG_ID = "";
  try {
    await resolvePublicOrganizationId();
    throw new Error("SHOULD_THROW");
  } catch (e) {
    check(
      "resolve sin env → DomainError",
      e instanceof DomainError &&
        e.message.includes("no está disponible"),
    );
  }

  // organizationId en el body no entra al schema (se ignora / se descarta).
  const parsed = contactFormSchema.safeParse({
    name: "Ana Prueba",
    email: "sintetico+sec02@example.com",
    phone: "+1 4695550100",
    message: "Mensaje sintético de prueba para el smoke.",
    challengeToken: "tok",
    challengeAnswer: "1",
    privacyAccepted: true,
    organizationId: "org_inyectada_por_cliente",
  });
  check("schema acepta el payload base", parsed.success === true);
  if (parsed.success) {
    check(
      "organizationId no queda en el parse",
      !("organizationId" in parsed.data),
    );
  }

  if (prev === undefined) delete process.env.PUBLIC_ORG_ID;
  else process.env.PUBLIC_ORG_ID = prev;
}

async function partB_withDb() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("\n[PR-SEC-02] B — omitida (sin DATABASE_URL)");
    return { ran: false as const };
  }

  console.log("\n[PR-SEC-02] B — sandbox MySQL");
  const { prisma } = await import("../../src/lib/db");

  const older = await prisma.organization.create({
    data: { name: "Smoke SEC02 Older" },
    select: { id: true },
  });
  // Garantizar createdAt más reciente en la segunda.
  await new Promise((r) => setTimeout(r, 20));
  const newer = await prisma.organization.create({
    data: { name: "Smoke SEC02 Newer" },
    select: { id: true },
  });

  const prev = process.env.PUBLIC_ORG_ID;
  try {
    process.env.PUBLIC_ORG_ID = newer.id;
    const resolved = await resolvePublicOrganizationId();
    check(
      "resolve usa PUBLIC_ORG_ID (la más nueva), no la más antigua",
      resolved === newer.id && resolved !== older.id,
    );

    process.env.PUBLIC_ORG_ID = "org_inexistente_sintetica_sec02";
    try {
      await resolvePublicOrganizationId();
      throw new Error("SHOULD_THROW_MISSING_ORG");
    } catch (e) {
      check(
        "org configurada inexistente → DomainError",
        e instanceof DomainError &&
          e.message.includes("no está disponible"),
      );
    }

    const key = `smoke:contact:rate:${Date.now()}`;
    for (let i = 0; i < 20; i += 1) {
      await assertRateLimit({ key, limit: 20, windowSeconds: 60 });
    }
    try {
      await assertRateLimit({ key, limit: 20, windowSeconds: 60 });
      throw new Error("RATE_FAIL");
    } catch (e) {
      check("intento 21 → RateLimitError", e instanceof RateLimitError);
    }
  } finally {
    if (prev === undefined) delete process.env.PUBLIC_ORG_ID;
    else process.env.PUBLIC_ORG_ID = prev;
    await prisma.organization.deleteMany({
      where: { id: { in: [older.id, newer.id] } },
    });
    await prisma.$disconnect();
  }

  return { ran: true as const };
}

async function main() {
  await partA_noEnv();
  const b = await partB_withDb();
  console.log(
    `\nOK contact-public-org (A siempre; B ${b.ran ? "ejecutada" : "omitida"})\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
