/**
 * Herramientas de escritura de disputas del conector MCP contra una base real y desechable.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-disputes.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, errorName, meta, seedMcpOrg } from "./_lib/mcp-seed";

assertDisposableDb();
process.env.FEATURE_MCP_CONNECTOR = "true";

const prisma = new PrismaClient();
const MARK = `mcpdisp${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function errorText(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`;
  }
}

type Seed = Awaited<ReturnType<typeof seedMcpOrg>>;

/** Caso de crédito, reporte, cuentas, una consulta y una ronda abierta (datos sintéticos). */
async function seedCredit(s: Seed, tag: string, accounts: number) {
  const serviceCase = await prisma.serviceCase.create({
    data: { organizationId: s.org.id, clientId: s.client.id, serviceId: s.service.id, caseNumber: `SC-${tag}`.slice(0, 30), stageId: s.stage.id },
  });
  const creditCase = await prisma.creditCase.create({
    data: { organizationId: s.org.id, clientId: s.client.id, serviceCaseId: serviceCase.id, caseCode: `CC-${tag}`.slice(0, 30), stageId: s.stage.id },
  });
  const report = await prisma.creditReport.create({
    data: { organizationId: s.org.id, clientId: s.client.id, caseId: creditCase.id, reportDate: new Date("2026-10-01"), type: "MANUAL" },
  });
  const items = [];
  for (let i = 0; i < accounts; i++) {
    items.push(
      await prisma.creditItem.create({
        data: {
          organizationId: s.org.id,
          clientId: s.client.id,
          caseId: creditCase.id,
          reportId: report.id,
          creditorName: `Acreedor ${tag} ${i}`,
          bureau: "EXPERIAN",
          isNegative: true,
        },
      }),
    );
  }
  const inquiry = await prisma.creditInquiry.create({
    data: {
      organizationId: s.org.id,
      clientId: s.client.id,
      reportId: report.id,
      bureau: "EQUIFAX",
      creditorName: `Consulta ${tag}`,
      inquiryType: "HARD",
    },
  });
  const round = await prisma.creditRound.create({
    data: { organizationId: s.org.id, caseId: creditCase.id, roundNumber: 1 },
  });
  return { creditCase, report, items, inquiry, round };
}

