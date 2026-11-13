/**
 * Herramientas de escritura de cartas de disputa del conector MCP contra una base real y desechable.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-letters.ts
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
const MARK = `mcpltr${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

type Seeded = Awaited<ReturnType<typeof seedMcpOrg>>;

async function main() {
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const { allTools } = await import("../../src/server/mcp/tools");
  const { lettersTools } = await import("../../src/server/mcp/tools/letters");
  const cases = await import("../../src/server/cases");
  const creditReports = await import("../../src/server/credit-reports");
  const rounds = await import("../../src/server/rounds");
  const disputes = await import("../../src/server/disputes");
  const letterService = await import("../../src/server/letters");

  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  const calls: Array<{ path: string; type?: string }> = [];
  // Las herramientas de cartas se pasan explícitas: no dependen de que `index.ts` ya las registre.
  const opts = {
    tools: [...allTools().filter((t) => !lettersTools.some((l) => l.name === t.name)), ...lettersTools],
    revalidate: (path: string, type?: "layout" | "page") => void calls.push({ path, type }),
  };
  const call = (ctx: Seeded["staff"], name: string, args: unknown) =>
    callTool(ctx, name, args, opts) as Promise<Record<string, unknown>>;

  /** Caso + reporte + ronda con `n` disputas, todo sintético, vía los servicios. */
  async function seedRound(s: Seeded, n = 2) {
    const ctx = s.owner;
    const creditCase = await cases.createCreditCase(ctx, { clientId: s.client.id, stageId: s.stage.id });
    const report = await creditReports.createCreditReport(ctx, {
      caseId: creditCase.id,
      type: "INITIAL",
      reportDate: new Date("2026-02-01"),
      snapshots: [{ bureau: "EXPERIAN", score: 550 }],
      items: Array.from({ length: n }, (_, i) => ({
        creditorName: `Acreedor ${i + 1}`,
        accountNumberMasked: `****${1000 + i}`,
        bureau: "EXPERIAN" as const,
        negativeType: "COLLECTION" as const,
        isNegative: true,
      })),
    });
    const detail = await creditReports.getReportDetail(ctx, report.id);
    const round = await rounds.createRound(ctx, { caseId: creditCase.id });
    for (const item of detail.items) {
      await disputes.addDisputeItem(ctx, { roundId: round.id, creditItemId: item.id, disputeReason: "No es mía", action: "Disputar" });
    }
    const summary = await disputes.getRoundDisputeSummary(ctx, round.id);
    const templates = await letterService.ensureDefaultTemplates(ctx);
    return { creditCase, round, itemIds: summary.items.map((i) => i.id), template: templates[0] };
  }

  const auditOf = (name: string, entityId: string) =>
    prisma.auditLog.findFirst({ where: { organizationId: a.org.id, action: `mcp.tool.${name}`, entityId } });
  const caseLayout = (c: typeof calls) => c.some((x) => x.type === "layout" && x.path.includes("/crm/clientes/"));
  const letterOf = (id: string) => prisma.disputeLetter.findUnique({ where: { id } });

  try {
    const ra = await seedRound(a);
    const rb = await seedRound(b, 1);
    const letterCount = () => prisma.disputeLetter.count({ where: { organizationId: a.org.id } });

    console.log("crear_borrador_carta");
    const draftArgs = { roundId: ra.round.id, bureau: "EXPERIAN", templateId: ra.template.id, disputeItemIds: [ra.itemIds[0]] };
    const n0 = await letterCount();
    check("VIEWER -> Sin permiso", (await errorName(() => call(a.viewer, "crear_borrador_carta", draftArgs))) === "ForbiddenError");
    check("VIEWER no escribe", (await letterCount()) === n0);
    calls.length = 0;
    const created = await call(a.staff, "crear_borrador_carta", draftArgs);
    const row = await letterOf(String(created.id));
    check("STAFF crea el borrador", !!row && row.status === "READY_FOR_REVIEW" && row.bureau === "EXPERIAN" && row.roundId === ra.round.id, row);
    check("devuelve id, status y href", created.status === "READY_FOR_REVIEW" && typeof created.href === "string" && String(created.href).includes("/crm/clientes/"), created);
    check("no devuelve el contenido de la carta", !("contentSnapshot" in created) && !("content" in created));
    const au = await auditOf("crear_borrador_carta", String(created.id));
    check("auditoría con via claude y entidad DisputeLetter", !!au && au.entityType === "DisputeLetter" && meta(au.metadata).via === "claude", au);
    check("refresca el layout del caso", caseLayout(calls), calls);
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "crear_borrador_carta", { ...draftArgs, disputeItemIds: [] }))) === "ZodError");
    const n1 = await letterCount();
    check("ronda de otra organización: no se crea", (await errorName(() => call(a.staff, "crear_borrador_carta", { ...draftArgs, roundId: rb.round.id }))) !== "ok" && (await letterCount()) === n1);

    console.log("editar_borrador_carta");
    const letterId = String(created.id);
    check("VIEWER -> Sin permiso", (await errorName(() => call(a.viewer, "editar_borrador_carta", { letterId, subject: "x" }))) === "ForbiddenError");
    calls.length = 0;
    await call(a.staff, "editar_borrador_carta", { letterId, subject: `Asunto ${MARK}`, recipient: "Buró de prueba" });
    const e = await letterOf(letterId);
    check("STAFF edita", e?.subjectSnapshot === `Asunto ${MARK}` && e.recipient === "Buró de prueba", e);
    const au2 = await auditOf("editar_borrador_carta", letterId);
    check("auditoría", !!au2 && au2.entityType === "DisputeLetter" && meta(au2.metadata).via === "claude", au2);
    check("refresca", caseLayout(calls), calls);
    check("contenido demasiado corto -> ZodError", (await errorName(() => call(a.staff, "editar_borrador_carta", { letterId, content: "corto" }))) === "ZodError");
    // Carta ajena: se siembra en la organización b.
    const foreignLetter = await letterService.createLetterDraft(b.owner, {
      roundId: rb.round.id,
      bureau: "EXPERIAN",
      templateId: rb.template.id,
      disputeItemIds: [rb.itemIds[0]],
    });
    check("carta ajena -> no encontrada y sin cambios", (await errorText(() => call(a.staff, "editar_borrador_carta", { letterId: foreignLetter.id, subject: "hack" }))).startsWith("NotFoundError") && (await letterOf(foreignLetter.id))!.subjectSnapshot !== "hack");

    console.log("finalizar_carta");
    check("VIEWER -> Sin permiso", (await errorName(() => call(a.viewer, "finalizar_carta", { letterId }))) === "ForbiddenError");
    calls.length = 0;
    const fin = await call(a.staff, "finalizar_carta", { letterId });
    const f = await letterOf(letterId);
    check("STAFF finaliza", f?.status === "FINAL" && !!f.finalizedAt && fin.status === "FINAL", f);
    const au3 = await auditOf("finalizar_carta", letterId);
    check("auditoría", !!au3 && meta(au3.metadata).via === "claude", au3);
    check("refresca", caseLayout(calls), calls);
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "finalizar_carta", {}))) === "ZodError");
    check("carta ajena -> no encontrada y sin cambios", (await errorText(() => call(a.staff, "finalizar_carta", { letterId: foreignLetter.id }))).startsWith("NotFoundError") && (await letterOf(foreignLetter.id))!.status === "READY_FOR_REVIEW");
    check("una carta final ya no se edita", (await errorName(() => call(a.staff, "editar_borrador_carta", { letterId, subject: "tarde" }))) !== "ok");

    console.log("marcar_carta_enviada");
    check("VIEWER -> Sin permiso", (await errorName(() => call(a.viewer, "marcar_carta_enviada", { letterId }))) === "ForbiddenError");
    check("carta ajena -> no encontrada", (await errorText(() => call(a.staff, "marcar_carta_enviada", { letterId: foreignLetter.id }))).startsWith("NotFoundError"));
    const draft2 = await call(a.staff, "crear_borrador_carta", { ...draftArgs, disputeItemIds: [ra.itemIds[1]] });
    check("una carta sin finalizar no se marca enviada", (await errorName(() => call(a.staff, "marcar_carta_enviada", { letterId: String(draft2.id) }))) !== "ok" && (await letterOf(String(draft2.id)))!.status !== "SENT");
    calls.length = 0;
    const sent = await call(a.staff, "marcar_carta_enviada", { letterId, trackingNumber: `TRK-${MARK}` });
    const s = await letterOf(letterId);
    check("STAFF marca enviada con guía", s?.status === "SENT" && !!s.sentAt && s.trackingNumber === `TRK-${MARK}` && sent.status === "SENT", s);
    const au4 = await auditOf("marcar_carta_enviada", letterId);
    check("auditoría", !!au4 && meta(au4.metadata).via === "claude", au4);
    check("refresca", caseLayout(calls), calls);
    const tool = lettersTools.find((t) => t.name === "marcar_carta_enviada");
    check("no es de mundo abierto (solo registra el envío)", !!tool && !tool.openWorld);

    console.log("generar_cartas_por_estrategia");
    const rc = await seedRound(a, 2);
    check("VIEWER -> Sin permiso", (await errorName(() => call(a.viewer, "generar_cartas_por_estrategia", { roundId: rc.round.id }))) === "ForbiddenError");
    check("ronda ajena -> no encontrada", (await errorText(() => call(a.staff, "generar_cartas_por_estrategia", { roundId: rb.round.id }))).startsWith("NotFoundError"));
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "generar_cartas_por_estrategia", { roundId: "" }))) === "ZodError");
    calls.length = 0;
    const gen = await call(a.staff, "generar_cartas_por_estrategia", { roundId: rc.round.id, cfpb: true });
    const generated = await prisma.disputeLetter.findMany({ where: { roundId: rc.round.id } });
    check("STAFF genera cartas y quejas", Number(gen.letters) >= 1 && Number(gen.complaints) === 1 && generated.length === Number(gen.letters) + Number(gen.complaints), { gen, n: generated.length });
    check("devuelve href de la ronda", typeof gen.href === "string" && String(gen.href).includes("/crm/clientes/"), gen);
    const au5 = await auditOf("generar_cartas_por_estrategia", rc.round.id);
    check("auditoría sobre la ronda", !!au5 && au5.entityType === "CreditRound" && meta(au5.metadata).via === "claude", au5);
    check("refresca", caseLayout(calls), calls);
    const rd = await seedRound(a, 2);
    const genDefault = await call(a.staff, "generar_cartas_por_estrategia", { roundId: rd.round.id });
    const defaultRows = await prisma.disputeLetter.findMany({ where: { roundId: rd.round.id } });
    check("sin `cfpb` el valor por omisión es el de la action (false): cartas y cero quejas", Number(genDefault.letters) >= 1 && Number(genDefault.complaints) === 0 && defaultRows.length === Number(genDefault.letters), { genDefault, n: defaultRows.length });
    check("sin disputas pendientes -> error y no crea más", (await errorName(() => call(a.staff, "generar_cartas_por_estrategia", { roundId: rc.round.id }))) !== "ok");

    console.log("actualizar_seguimiento_carta");
    check("VIEWER -> Sin permiso", (await errorName(() => call(a.viewer, "actualizar_seguimiento_carta", { letterId, complaintId: "X" }))) === "ForbiddenError");
    calls.length = 0;
    await call(a.staff, "actualizar_seguimiento_carta", { letterId, complaintId: `CFPB-${MARK}`.slice(0, 40), followUpAt: "2026-12-15" });
    const u = await letterOf(letterId);
    check("STAFF guarda seguimiento", u?.complaintId === `CFPB-${MARK}`.slice(0, 40) && u.followUpAt?.toISOString() === "2026-12-15T12:00:00.000Z", u);
    const au6 = await auditOf("actualizar_seguimiento_carta", letterId);
    check("auditoría", !!au6 && meta(au6.metadata).via === "claude", au6);
    check("refresca", caseLayout(calls), calls);
    await call(a.staff, "actualizar_seguimiento_carta", { letterId, followUpAt: null });
    check("followUpAt nulo lo borra", (await letterOf(letterId))?.followUpAt === null);
    check("fecha inválida -> ZodError", (await errorName(() => call(a.staff, "actualizar_seguimiento_carta", { letterId, followUpAt: "15/12/2026" }))) === "ZodError");
    check("carta ajena -> no encontrada y sin cambios", (await errorText(() => call(a.staff, "actualizar_seguimiento_carta", { letterId: foreignLetter.id, complaintId: "hack" }))).startsWith("NotFoundError") && (await letterOf(foreignLetter.id))!.complaintId === null);
  } finally {
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
  if (failed) {
    console.error(`\n${failed} comprobaciones fallaron`);
    process.exit(1);
  }
  console.log("\nmcp-write-letters: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
