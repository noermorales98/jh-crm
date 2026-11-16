/**
 * Herramientas de escritura de comparaciones de reportes y de solicitudes de financiamiento
 * del conector MCP contra una base real y desechable.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-analysis.ts
 */
import { PrismaClient } from "@prisma/client";
import { CASE_ROUTE_PATTERN } from "../../src/lib/routes/case-routes";
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
const MARK = `mcpana${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

type Seed = Awaited<ReturnType<typeof seedMcpOrg>>;

async function seedCase(s: Seed, suffix: string, serviceId = s.service.id) {
  const serviceCase = await prisma.serviceCase.create({
    data: { organizationId: s.org.id, clientId: s.client.id, serviceId, caseNumber: `SC-${suffix}-${MARK}`.slice(0, 30), stageId: s.stage.id } as never,
  });
  const creditCase = await prisma.creditCase.create({
    data: { organizationId: s.org.id, clientId: s.client.id, serviceCaseId: serviceCase.id, caseCode: `CC-${suffix}-${MARK}`.slice(0, 30), stageId: s.stage.id },
  });
  return { serviceCase, creditCase };
}

async function seedReport(s: Seed, caseId: string, date: string, creditors: string[]) {
  const report = await prisma.creditReport.create({
    data: { organizationId: s.org.id, clientId: s.client.id, caseId, provider: "Proveedor sintético", reportDate: new Date(date) },
  });
  for (const creditorName of creditors) {
    await prisma.creditItem.create({
      data: { organizationId: s.org.id, clientId: s.client.id, caseId, reportId: report.id, creditorName, accountNumberMasked: "****1234", bureau: "EXPERIAN", isNegative: true },
    });
  }
  return report;
}

async function main() {
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const { comparisonsTools } = await import("../../src/server/mcp/tools/comparisons");
  const { fundingTools } = await import("../../src/server/mcp/tools/funding");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  const calls: Array<{ path: string; type?: string }> = [];
  const opts = { tools: [...comparisonsTools, ...fundingTools], revalidate: (path: string, type?: "layout" | "page") => void calls.push({ path, type }) };
  const call = (ctx: typeof a.staff, name: string, args: unknown) => callTool(ctx, name, args, opts) as Promise<Record<string, unknown>>;
  const auditOk = async (name: string, entityId: string, entityType: string) => {
    const row = await prisma.auditLog.findFirst({ where: { organizationId: a.org.id, action: `mcp.tool.${name}`, entityId } });
    return !!row && row.entityType === entityType && meta(row.metadata).via === "claude";
  };

  try {
    console.log("metadatos");
    check("comparaciones: 2 herramientas con comparisons.manage", comparisonsTools.length === 2 && comparisonsTools.every((t) => t.permission === "comparisons.manage" && t.kind === "write" && !t.openWorld));
    check("financiamiento: 2 herramientas con cases.manage", fundingTools.length === 2 && fundingTools.every((t) => t.permission === "cases.manage" && t.kind === "write" && !t.openWorld));
    check("financiamiento avisa de que no contacta al prestamista", fundingTools.every((t) => /no contacta/i.test(t.description)));

    console.log("crear_comparacion");
    const { creditCase } = await seedCase(a, "a");
    const base = await seedReport(a, creditCase.id, "2026-01-10", ["Banco Uno", "Banco Dos"]);
    const later = await seedReport(a, creditCase.id, "2026-03-10", ["Banco Uno", "Banco Tres"]);
    const cargs = { caseId: creditCase.id, baseReportId: base.id, compareReportId: later.id, notes: " primera " };
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "crear_comparacion", cargs))).includes("Sin permiso"));
    calls.length = 0;
    const cmp = await call(a.staff, "crear_comparacion", cargs);
    const cRow = await prisma.reportComparison.findUnique({ where: { id: String(cmp.id) }, include: { items: true } });
    check("STAFF compara: guarda las partidas con resultado automático", !!cRow && cRow.items.length >= 3 && cRow.notes === "primera" && cRow.items.every((i) => !!i.autoResult), cRow?.items.map((i) => `${i.creditorName}:${i.autoResult}`));
    check("enlace a la ficha del caso", String(cmp.href).includes("/crm/clientes/"), cmp);
    check("auditoría via claude y entidad ReportComparison", await auditOk("crear_comparacion", String(cmp.id), "ReportComparison"));
    check("refresca las páginas del caso (ruta dinámica, layout)", calls.some((c) => c.type === "layout" && c.path === CASE_ROUTE_PATTERN), calls);
    check("dos reportes iguales -> error y sin comparación nueva", (await errorText(() => call(a.staff, "crear_comparacion", { ...cargs, compareReportId: base.id }))).startsWith("DomainError"));
    const { creditCase: bCase } = await seedCase(b, "b");
    const bBase = await seedReport(b, bCase.id, "2026-01-10", ["Ajeno"]);
    const bLater = await seedReport(b, bCase.id, "2026-03-10", ["Ajeno"]);
    const cmps = () => prisma.reportComparison.count({ where: { organizationId: a.org.id } });
    const c0 = await cmps();
    check("caso de otra organización -> No encontrado y no escribe", (await errorText(() => call(a.staff, "crear_comparacion", { caseId: bCase.id, baseReportId: bBase.id, compareReportId: bLater.id }))) === "NotFoundError: No encontrado." && (await cmps()) === c0);
    check("reporte de otra organización -> error y no escribe", (await errorText(() => call(a.staff, "crear_comparacion", { ...cargs, compareReportId: bLater.id }))) !== "ok" && (await cmps()) === c0);

    console.log("ajustar_resultado_comparacion");
    const item = cRow!.items[0];
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "ajustar_resultado_comparacion", { itemId: item.id, manualResult: "VERIFIED" }))).includes("Sin permiso"));
    calls.length = 0;
    await call(a.staff, "ajustar_resultado_comparacion", { itemId: item.id, manualResult: "VERIFIED", notes: " revisado " });
    const iRow = await prisma.reportComparisonItem.findUnique({ where: { id: item.id } });
    check("STAFF corrige a mano: guarda manualResult y notas; el automático se conserva", iRow?.manualResult === "VERIFIED" && iRow.notes === "revisado" && iRow.autoResult === item.autoResult, iRow);
    check("auditoría y refresco", (await auditOk("ajustar_resultado_comparacion", item.id, "ReportComparisonItem")) && calls.some((c) => c.type === "layout" && c.path === CASE_ROUTE_PATTERN), calls);
    await call(a.staff, "ajustar_resultado_comparacion", { itemId: item.id, manualResult: null });
    const iRow2 = await prisma.reportComparisonItem.findUnique({ where: { id: item.id } });
    check("manualResult null quita la corrección y deja las notas (no se mandaron)", iRow2?.manualResult === null && iRow2.notes === "revisado", iRow2);
    check("resultado inválido -> ZodError", (await errorName(() => call(a.staff, "ajustar_resultado_comparacion", { itemId: item.id, manualResult: "MAGIA" }))) === "ZodError");
    const bCmp = await prisma.reportComparison.create({ data: { organizationId: b.org.id, caseId: bCase.id, baseReportId: bBase.id, compareReportId: bLater.id } });
    const bItem = await prisma.reportComparisonItem.create({ data: { comparisonId: bCmp.id, autoResult: "NEW", matchKey: "k", creditorName: "Ajeno", bureau: "EXPERIAN" } });
    check("partida ajena -> No encontrado y sin cambios", (await errorText(() => call(a.staff, "ajustar_resultado_comparacion", { itemId: bItem.id, manualResult: "DELETED" }))) === "NotFoundError: No encontrado." && (await prisma.reportComparisonItem.findUnique({ where: { id: bItem.id } }))?.manualResult === null);

    console.log("crear_solicitud_financiamiento");
    const bizService = await prisma.service.create({ data: { organizationId: a.org.id, code: "BUSINESS_CREDIT", name: `Negocios ${MARK}` } });
    const { serviceCase: fCase } = await seedCase(a, "f", bizService.id);
    await prisma.fundingCase.create({ data: { organizationId: a.org.id, serviceCaseId: fCase.id } });
    const apps = () => prisma.fundingApplication.count({ where: { organizationId: a.org.id } });
    const fargs = { expedienteId: fCase.id, lenderName: ` Banco ${MARK} `, requestedAmount: "25000.00", notes: " nota " };
    const f0 = await apps();
    check("VIEWER -> Sin permiso y no escribe", (await errorText(() => call(a.viewer, "crear_solicitud_financiamiento", fargs))).includes("Sin permiso") && (await apps()) === f0);
    calls.length = 0;
    const app = await call(a.staff, "crear_solicitud_financiamiento", fargs);
    const aRow = await prisma.fundingApplication.findUnique({ where: { id: String(app.id) } });
    check("STAFF la crea en DRAFT con monto exacto y campos recortados", aRow?.status === "DRAFT" && aRow.lenderName === `Banco ${MARK}` && aRow.requestedAmount?.toString() === "25000" && aRow.notes === "nota", aRow);
    check("auditoría via claude y entidad FundingApplication", await auditOk("crear_solicitud_financiamiento", String(app.id), "FundingApplication"));
    check("refresca expediente, actividad y servicios del cliente",
      [`/crm/expedientes/${fCase.id}`, `/crm/clientes/${a.client.id}/actividad`, `/crm/clientes/${a.client.id}/servicios`].every((p) => calls.some((c) => c.path === p)), calls);
    check("monto con 3 decimales -> ZodError", (await errorName(() => call(a.staff, "crear_solicitud_financiamiento", { ...fargs, requestedAmount: "1.234" }))) === "ZodError");
    check("decisión anterior al envío -> error y no escribe", (await errorText(() => call(a.staff, "crear_solicitud_financiamiento", { ...fargs, submittedAt: "2026-05-02T12:00:00Z", decisionAt: "2026-05-01T12:00:00Z" }))).startsWith("DomainError"));
    const f1 = await apps();
    const plainCase = (await seedCase(a, "x")).serviceCase;
    check("expediente que no es de financiamiento -> No encontrado y no escribe", (await errorText(() => call(a.staff, "crear_solicitud_financiamiento", { ...fargs, expedienteId: plainCase.id }))) === "NotFoundError: No encontrado." && (await apps()) === f1);
    const { serviceCase: bF } = await seedCase(b, "f", (await prisma.service.create({ data: { organizationId: b.org.id, code: "BUSINESS_CREDIT", name: `NegB ${MARK}` } })).id);
    await prisma.fundingCase.create({ data: { organizationId: b.org.id, serviceCaseId: bF.id } });
    check("expediente de otra organización -> No encontrado y no escribe", (await errorText(() => call(a.staff, "crear_solicitud_financiamiento", { ...fargs, expedienteId: bF.id }))) === "NotFoundError: No encontrado." && (await apps()) === f1);

    console.log("editar_solicitud_financiamiento");
    const token = aRow!.updatedAt.toISOString();
    const eargs = { expedienteId: fCase.id, solicitudId: String(app.id), actualizadoEn: token, status: "SUBMITTED", submittedAt: "2026-06-01T12:00:00Z" };
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "editar_solicitud_financiamiento", eargs))).includes("Sin permiso"));
    calls.length = 0;
    const upd = await call(a.staff, "editar_solicitud_financiamiento", eargs);
    const uRow = await prisma.fundingApplication.findUnique({ where: { id: String(app.id) } });
    check("STAFF cambia estado y fecha; el prestamista, el monto y las notas se conservan (no vuelven a vacío)",
      uRow?.status === "SUBMITTED" && uRow.submittedAt?.toISOString() === "2026-06-01T12:00:00.000Z" && uRow.lenderName === `Banco ${MARK}` && uRow.requestedAmount?.toString() === "25000" && uRow.notes === "nota", uRow);
    check("devuelve exactamente el nuevo updatedAt de la base de datos", (upd.updatedAt instanceof Date ? upd.updatedAt.toISOString() : String(upd.updatedAt)) === uRow!.updatedAt.toISOString() && uRow!.updatedAt.toISOString() !== token, { upd, db: uRow?.updatedAt });
    check("auditoría y refresco", (await auditOk("editar_solicitud_financiamiento", String(app.id), "FundingApplication")) && calls.some((c) => c.path === `/crm/expedientes/${fCase.id}`), calls);
    const fresh = async () => (await prisma.fundingApplication.findUnique({ where: { id: String(app.id) } }))!;
    await call(a.staff, "editar_solicitud_financiamiento", { expedienteId: fCase.id, solicitudId: String(app.id), actualizadoEn: (await fresh()).updatedAt.toISOString(), approvedAmount: "5000" });
    const r3 = await fresh();
    check("sin enviar el estado, no vuelve a DRAFT y conserva el resto", r3.status === "SUBMITTED" && r3.approvedAmount?.toString() === "5000" && r3.requestedAmount?.toString() === "25000" && r3.submittedAt?.toISOString() === "2026-06-01T12:00:00.000Z", r3);
    await call(a.staff, "editar_solicitud_financiamiento", { expedienteId: fCase.id, solicitudId: String(app.id), actualizadoEn: r3.updatedAt.toISOString(), requestedAmount: null });
    check("null borra el monto solicitado", (await fresh()).requestedAmount === null);
    // Fusión con los valores actuales: prestamista, notas y fecha de decisión.
    await prisma.fundingApplication.update({ where: { id: String(app.id) }, data: { decisionAt: new Date("2026-07-01T12:00:00Z") } });
    await call(a.staff, "editar_solicitud_financiamiento", { expedienteId: fCase.id, solicitudId: String(app.id), actualizadoEn: (await fresh()).updatedAt.toISOString(), status: "UNDER_REVIEW" });
    const r4 = await fresh();
    check("solo el estado: la fecha de decisión, el prestamista y las notas se conservan", r4.status === "UNDER_REVIEW" && r4.decisionAt?.toISOString() === "2026-07-01T12:00:00.000Z" && r4.lenderName === `Banco ${MARK}` && r4.notes === "nota", r4);
    await call(a.staff, "editar_solicitud_financiamiento", { expedienteId: fCase.id, solicitudId: String(app.id), actualizadoEn: r4.updatedAt.toISOString(), lenderName: ` Otro ${MARK} `, notes: "nuevas", decisionAt: "2026-08-01T12:00:00Z" });
    const r5 = await fresh();
    check("prestamista, notas y decisión enviados reemplazan los actuales (y el estado se conserva)", r5.lenderName === `Otro ${MARK}` && r5.notes === "nuevas" && r5.decisionAt?.toISOString() === "2026-08-01T12:00:00.000Z" && r5.status === "UNDER_REVIEW", r5);
    check("token viejo -> error y sin cambios", (await errorText(() => call(a.staff, "editar_solicitud_financiamiento", { ...eargs, status: "APPROVED" }))).startsWith("DomainError") && (await prisma.fundingApplication.findUnique({ where: { id: String(app.id) } }))?.status === "UNDER_REVIEW");
    check("solicitud de otro expediente -> No encontrado", (await errorText(() => call(a.staff, "editar_solicitud_financiamiento", { ...eargs, solicitudId: "cualquiera" }))) === "NotFoundError: No encontrado.");
    const bApp = await prisma.fundingApplication.create({ data: { organizationId: b.org.id, fundingCaseId: (await prisma.fundingCase.findFirstOrThrow({ where: { serviceCaseId: bF.id } })).id, lenderName: "Ajeno" } });
    check("solicitud ajena -> No encontrado y sin cambios", (await errorText(() => call(a.staff, "editar_solicitud_financiamiento", { expedienteId: bF.id, solicitudId: bApp.id, actualizadoEn: bApp.updatedAt.toISOString(), status: "APPROVED" }))) === "NotFoundError: No encontrado." && (await prisma.fundingApplication.findUnique({ where: { id: bApp.id } }))?.status === "DRAFT");
  } finally {
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
  if (failed) {
    console.error(`\n${failed} comprobaciones fallaron`);
    process.exit(1);
  }
  console.log("\nmcp-write-analysis: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
