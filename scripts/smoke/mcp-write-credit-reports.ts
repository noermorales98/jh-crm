/**
 * Herramientas de escritura de reportes y partidas de crédito del conector MCP contra una
 * base real y desechable.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-credit-reports.ts
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
const MARK = `mcpcr${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

type Seed = Awaited<ReturnType<typeof seedMcpOrg>>;

async function seedCase(s: Seed, suffix: string) {
  const serviceCase = await prisma.serviceCase.create({
    data: { organizationId: s.org.id, clientId: s.client.id, serviceId: s.service.id, caseNumber: `SC-${suffix}-${MARK}`.slice(0, 30), stageId: s.stage.id } as never,
  });
  return prisma.creditCase.create({
    data: { organizationId: s.org.id, clientId: s.client.id, serviceCaseId: serviceCase.id, caseCode: `CC-${suffix}-${MARK}`.slice(0, 30), stageId: s.stage.id },
  });
}

async function main() {
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const { creditReportsTools } = await import("../../src/server/mcp/tools/credit-reports");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  const calls: Array<{ path: string; type?: string }> = [];
  const opts = { tools: creditReportsTools, revalidate: (path: string, type?: "layout" | "page") => void calls.push({ path, type }) };
  const call = (ctx: typeof a.staff, name: string, args: unknown) => callTool(ctx, name, args, opts) as Promise<Record<string, unknown>>;

  try {
    const caseA = await seedCase(a, "a");
    const caseB = await seedCase(b, "b");
    const reportB = await prisma.creditReport.create({
      data: { organizationId: b.org.id, clientId: b.client.id, caseId: caseB.id, reportDate: new Date("2026-01-01"), type: "MANUAL" },
    });
    const itemB = await prisma.creditItem.create({
      data: { organizationId: b.org.id, clientId: b.client.id, caseId: caseB.id, reportId: reportB.id, creditorName: "Ajeno", bureau: "EXPERIAN" },
    });
    const auditOf = (name: string, entityId: string) =>
      prisma.auditLog.findFirst({ where: { organizationId: a.org.id, action: `mcp.tool.${name}`, entityId } });
    const refreshed = (c: typeof calls) =>
      c.some((x) => x.path === "/crm/clientes/[clientId]" && x.type === "layout") &&
      c.some((x) => x.path === `/crm/clientes/${a.client.id}`) &&
      c.some((x) => x.path === `/crm/clientes/${a.client.id}/reportes`) &&
      c.some((x) => x.path === "/crm/dashboard");
    const isNotFound = (t: string) => /no encontrad/i.test(t);

    console.log("registro");
    const names = creditReportsTools.map((t) => t.name).sort();
    check("exactamente las 4 herramientas", names.join(",") === "agregar_partida_credito,crear_reporte_credito,editar_partida_credito,editar_reporte_credito", names);
    check("ninguna borra ni elimina", !names.some((n) => /borrar|eliminar/.test(n)), names);
    check("permisos correctos", creditReportsTools.every((t) => t.kind === "write" && (t.name.includes("reporte") ? t.permission === "creditReports.manage" : t.permission === "creditItems.manage")));

    console.log("crear_reporte_credito");
    const nReports = () => prisma.creditReport.count({ where: { organizationId: a.org.id } });
    const n0 = await nReports();
    check("VIEWER -> ForbiddenError", (await errorName(() => call(a.viewer, "crear_reporte_credito", { caseId: caseA.id, reportDate: "2026-02-01" }))) === "ForbiddenError");
    check("VIEWER no escribe", (await nReports()) === n0);
    calls.length = 0;
    const created = await call(a.staff, "crear_reporte_credito", { caseId: caseA.id, reportDate: "2026-02-01", provider: "Proveedor sintético", notes: "nota" });
    const rep = await prisma.creditReport.findUnique({ where: { id: String(created.id) } });
    check("STAFF crea el reporte (tipo MANUAL por defecto)", !!rep && rep.caseId === caseA.id && rep.clientId === a.client.id && rep.type === "MANUAL" && rep.provider === "Proveedor sintético", rep);
    const au = await auditOf("crear_reporte_credito", String(created.id));
    check("auditoría con via claude", !!au && au.entityType === "CreditReport" && meta(au.metadata).via === "claude", au);
    check("refresca layout, cliente, reportes y dashboard", refreshed(calls), calls);
    check("devuelve id y href /crm/", typeof created.href === "string" && String(created.href).includes("/crm/"), created);
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "crear_reporte_credito", { caseId: caseA.id }))) === "ZodError");
    const n1 = await nReports();
    check("caso de otra organización -> no encontrado y sin crear", isNotFound(await errorText(() => call(a.staff, "crear_reporte_credito", { caseId: caseB.id, reportDate: "2026-02-01" }))) && (await nReports()) === n1);

    console.log("editar_reporte_credito");
    const reportId = String(created.id);
    check("VIEWER -> ForbiddenError", (await errorName(() => call(a.viewer, "editar_reporte_credito", { reportId, notes: "x" }))) === "ForbiddenError");
    calls.length = 0;
    await call(a.staff, "editar_reporte_credito", { reportId, notes: "Notas nuevas", type: "UPDATE", provider: "Otro" });
    const rep2 = await prisma.creditReport.findUnique({ where: { id: reportId } });
    check("STAFF edita", rep2?.notes === "Notas nuevas" && rep2.type === "UPDATE" && rep2.provider === "Otro", rep2);
    const au2 = await auditOf("editar_reporte_credito", reportId);
    check("auditoría con via claude", !!au2 && au2.entityType === "CreditReport" && meta(au2.metadata).via === "claude", au2);
    check("refresca", refreshed(calls), calls);
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "editar_reporte_credito", { reportId, type: "NOPE" }))) === "ZodError");
    check("reporte ajeno -> no encontrado y sin cambios", isNotFound(await errorText(() => call(a.staff, "editar_reporte_credito", { reportId: reportB.id, notes: "hack" }))) && (await prisma.creditReport.findUnique({ where: { id: reportB.id } }))!.notes === null);
    const editTool = creditReportsTools.find((t) => t.name === "editar_reporte_credito")!;
    check("editar_reporte_credito no acepta `snapshots` (reemplazarlos borraría los anteriores)", !("snapshots" in (editTool.inputSchema as unknown as { shape: Record<string, unknown> }).shape));
    const withSnap = await call(a.staff, "crear_reporte_credito", { caseId: caseA.id, reportDate: "2026-02-02", snapshots: [{ bureau: "EXPERIAN", score: 600 }] });
    const snapId = String(withSnap.id);
    await call(a.staff, "editar_reporte_credito", { reportId: snapId, notes: "con resumen", snapshots: [{ bureau: "EQUIFAX", score: 750 }] });
    const snaps = await prisma.creditBureauSnapshot.findMany({ where: { reportId: snapId } });
    check("editar con `snapshots` no borra ni reemplaza los resúmenes existentes", snaps.length === 1 && snaps[0].bureau === "EXPERIAN" && snaps[0].score === 600, snaps);
    check("editar sigue cambiando el resto de campos", (await prisma.creditReport.findUnique({ where: { id: snapId } }))?.notes === "con resumen");

    console.log("agregar_partida_credito");
    const nItems = () => prisma.creditItem.count({ where: { organizationId: a.org.id } });
    const i0 = await nItems();
    check("VIEWER -> ForbiddenError", (await errorName(() => call(a.viewer, "agregar_partida_credito", { reportId, creditorName: "X", bureau: "EXPERIAN" }))) === "ForbiddenError");
    check("VIEWER no escribe", (await nItems()) === i0);
    calls.length = 0;
    const LONG = "4111111111111111";
    const added = await call(a.staff, "agregar_partida_credito", { reportId, creditorName: "Banco Sintético", bureau: "EQUIFAX", accountNumberMasked: LONG, balance: "123.45", negativeType: "COLLECTION", isNegative: true });
    const item = await prisma.creditItem.findUnique({ where: { id: String(added.id) } });
    check("STAFF agrega la partida", !!item && item.reportId === reportId && item.caseId === caseA.id && item.creditorName === "Banco Sintético" && item.bureau === "EQUIFAX", item);
    check("el resultado no trae el número de cuenta", !JSON.stringify(added).includes(LONG) && !JSON.stringify(added).includes("4111"), added);
    check("el resultado no trae la clave accountNumberMasked", !("accountNumberMasked" in added), Object.keys(added));
    const SHORT = "1234567890";
    const addedShort = await call(a.staff, "agregar_partida_credito", { reportId, creditorName: "Banco Corto", bureau: "EXPERIAN", accountNumberMasked: SHORT });
    check("una cuenta de 10 dígitos tampoco aparece en el resultado ni como clave", !JSON.stringify(addedShort).includes(SHORT) && !JSON.stringify(addedShort).includes("7890") && !("accountNumberMasked" in addedShort), addedShort);
    check("el resultado trae acreedor y href /crm/", added.creditorName === "Banco Sintético" && String(added.href).includes("/crm/"), added);
    const au3 = await auditOf("agregar_partida_credito", String(added.id));
    check("auditoría con via claude", !!au3 && au3.entityType === "CreditItem" && meta(au3.metadata).via === "claude", au3);
    check("refresca", refreshed(calls), calls);
    check("entrada inválida -> ZodError (cuenta con letras)", (await errorName(() => call(a.staff, "agregar_partida_credito", { reportId, creditorName: "X", bureau: "EXPERIAN", accountNumberMasked: "abc" }))) === "ZodError");
    const i1 = await nItems();
    check("reporte ajeno -> no encontrado y sin crear", isNotFound(await errorText(() => call(a.staff, "agregar_partida_credito", { reportId: reportB.id, creditorName: "X", bureau: "EXPERIAN" }))) && (await nItems()) === i1);

    console.log("editar_partida_credito");
    const itemId = String(added.id);
    check("VIEWER -> ForbiddenError", (await errorName(() => call(a.viewer, "editar_partida_credito", { itemId, creditorName: "Z" }))) === "ForbiddenError");
    calls.length = 0;
    const edited = await call(a.staff, "editar_partida_credito", { itemId, creditorName: "Banco Nuevo", lifecycleStatus: "SELECTED", accountNumberMasked: LONG });
    const item2 = await prisma.creditItem.findUnique({ where: { id: itemId } });
    check("STAFF edita", item2?.creditorName === "Banco Nuevo" && item2.lifecycleStatus === "SELECTED", item2);
    check("el resultado no trae el número de cuenta", !JSON.stringify(edited).includes("4111") && !("accountNumberMasked" in edited), edited);
    const au4 = await auditOf("editar_partida_credito", itemId);
    check("auditoría con via claude", !!au4 && au4.entityType === "CreditItem" && meta(au4.metadata).via === "claude", au4);
    check("refresca", refreshed(calls), calls);
    check("href con /crm/", String(edited.href).includes("/crm/"), edited);
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "editar_partida_credito", { itemId, lifecycleStatus: "NOPE" }))) === "ZodError");
    check("partida ajena -> no encontrada y sin cambios", isNotFound(await errorText(() => call(a.staff, "editar_partida_credito", { itemId: itemB.id, creditorName: "hack" }))) && (await prisma.creditItem.findUnique({ where: { id: itemB.id } }))!.creditorName === "Ajeno");
  } finally {
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
  if (failed) {
    console.error(`\n${failed} comprobaciones fallaron`);
    process.exit(1);
  }
  console.log("\nmcp-write-credit-reports: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