async function main() {
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const { disputesTools } = await import("../../src/server/mcp/tools/disputes");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  const calls: Array<{ path: string; type?: string }> = [];
  const opts = { tools: disputesTools, revalidate: (path: string, type?: "layout" | "page") => void calls.push({ path, type }) };
  const call = (ctx: typeof a.staff, name: string, args: unknown) => callTool(ctx, name, args, opts) as Promise<Record<string, unknown>>;

  try {
    const ca = await seedCredit(a, `${MARK}a`, 6);
    const cb = await seedCredit(b, `${MARK}b`, 1);
    const auditOf = (name: string, entityId: string) =>
      prisma.auditLog.findFirst({ where: { organizationId: a.org.id, action: `mcp.tool.${name}`, entityId } });
    const disputeCount = () => prisma.disputeItem.count({ where: { organizationId: a.org.id } });
    const refreshed = (extra = true) =>
      calls.some((x) => x.path === "/crm/clientes/[clientId]" && x.type === "layout") &&
      (!extra || calls.some((x) => x.path === "/crm/rondas"));
    const hrefOk = (r: Record<string, unknown>) =>
      typeof r.href === "string" && (r.href as string).includes("/crm/clientes/") && (r.href as string).includes(ca.round.id);

    check("las 5 herramientas están registradas", disputesTools.map((t) => t.name).join() === ["agregar_disputa", "agregar_disputas_lote", "agregar_disputa_consulta_o_personal", "editar_disputa", "cancelar_disputa"].join(), disputesTools.map((t) => t.name));
    check("permiso y tipo", disputesTools.every((t) => t.permission === "disputes.manage") && disputesTools.find((t) => t.name === "cancelar_disputa")?.kind === "destructive" && disputesTools.filter((t) => t.kind === "write").length === 4);
    check("la cancelación no promete deshacer", !/deshac|revert|reabr|recuper|restaur/i.test(disputesTools.find((t) => t.name === "cancelar_disputa")!.description));

    console.log("agregar_disputa");
    const n0 = await disputeCount();
    const args1 = { roundId: ca.round.id, creditItemId: ca.items[0].id, disputeReason: "No reconozco esta cuenta", action: "Eliminar" };
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "agregar_disputa", args1))).includes("Sin permiso") && (await disputeCount()) === n0);
    calls.length = 0;
    const d1 = await call(a.staff, "agregar_disputa", { ...args1, scope: "IN_SCOPE", method: "ONLINE" });
    const row1 = await prisma.disputeItem.findUnique({ where: { id: String(d1.id) } });
    check("STAFF agrega la disputa", !!row1 && row1.roundId === ca.round.id && row1.creditItemId === ca.items[0].id && row1.scope === "IN_SCOPE" && row1.method === "ONLINE" && row1.status === "SELECTED", row1);
    check("resultado con id, estado y href", d1.status === "SELECTED" && d1.roundId === ca.round.id && hrefOk(d1), d1);
    const au1 = await auditOf("agregar_disputa", String(d1.id));
    check("auditoría via claude", !!au1 && au1.entityType === "DisputeItem" && meta(au1.metadata).via === "claude", au1);
    check("refresca ficha y rondas", refreshed(), calls);
    check("ZodError con motivo vacío", (await errorName(() => call(a.staff, "agregar_disputa", { ...args1, creditItemId: ca.items[1].id, disputeReason: "" }))) === "ZodError");
    const n1 = await disputeCount();
    check("ronda de otra organización -> No encontrado", (await errorText(() => call(a.staff, "agregar_disputa", { ...args1, roundId: cb.round.id }))).endsWith("No encontrado.") && (await disputeCount()) === n1);
    check("cuenta de otra organización -> No encontrado", (await errorText(() => call(a.staff, "agregar_disputa", { ...args1, creditItemId: cb.items[0].id }))).endsWith("No encontrado.") && (await disputeCount()) === n1);

    console.log("agregar_disputas_lote");
    const bulkArgs = { roundId: ca.round.id, creditItemIds: [ca.items[1].id, ca.items[2].id], disputeReason: "Datos inexactos", action: "Verificar", strategy: "ACCURACY_R1" };
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "agregar_disputas_lote", bulkArgs))).includes("Sin permiso"));
    calls.length = 0;
    const bulk = await call(a.staff, "agregar_disputas_lote", bulkArgs);
    const bulkRows = await prisma.disputeItem.findMany({ where: { roundId: ca.round.id, creditItemId: { in: [ca.items[1].id, ca.items[2].id] } } });
    check("STAFF agrega 2 disputas con método", bulkRows.length === 2 && bulkRows.every((r) => r.strategy === "ACCURACY_R1"), bulkRows);
    check("resultado con conteo y href", bulk.count === 2 && bulk.roundId === ca.round.id && hrefOk(bulk), bulk);
    const au2 = await auditOf("agregar_disputas_lote", ca.round.id);
    check("auditoría de la ronda via claude", !!au2 && au2.entityType === "CreditRound" && meta(au2.metadata).via === "claude", au2);
    check("refresca ficha y rondas", refreshed(), calls);
    check("lista vacía -> ZodError", (await errorName(() => call(a.staff, "agregar_disputas_lote", { ...bulkArgs, creditItemIds: [] }))) === "ZodError");
    const n2 = await disputeCount();
    check("ronda ajena -> No encontrado y sin cambios", (await errorText(() => call(a.staff, "agregar_disputas_lote", { ...bulkArgs, roundId: cb.round.id, creditItemIds: [cb.items[0].id] }))).endsWith("No encontrado.") && (await disputeCount()) === n2);

    console.log("agregar_disputa_consulta_o_personal");
    const npArgs = {
      roundId: ca.round.id,
      inquiries: [{ inquiryId: ca.inquiry.id, bureau: "EQUIFAX", label: `Consulta ${MARK}` }],
      personal: [{ bureau: "EXPERIAN", kind: "ADDRESS", value: "123 Calle Ficticia" }],
    };
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "agregar_disputa_consulta_o_personal", npArgs))).includes("Sin permiso"));
    calls.length = 0;
    const np = await call(a.staff, "agregar_disputa_consulta_o_personal", npArgs);
    const npRows = await prisma.disputeItem.findMany({ where: { roundId: ca.round.id, targetKind: { in: ["INQUIRY", "PERSONAL_INFO"] } } });
    check("STAFF agrega consulta y dato personal", np.added === 2 && npRows.length === 2 && npRows.some((r) => r.targetKind === "INQUIRY" && r.inquiryId === ca.inquiry.id) && npRows.some((r) => r.targetKind === "PERSONAL_INFO" && r.strategy === "PERSONAL_INFO"), { np, npRows });
    check("resultado con href", hrefOk(np), np);
    const au3 = await auditOf("agregar_disputa_consulta_o_personal", ca.round.id);
    check("auditoría de la ronda via claude", !!au3 && au3.entityType === "CreditRound" && meta(au3.metadata).via === "claude", au3);
    check("refresca la ficha del cliente", refreshed(false), calls);
    check("tipo de dato inválido -> ZodError", (await errorName(() => call(a.staff, "agregar_disputa_consulta_o_personal", { roundId: ca.round.id, personal: [{ bureau: "EXPERIAN", kind: "NOPE", value: "xx" }] }))) === "ZodError");
    const n3 = await disputeCount();
    check("consulta de otra organización -> falla sin cambios", (await errorText(() => call(a.staff, "agregar_disputa_consulta_o_personal", { roundId: ca.round.id, inquiries: [{ inquiryId: cb.inquiry.id, bureau: "EQUIFAX", label: "x" }] }))) !== "ok" && (await disputeCount()) === n3);
    check("ronda ajena -> No encontrado", (await errorText(() => call(a.staff, "agregar_disputa_consulta_o_personal", { ...npArgs, roundId: cb.round.id }))).endsWith("No encontrado."));

    console.log("editar_disputa");
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "editar_disputa", { disputeItemId: String(d1.id), notes: "x" }))).includes("Sin permiso"));
    calls.length = 0;
    const ed = await call(a.staff, "editar_disputa", { disputeItemId: String(d1.id), disputeReason: "Motivo nuevo", strategy: "METHOD_R2", notes: "Nota" });
    const edRow = await prisma.disputeItem.findUnique({ where: { id: String(d1.id) } });
    check("STAFF edita motivo, método y nota", edRow?.disputeReason === "Motivo nuevo" && edRow.strategy === "METHOD_R2" && edRow.notes === "Nota", edRow);
    check("resultado con id, estado y href", ed.id === d1.id && ed.status === "SELECTED" && hrefOk(ed), ed);
    const au4 = await auditOf("editar_disputa", String(d1.id));
    check("auditoría via claude", !!au4 && au4.entityType === "DisputeItem" && meta(au4.metadata).via === "claude", au4);
    check("refresca ficha y rondas", refreshed(), calls);
    check("método inválido -> ZodError", (await errorName(() => call(a.staff, "editar_disputa", { disputeItemId: String(d1.id), strategy: "NOPE" }))) === "ZodError");
    const foreignItem = await prisma.disputeItem.create({
      data: { organizationId: b.org.id, roundId: cb.round.id, creditItemId: cb.items[0].id, bureau: "EXPERIAN", disputeReason: "Ajena" },
    });
    check("disputa ajena -> No encontrado y sin cambios", (await errorText(() => call(a.staff, "editar_disputa", { disputeItemId: foreignItem.id, notes: "hack" }))).endsWith("No encontrado.") && (await prisma.disputeItem.findUnique({ where: { id: foreignItem.id } }))!.notes === null);

    console.log("cancelar_disputa");
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "cancelar_disputa", { disputeItemId: String(d1.id) }))).includes("Sin permiso"));
    calls.length = 0;
    const cancelled = await call(a.staff, "cancelar_disputa", { disputeItemId: String(d1.id) });
    const cRow = await prisma.disputeItem.findUnique({ where: { id: String(d1.id) } });
    check("cancelación suave: la fila sigue y queda CANCELLED", cRow?.status === "CANCELLED", cRow);
    check("resultado con estado y href", cancelled.status === "CANCELLED" && hrefOk(cancelled), cancelled);
    const au5 = await auditOf("cancelar_disputa", String(d1.id));
    check("auditoría via claude", !!au5 && au5.entityType === "DisputeItem" && meta(au5.metadata).via === "claude", au5);
    check("refresca ficha y rondas", refreshed(), calls);
    check("id inválido -> ZodError", (await errorName(() => call(a.staff, "cancelar_disputa", { disputeItemId: "" }))) === "ZodError");
    check("disputa ajena -> No encontrado y sin cambios", (await errorText(() => call(a.staff, "cancelar_disputa", { disputeItemId: foreignItem.id }))).endsWith("No encontrado.") && (await prisma.disputeItem.findUnique({ where: { id: foreignItem.id } }))!.status === "SELECTED");
  } finally {
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
  if (failed) {
    console.error(`\n${failed} comprobaciones fallaron`);
    process.exit(1);
  }
  console.log("\nmcp-write-disputes: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
