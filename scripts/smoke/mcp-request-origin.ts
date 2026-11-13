/**
 * Origen de la petición (conector MCP, AC-8): lo que hace Claude queda en actividad y
 * auditoría con `via: "claude"` y la conexión; lo que hace la app no cambia y no puede
 * hacerse pasar por Claude.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-request-origin.ts
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^mysql:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\/jh_gates(\?|$)/.test(databaseUrl)) {
  throw new Error("mcp-request-origin solo corre contra la base local desechable jh_gates.");
}

const prisma = new PrismaClient();
const MARK = `origin${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

function meta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function makeOrg(): Promise<OrganizationContext> {
  const user = await prisma.user.create({
    data: { email: `${MARK}@example.test`, passwordHash: "x", name: "Origin" },
  });
  const org = await prisma.organization.create({ data: { name: `TEST JH-CRM ${MARK}` } });
  await prisma.organizationMember.create({
    data: { userId: user.id, organizationId: org.id, role: "OWNER" },
  });
  await prisma.organizationSettings.create({ data: { organizationId: org.id } });
  return { userId: user.id, organizationId: org.id, role: "OWNER" };
}

async function run(ctx: OrganizationContext) {
  const { runWithRequestOrigin, currentRequestOrigin } = await import(
    "../../src/server/request-origin"
  );
  const { writeActivityLog } = await import("../../src/server/activity");
  const { writeAuditLog } = await import("../../src/server/audit");

  const client = await prisma.client.create({
    data: {
      organizationId: ctx.organizationId,
      clientCode: `O-${MARK}`.slice(0, 20),
      firstName: "Origin",
      lastName: "Test",
      status: "ACTIVE",
    },
  });
  const actx = { organizationId: ctx.organizationId, actorUserId: ctx.userId };

  // Fuera del conector: idéntico a hoy.
  const plainActivity = await writeActivityLog(actx, {
    type: "NOTE",
    description: "sin origen",
    clientId: client.id,
    metadata: { foo: 1 },
  });
  const plainAudit = await writeAuditLog(actx, {
    action: "test.plain",
    entityType: "Client",
    entityId: client.id,
  });
  check("sin origen: actividad sin `via`", !("via" in meta(plainActivity.metadata)), plainActivity.metadata);
  check("sin origen: actividad conserva su metadata", meta(plainActivity.metadata).foo === 1);
  check("sin origen: auditoría sin metadata nueva", plainAudit.metadata === null, plainAudit.metadata);
  check("sin origen: current() vacío", Object.keys(currentRequestOrigin()).length === 0);

  // Fuera del conector nadie puede hacerse pasar por Claude.
  const forged = await writeAuditLog(actx, {
    action: "test.forged",
    entityType: "Client",
    entityId: client.id,
    metadata: { via: "claude", connectionId: "fake", foo: 3 },
  });
  check("sin origen: `via` falso se quita", !("via" in meta(forged.metadata)), forged.metadata);
  check(
    "sin origen: `connectionId` falso se quita",
    !("connectionId" in meta(forged.metadata)),
    forged.metadata,
  );
  check("sin origen: el resto de la metadata se conserva", meta(forged.metadata).foo === 3);

  // Dentro del conector.
  const connectionId = `conn-${MARK}`;
  const [act, aud, overridden, inner] = await runWithRequestOrigin(
    { via: "claude", connectionId },
    async () => {
      const a = await writeActivityLog(actx, {
        type: "NOTE",
        description: "con origen",
        clientId: client.id,
        metadata: { foo: 2 },
      });
      const b = await writeAuditLog(actx, {
        action: "test.claude",
        entityType: "Client",
        entityId: client.id,
      });
      // La metadata del llamador no puede pisar el origen.
      const c = await writeActivityLog(actx, {
        type: "NOTE",
        description: "intento de pisar el origen",
        clientId: client.id,
        metadata: { via: "app", connectionId: "otra" },
      });
      // El origen sobrevive a un salto asíncrono.
      await new Promise((resolve) => setTimeout(resolve, 5));
      return [a, b, c, currentRequestOrigin()] as const;
    },
  );
  check("con origen: actividad lleva via=claude", meta(act.metadata).via === "claude", act.metadata);
  check(
    "con origen: actividad lleva connectionId",
    meta(act.metadata).connectionId === connectionId,
    act.metadata,
  );
  check("con origen: actividad conserva su metadata", meta(act.metadata).foo === 2, act.metadata);
  check("con origen: auditoría lleva via=claude", meta(aud.metadata).via === "claude", aud.metadata);
  check(
    "con origen: auditoría lleva connectionId",
    meta(aud.metadata).connectionId === connectionId,
    aud.metadata,
  );
  check(
    "con origen: la metadata del llamador no pisa via",
    meta(overridden.metadata).via === "claude",
    overridden.metadata,
  );
  check(
    "con origen: la metadata del llamador no pisa connectionId",
    meta(overridden.metadata).connectionId === connectionId,
    overridden.metadata,
  );
  check("con origen: current() tras await", inner.via === "claude" && inner.connectionId === connectionId);
  check("tras salir: current() vuelve a vacío", Object.keys(currentRequestOrigin()).length === 0);
}

async function main() {
  console.log("\n[mcp-request-origin] origen Claude en actividad y auditoría\n");
  // Componentes de cliente importan de forma transitiva este módulo (vía auditoría y
  // actividad): un import estático de un módulo de Node rompe el bundle del navegador.
  const source = readFileSync(new URL("../../src/server/request-origin.ts", import.meta.url), "utf8");
  check("request-origin no importa módulos de Node de forma estática (rompe el build del navegador)",
    !/^\s*import[^;]*from\s+["']node:/m.test(source) && !/require\(["']node:/.test(source));
  const ctx = await makeOrg();
  try {
    await run(ctx);
  } finally {
    // Limpieza: solo lo creado por esta prueba (la org arrastra cliente y registros).
    await prisma.organization.delete({ where: { id: ctx.organizationId } });
    await prisma.user.delete({ where: { id: ctx.userId } });
  }
}

main()
  .catch((error) => {
    failed += 1;
    console.error(error);
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (failed > 0) {
      console.error(`\n✗ ${failed} comprobación(es) fallaron\n`);
      process.exit(1);
    }
    console.log("\n✓ mcp-request-origin OK\n");
  });
