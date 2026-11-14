/**
 * Herramientas de escritura de contratos del conector MCP contra una base real y desechable.
 * Cancelar nunca borra (AC-7); Claude no firma ni edita plantillas.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-contracts.ts
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
const MARK = `mcpcon${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

const TEMPLATE_HTML = ["parties", "services", "fees", "cancellation", "acknowledgement"]
  .map((section) => `<section data-jh-section="${section}"><p>Texto ${section}</p></section>`)
  .join("");

async function main() {
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const { contractsTools } = await import("../../src/server/mcp/tools/contracts");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  const calls: Array<{ path: string; type?: string }> = [];
  const opts = { tools: contractsTools, revalidate: (path: string, type?: "layout" | "page") => void calls.push({ path, type }) };
  const call = (ctx: typeof a.staff, name: string, args: unknown) => callTool(ctx, name, args, opts) as Promise<Record<string, unknown>>;
  const auditOf = (name: string, entityId: string) =>
    prisma.auditLog.findFirst({ where: { organizationId: a.org.id, action: `mcp.tool.${name}`, entityId } });
  const contracts = () => prisma.clientContract.count({ where: { organizationId: a.org.id } });

  try {
    const template = await prisma.contractTemplate.create({ data: { organizationId: a.org.id, name: `Plantilla ${MARK}`, version: "1.0", contentHtml: TEMPLATE_HTML } });
    const inactive = await prisma.contractTemplate.create({ data: { organizationId: a.org.id, name: `Vieja ${MARK}`, version: "1.0", contentHtml: TEMPLATE_HTML, active: false } });
    const bTemplate = await prisma.contractTemplate.create({ data: { organizationId: b.org.id, name: `Ajena ${MARK}`, version: "1.0", contentHtml: TEMPLATE_HTML } });

    console.log("metadatos");
    check("3 herramientas con permiso contracts.manage", contractsTools.length === 3 && contractsTools.every((t) => t.permission === "contracts.manage"));
    const cancelar = contractsTools.find((t) => t.name === "cancelar_contrato")!;
    check("cancelar_contrato es destructive, pide confirmación y no promete deshacer",
      cancelar.kind === "destructive" && /confirm/i.test(cancelar.description) && !/deshac|revert|reabr|recuper|restaur/i.test(cancelar.description));
    check("ninguna herramienta abre mundo (no mandan correos ni mensajes)", contractsTools.every((t) => !t.openWorld));
    check("no hay herramienta para firmar ni para plantillas", !contractsTools.some((t) => /firm|plantilla/.test(t.name)));

    console.log("crear_contrato");
    const args = { clientId: a.client.id, templateId: template.id, cancellationDeadlineDays: 5 };
    const n0 = await contracts();
    check("VIEWER -> Sin permiso y no escribe", (await errorText(() => call(a.viewer, "crear_contrato", args))).includes("Sin permiso") && (await contracts()) === n0);
    calls.length = 0;
    const created = await call(a.staff, "crear_contrato", args);
    const row = await prisma.clientContract.findUnique({ where: { id: String(created.id) } });
    check("STAFF crea el contrato en borrador desde la plantilla", row?.status === "DRAFT" && row.templateId === template.id && row.clientId === a.client.id && !!row.cancellationDeadline, row && { status: row.status, templateId: row.templateId });
    check("resultado sin texto del contrato, con enlace al cliente",
      !("contentSnapshot" in created) && String(created.href).endsWith(`/crm/clientes/${a.client.id}`), created);
    const au = await auditOf("crear_contrato", String(created.id));
    check("auditoría via claude y entidad ClientContract", !!au && au.entityType === "ClientContract" && meta(au.metadata).via === "claude", au);
    check("refresca contratos y el cliente", calls.some((c) => c.path === "/crm/contratos") && calls.some((c) => c.path === `/crm/clientes/${a.client.id}`), calls);
    check("plazo de 2 días -> ZodError", (await errorName(() => call(a.staff, "crear_contrato", { ...args, cancellationDeadlineDays: 2 }))) === "ZodError");
    const n1 = await contracts();
    check("plantilla inactiva -> No encontrado y no escribe",
      (await errorText(() => call(a.staff, "crear_contrato", { ...args, templateId: inactive.id }))) === "NotFoundError: No encontrado." && (await contracts()) === n1);
    check("plantilla de otra organización -> No encontrado y no escribe",
      (await errorText(() => call(a.staff, "crear_contrato", { ...args, templateId: bTemplate.id }))) === "NotFoundError: No encontrado." && (await contracts()) === n1);
    check("cliente de otra organización -> No encontrado y no escribe",
      (await errorText(() => call(a.staff, "crear_contrato", { ...args, clientId: b.client.id }))) === "NotFoundError: No encontrado." && (await contracts()) === n1);

    console.log("marcar_contrato_enviado");
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "marcar_contrato_enviado", { contratoId: String(created.id) }))).includes("Sin permiso"));
    calls.length = 0;
    const sent = await call(a.staff, "marcar_contrato_enviado", { contratoId: String(created.id) });
    check("STAFF lo marca como enviado", sent.status === "SENT" && (await prisma.clientContract.findUnique({ where: { id: String(created.id) } }))?.status === "SENT", sent);
    check("auditoría", !!(await auditOf("marcar_contrato_enviado", String(created.id))));
    check("refresca contratos y el cliente", calls.some((c) => c.path === "/crm/contratos") && calls.some((c) => c.path === `/crm/clientes/${a.client.id}`), calls);
    check("enviar otra vez -> DomainError", (await errorText(() => call(a.staff, "marcar_contrato_enviado", { contratoId: String(created.id) }))).startsWith("DomainError"));
    const bContract = await prisma.clientContract.create({ data: { organizationId: b.org.id, clientId: b.client.id, title: "Ajeno", version: "1.0", contentSnapshot: TEMPLATE_HTML } });
    check("contrato ajeno -> No encontrado y sin cambios",
      (await errorText(() => call(a.staff, "marcar_contrato_enviado", { contratoId: bContract.id }))) === "NotFoundError: No encontrado." &&
        (await prisma.clientContract.findUnique({ where: { id: bContract.id } }))?.status === "DRAFT");

    console.log("cancelar_contrato (AC-7)");
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "cancelar_contrato", { contratoId: String(created.id) }))).includes("Sin permiso"));
    const n2 = await contracts();
    const cancelled = await call(a.staff, "cancelar_contrato", { contratoId: String(created.id) });
    check("STAFF cancela: CANCELLED", cancelled.status === "CANCELLED", cancelled);
    check("el contrato sigue existiendo (borrado lógico)", (await contracts()) === n2 && (await prisma.clientContract.findUnique({ where: { id: String(created.id) } }))?.status === "CANCELLED");
    check("auditoría", !!(await auditOf("cancelar_contrato", String(created.id))));
    check("cancelar otra vez -> DomainError", (await errorText(() => call(a.staff, "cancelar_contrato", { contratoId: String(created.id) }))).startsWith("DomainError"));
    const signed = await prisma.clientContract.create({ data: { organizationId: a.org.id, clientId: a.client.id, title: "Firmado", version: "1.0", contentSnapshot: TEMPLATE_HTML, status: "SIGNED", signedAt: new Date() } });
    check("contrato firmado no se cancela -> DomainError y sigue firmado",
      (await errorText(() => call(a.staff, "cancelar_contrato", { contratoId: signed.id }))).startsWith("DomainError") &&
        (await prisma.clientContract.findUnique({ where: { id: signed.id } }))?.status === "SIGNED");
    check("contrato ajeno -> No encontrado y sin cambios",
      (await errorText(() => call(a.staff, "cancelar_contrato", { contratoId: bContract.id }))) === "NotFoundError: No encontrado." &&
        (await prisma.clientContract.findUnique({ where: { id: bContract.id } }))?.status === "DRAFT");
  } finally {
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
  if (failed) {
    console.error(`\n${failed} comprobaciones fallaron`);
    process.exit(1);
  }
  console.log("\nmcp-write-contracts: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
