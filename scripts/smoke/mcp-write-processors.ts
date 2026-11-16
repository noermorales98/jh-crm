/**
 * Herramientas de escritura de procesadores y de sus cuentas de clientes del conector MCP
 * contra una base real y desechable. Un procesador no se borra: se desactiva.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-processors.ts
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
const MARK = `mcpproc${Date.now()}`;
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
  const { processorsTools } = await import("../../src/server/mcp/tools/processors");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  const specialist = await a.member("SPECIALIST");
  const calls: Array<{ path: string; type?: string }> = [];
  const opts = { tools: processorsTools, revalidate: (path: string, type?: "layout" | "page") => void calls.push({ path, type }) };
  const call = (ctx: typeof a.owner, name: string, args: unknown) => callTool(ctx, name, args, opts) as Promise<Record<string, unknown>>;
  const auditOk = async (name: string, entityId: string, entityType: string) => {
    const row = await prisma.auditLog.findFirst({ where: { organizationId: a.org.id, action: `mcp.tool.${name}`, entityId } });
    return !!row && row.entityType === entityType && meta(row.metadata).via === "claude";
  };
  const procs = () => prisma.creditProcessor.count({ where: { organizationId: a.org.id } });
  const accts = () => prisma.clientProcessorAccount.count({ where: { organizationId: a.org.id } });

  try {
    console.log("metadatos");
    check("4 herramientas con permiso processors.manage", processorsTools.length === 4 && processorsTools.every((t) => t.permission === "processors.manage"));
    check("ninguna abre mundo ni es destructive (nada se borra)", processorsTools.every((t) => !t.openWorld && t.kind === "write"));
    check("ninguna promete borrar", !processorsTools.some((t) => /borrar|eliminar/.test(t.name)));

    console.log("crear_procesador");
    const n0 = await procs();
    check("STAFF -> Sin permiso y no escribe", (await errorText(() => call(a.staff, "crear_procesador", { name: `P ${MARK}` }))).includes("Sin permiso") && (await procs()) === n0);
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "crear_procesador", { name: `P ${MARK}` }))).includes("Sin permiso"));
    calls.length = 0;
    const proc = await call(specialist, "crear_procesador", { name: `  Monitor ${MARK} `, websiteUrl: "https://monitor.example.test", affiliateUrl: "https://aff.example.test/?id=SECRETO", monthlyPrice: 29.99, commission: 5, instructions: "pasos" });
    const pRow = await prisma.creditProcessor.findUnique({ where: { id: String(proc.id) } });
    check("SPECIALIST crea el procesador (nombre recortado, tipo por defecto, activo)", pRow?.name === `Monitor ${MARK}` && pRow.type === "CREDIT_MONITOR" && pRow.active && pRow.monthlyPrice?.toString() === "29.99" && pRow.affiliateUrl === "https://aff.example.test/?id=SECRETO", pRow);
    check("el resultado no devuelve el enlace de afiliado", !JSON.stringify(proc).includes("SECRETO") && String(proc.href).endsWith("/crm/procesadores"), proc);
    check("auditoría via claude y entidad CreditProcessor", await auditOk("crear_procesador", String(proc.id), "CreditProcessor"));
    check("refresca la página de procesadores", calls.some((c) => c.path === "/crm/procesadores"), calls);
    check("URL sin http -> ZodError", (await errorName(() => call(a.owner, "crear_procesador", { name: `Z ${MARK}`, websiteUrl: "ftp://x" }))) === "ZodError");
    check("nombre vacío -> ZodError", (await errorName(() => call(a.owner, "crear_procesador", { name: "" }))) === "ZodError");

    console.log("editar_procesador");
    check("STAFF -> Sin permiso", (await errorText(() => call(a.staff, "editar_procesador", { procesadorId: String(proc.id), active: false }))).includes("Sin permiso"));
    const keep = await call(a.owner, "editar_procesador", { procesadorId: String(proc.id), commission: 6 });
    check("editar_procesador sin tocar el enlace no lo devuelve aunque exista", (await prisma.creditProcessor.findUnique({ where: { id: String(proc.id) } }))?.affiliateUrl === "https://aff.example.test/?id=SECRETO" && !JSON.stringify(keep).includes("SECRETO") && !JSON.stringify(keep).includes("aff.example"), keep);
    calls.length = 0;
    const edited = await call(a.owner, "editar_procesador", { procesadorId: String(proc.id), affiliateUrl: "", active: false, commission: 7 });
    check("editar_procesador refresca la página de procesadores y no devuelve el enlace de afiliado", calls.some((c) => c.path === "/crm/procesadores") && !JSON.stringify(edited).includes("SECRETO"), { calls, edited });
    const eRow = await prisma.creditProcessor.findUnique({ where: { id: String(proc.id) } });
    check("OWNER desactiva, borra el enlace de afiliado y cambia la comisión; el nombre queda", eRow?.active === false && eRow.affiliateUrl === null && eRow.commission?.toString() === "7" && eRow.name === `Monitor ${MARK}`, eRow);
    check("el procesador desactivado sigue existiendo", (await procs()) === n0 + 1);
    check("auditoría", await auditOk("editar_procesador", String(proc.id), "CreditProcessor"));
    const bProc = await prisma.creditProcessor.create({ data: { organizationId: b.org.id, name: `Ajeno ${MARK}` } });
    check("procesador ajeno -> No encontrado y sin cambios",
      (await errorText(() => call(a.owner, "editar_procesador", { procesadorId: bProc.id, active: false }))) === "NotFoundError: No encontrado." && (await prisma.creditProcessor.findUnique({ where: { id: bProc.id } }))?.active === true);

    console.log("vincular_cuenta_procesador");
    const m0 = await accts();
    const link = { processorId: String(proc.id), clientId: a.client.id, externalMemberId: "MIEMBRO-123", externalUrl: "https://monitor.example.test/cuenta/777", status: "ACTIVE", startedAt: "2026-11-01T12:00:00Z", notes: " nota " };
    check("STAFF -> Sin permiso y no escribe", (await errorText(() => call(a.staff, "vincular_cuenta_procesador", link))).includes("Sin permiso") && (await accts()) === m0);
    calls.length = 0;
    const acc = await call(specialist, "vincular_cuenta_procesador", link);
    const aRow = await prisma.clientProcessorAccount.findUnique({ where: { id: String(acc.id) } });
    check("SPECIALIST vincula al cliente con estado, fecha y notas", aRow?.status === "ACTIVE" && aRow.clientId === a.client.id && aRow.externalMemberId === "MIEMBRO-123" && aRow.notes === "nota" && aRow.startedAt?.toISOString() === "2026-11-01T12:00:00.000Z", aRow);
    check("el resultado no devuelve el identificador ni la dirección de la cuenta", !JSON.stringify(acc).includes("MIEMBRO-123") && !JSON.stringify(acc).includes("cuenta/777"), acc);
    check("auditoría via claude y entidad ClientProcessorAccount", await auditOk("vincular_cuenta_procesador", String(acc.id), "ClientProcessorAccount"));
    check("refresca procesadores, ficha y expediente del cliente",
      ["/crm/procesadores", `/crm/clientes/${a.client.id}`, `/crm/clientes/${a.client.id}/expediente`].every((p) => calls.some((c) => c.path === p)), calls);
    check("estado inválido -> ZodError", (await errorName(() => call(a.owner, "vincular_cuenta_procesador", { ...link, status: "VIVA" }))) === "ZodError");
    const m1 = await accts();
    check("cliente de otra organización -> No encontrado y no escribe", (await errorText(() => call(a.owner, "vincular_cuenta_procesador", { ...link, clientId: b.client.id }))) === "NotFoundError: No encontrado." && (await accts()) === m1);
    check("procesador de otra organización -> No encontrado y no escribe", (await errorText(() => call(a.owner, "vincular_cuenta_procesador", { ...link, processorId: bProc.id }))) === "NotFoundError: No encontrado." && (await accts()) === m1);

    console.log("editar_cuenta_procesador");
    check("STAFF -> Sin permiso", (await errorText(() => call(a.staff, "editar_cuenta_procesador", { cuentaId: String(acc.id), status: "CANCELLED" }))).includes("Sin permiso"));
    calls.length = 0;
    const editedAcc = await call(a.owner, "editar_cuenta_procesador", { cuentaId: String(acc.id), status: "CANCELLED", externalUrl: "", expiresAt: "2026-12-31T12:00:00Z" });
    check("editar_cuenta_procesador no devuelve el identificador ni la dirección de la cuenta", !JSON.stringify(editedAcc).includes("MIEMBRO-123") && !JSON.stringify(editedAcc).includes("cuenta/777"), editedAcc);
    const uRow = await prisma.clientProcessorAccount.findUnique({ where: { id: String(acc.id) } });
    check("OWNER cancela, borra la dirección y fija vencimiento; el identificador queda", uRow?.status === "CANCELLED" && uRow.externalUrl === null && uRow.externalMemberId === "MIEMBRO-123" && uRow.expiresAt?.toISOString() === "2026-12-31T12:00:00.000Z", uRow);
    check("la cuenta cancelada sigue existiendo", (await accts()) === m1 + 0 && !!uRow);
    check("auditoría y refresco", (await auditOk("editar_cuenta_procesador", String(acc.id), "ClientProcessorAccount")) && calls.some((c) => c.path === `/crm/clientes/${a.client.id}`), calls);
    const bAcc = await prisma.clientProcessorAccount.create({ data: { organizationId: b.org.id, processorId: bProc.id, clientId: b.client.id } });
    check("cuenta ajena -> No encontrado y sin cambios", (await errorText(() => call(a.owner, "editar_cuenta_procesador", { cuentaId: bAcc.id, status: "CANCELLED" }))) === "NotFoundError: No encontrado." && (await prisma.clientProcessorAccount.findUnique({ where: { id: bAcc.id } }))?.status === "PLANNED");
  } finally {
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
  if (failed) {
    console.error(`\n${failed} comprobaciones fallaron`);
    process.exit(1);
  }
  console.log("\nmcp-write-processors: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
