/**
 * Herramientas de escritura de consultas del conector MCP contra una base real y desechable.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-consultations.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, errorName, meta, seedMcpOrg } from "./_lib/mcp-seed";

async function errorText(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`;
  }
}

assertDisposableDb();
process.env.FEATURE_MCP_CONNECTOR = "true";

const prisma = new PrismaClient();
const MARK = `mcpcons${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function main() {
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const { consultationsTools } = await import("../../src/server/mcp/tools/consultations");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  const calls: Array<{ path: string; type?: string }> = [];
  const opts = { tools: consultationsTools, revalidate: (path: string, type?: "layout" | "page") => void calls.push({ path, type }) };
  const call = (ctx: typeof a.staff, name: string, args: unknown) => callTool(ctx, name, args, opts) as Promise<Record<string, unknown>>;

  try {
    const auditOf = (name: string, entityId: string) =>
      prisma.auditLog.findFirst({ where: { organizationId: a.org.id, action: `mcp.tool.${name}`, entityId } });
    const count = () => prisma.consultation.count({ where: { organizationId: a.org.id } });
    const mk = (organizationId: string, clientId: string, extra: object = {}) =>
      prisma.consultation.create({ data: { organizationId, clientId, amount: 1, status: "REQUESTED", ...extra } });

    check("metadatos: dos herramientas con permiso consultations.manage",
      consultationsTools.length === 2 && consultationsTools.every((t) => t.permission === "consultations.manage"));
    const solicitar = consultationsTools.find((t) => t.name === "solicitar_consulta")!;
    const cambiar = consultationsTools.find((t) => t.name === "cambiar_estado_consulta")!;
    check("solicitar_consulta es destructive y de mundo abierto (avisa por correo y WhatsApp externo)", solicitar.kind === "destructive" && solicitar.openWorld === true, { kind: solicitar.kind, openWorld: solicitar.openWorld });
    check("solicitar_consulta avisa de correo, WhatsApp, servicio externo y confirmación",
      /correo/i.test(solicitar.description) && /whatsapp/i.test(solicitar.description) && /externo/i.test(solicitar.description) && /confirm/i.test(solicitar.description), solicitar.description);
    check("solicitar_consulta no promete deshacer", !/deshac|revert|reabr|recuper|restaur/i.test(solicitar.description), solicitar.description);
    check("cambiar_estado_consulta es destructive y no abre mundo", cambiar.kind === "destructive" && !cambiar.openWorld, { kind: cambiar.kind, openWorld: cambiar.openWorld });

    console.log("solicitar_consulta");
    const before = await count();
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "solicitar_consulta", { clientId: a.client.id }))).includes("Sin permiso"));
    check("VIEWER no escribe", (await count()) === before);
    calls.length = 0;
    const created = await call(a.staff, "solicitar_consulta", { clientId: a.client.id, amount: 25, notes: `  nota ${MARK} ` });
    const row = await prisma.consultation.findUnique({ where: { id: String(created.id) } });
    check("STAFF solicita la consulta", !!row && row.status === "REQUESTED" && row.clientId === a.client.id && row.amount.toString() === "25" && row.notes === `nota ${MARK}`, row);
    check("devuelve id, estado y href", created.status === "REQUESTED" && String(created.href).endsWith("/crm/consultas"), created);
    const au = await auditOf("solicitar_consulta", String(created.id));
    check("auditoría con via claude y entidad Consultation", !!au && au.entityType === "Consultation" && meta(au.metadata).via === "claude", au);
    check("refresca consultas y el cliente", calls.some((c) => c.path === "/crm/consultas") && calls.some((c) => c.path === `/crm/clientes/${a.client.id}`), calls);
    const dflt = await call(a.owner, "solicitar_consulta", { clientId: a.client.id });
    check("monto por defecto 1", (await prisma.consultation.findUnique({ where: { id: String(dflt.id) } }))?.amount.toString() === "1");
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "solicitar_consulta", { clientId: "" }))) === "ZodError");
    const n1 = await count();
    check("cliente de otra organización: NotFoundError y no se crea", (await errorText(() => call(a.staff, "solicitar_consulta", { clientId: b.client.id }))) === "NotFoundError: No encontrado." && (await count()) === n1);

    console.log("cambiar_estado_consulta");
    const c1 = await mk(a.org.id, a.client.id);
    const foreign = await mk(b.org.id, b.client.id);
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "cambiar_estado_consulta", { consultaId: c1.id, status: "SCHEDULED" }))).includes("Sin permiso"));
    calls.length = 0;
    const when = "2026-12-01T15:00:00.000Z";
    const upd = await call(a.staff, "cambiar_estado_consulta", { consultaId: c1.id, status: "SCHEDULED", scheduledAt: when, notes: "agendada" });
    const e = await prisma.consultation.findUnique({ where: { id: c1.id } });
    check("STAFF agenda", e?.status === "SCHEDULED" && e.scheduledAt?.toISOString() === when && e.notes === "agendada", e);
    check("devuelve id, estado y href", upd.id === c1.id && upd.status === "SCHEDULED" && String(upd.href).endsWith("/crm/consultas"), upd);
    const au2 = await auditOf("cambiar_estado_consulta", c1.id);
    check("auditoría", !!au2 && au2.entityType === "Consultation" && meta(au2.metadata).via === "claude", au2);
    check("refresca consultas y el cliente", calls.some((c) => c.path === "/crm/consultas") && calls.some((c) => c.path === `/crm/clientes/${a.client.id}`), calls);
    await call(a.staff, "cambiar_estado_consulta", { consultaId: c1.id, status: "COMPLETED" });
    check("STAFF completa", (await prisma.consultation.findUnique({ where: { id: c1.id } }))?.status === "COMPLETED");
    check("transición inválida -> error y sin cambios", (await errorText(() => call(a.staff, "cambiar_estado_consulta", { consultaId: c1.id, status: "SCHEDULED" }))).startsWith("DomainError") && (await prisma.consultation.findUnique({ where: { id: c1.id } }))?.status === "COMPLETED");
    const c2 = await mk(a.org.id, a.client.id);
    await call(a.staff, "cambiar_estado_consulta", { consultaId: c2.id, status: "CANCELLED" });
    check("STAFF cancela (la consulta sigue existiendo)", (await prisma.consultation.findUnique({ where: { id: c2.id } }))?.status === "CANCELLED");
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "cambiar_estado_consulta", { consultaId: c2.id, status: "NOPE" }))) === "ZodError");
    const c3 = await mk(a.org.id, a.client.id);
    for (const blocked of ["PAID", "PAYMENT_PENDING"]) {
      check(`estado ${blocked} no se acepta (los cobros van aparte) -> ZodError y sin cambios`,
        (await errorName(() => call(a.staff, "cambiar_estado_consulta", { consultaId: c3.id, status: blocked }))) === "ZodError" &&
          (await prisma.consultation.findUnique({ where: { id: c3.id } }))?.status === "REQUESTED");
    }
    check("la descripción no ofrece PAID ni PAYMENT_PENDING", !/PAID|PAYMENT_PENDING/.test(cambiar.description), cambiar.description);
    check("consulta ajena -> NotFoundError y sin cambios", (await errorText(() => call(a.staff, "cambiar_estado_consulta", { consultaId: foreign.id, status: "SCHEDULED" }))) === "NotFoundError: No encontrado." && (await prisma.consultation.findUnique({ where: { id: foreign.id } }))!.status === "REQUESTED");
  } finally {
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
  if (failed) {
    console.error(`\n${failed} comprobaciones fallaron`);
    process.exit(1);
  }
  console.log("\nmcp-write-consultations: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
