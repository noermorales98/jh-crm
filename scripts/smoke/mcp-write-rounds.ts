/**
 * Herramientas de escritura de rondas del conector MCP contra una base real y desechable.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-rounds.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, errorName, meta, seedMcpOrg } from "./_lib/mcp-seed";

assertDisposableDb();
process.env.FEATURE_MCP_CONNECTOR = "true";

const prisma = new PrismaClient();
const MARK = `mcpround${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

function ymdIn(date: Date | null | undefined, tz: string) {
  if (!date) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

async function main() {
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const { roundsTools } = await import("../../src/server/mcp/tools/rounds");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  const calls: Array<{ path: string; type?: string }> = [];
  const opts = { tools: roundsTools, revalidate: (path: string, type?: "layout" | "page") => void calls.push({ path, type }) };
  const call = (ctx: typeof a.staff, name: string, args: unknown) => callTool(ctx, name, args, opts) as Promise<Record<string, unknown>>;

  try {
    const tz = (await prisma.organizationSettings.findUnique({ where: { organizationId: a.org.id } }))!.timezone;
    const auditOf = (name: string, entityId: string) =>
      prisma.auditLog.findFirst({ where: { organizationId: a.org.id, action: `mcp.tool.${name}`, entityId } });
    const seedCase = async (s: typeof a, suffix: string) => {
      const sc = await prisma.serviceCase.create({
        data: { organizationId: s.org.id, clientId: s.client.id, serviceId: s.service.id, caseNumber: `SC-${suffix}-${MARK}`.slice(0, 30), stageId: s.stage.id } as never,
      });
      return prisma.creditCase.create({
        data: { organizationId: s.org.id, clientId: s.client.id, serviceCaseId: sc.id, caseCode: `CC-${suffix}-${MARK}`.slice(0, 30), stageId: s.stage.id },
      });
    };
    const caseA = await seedCase(a, "A");
    const caseB = await seedCase(b, "B");
    const mkRound = (orgId: string, caseId: string, roundNumber: number, extra: object = {}) =>
      prisma.creditRound.create({ data: { organizationId: orgId, caseId, roundNumber, ...extra } });
    const foreign = await mkRound(b.org.id, caseB.id, 1);
    const roundsPaths = (c: typeof calls) =>
      c.some((x) => x.path === "/crm/rondas") && c.some((x) => x.path === "/crm/dashboard") && c.some((x) => x.type === "layout");
    const hrefOk = (r: Record<string, unknown>) => typeof r.href === "string" && String(r.href).includes("/crm/") && String(r.href).includes(String(r.id));
    const notFound = async (fn: () => Promise<unknown>) => (await errorName(fn)) === "NotFoundError";
    const unchanged = async (id: string, status: string) => (await prisma.creditRound.findUnique({ where: { id } }))?.status === status;

    console.log("crear_ronda");
    check("VIEWER -> Sin permiso", (await errorName(() => call(a.viewer, "crear_ronda", { caseId: caseA.id }))) === "ForbiddenError");
    check("VIEWER no escribe", (await prisma.creditRound.count({ where: { organizationId: a.org.id } })) === 0);
    calls.length = 0;
    const created = await call(a.staff, "crear_ronda", { caseId: caseA.id, notes: "  Primera ronda  ", lettersCount: 3 });
    const row = await prisma.creditRound.findUnique({ where: { id: String(created.id) } });
    check("STAFF crea la ronda #1 en borrador", !!row && row.roundNumber === 1 && row.status === "DRAFT" && row.notes === "Primera ronda" && row.lettersCount === 3, row);
    check("devuelve id, estado y href", created.status === "DRAFT" && hrefOk(created), created);
    const au = await auditOf("crear_ronda", String(created.id));
    check("auditoría con via claude y entidad CreditRound", !!au && au.entityType === "CreditRound" && meta(au.metadata).via === "claude", au);
    check("refresca rondas, caso y dashboard", roundsPaths(calls), calls);
    const second = await call(a.owner, "crear_ronda", { caseId: caseA.id });
    check("OWNER crea la ronda #2", (await prisma.creditRound.findUnique({ where: { id: String(second.id) } }))?.roundNumber === 2);
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "crear_ronda", { caseId: caseA.id, lettersCount: -1 }))) === "ZodError");
    const n = await prisma.creditRound.count({ where: { organizationId: b.org.id } });
    check("caso de otra organización -> no encontrado y sin cambios", (await notFound(() => call(a.staff, "crear_ronda", { caseId: caseB.id }))) && (await prisma.creditRound.count({ where: { organizationId: b.org.id } })) === n);

    console.log("editar_ronda");
    const r = String(created.id);
    check("VIEWER -> Sin permiso", (await errorName(() => call(a.viewer, "editar_ronda", { rondaId: r, notes: "x" }))) === "ForbiddenError");
    calls.length = 0;
    const edited = await call(a.staff, "editar_ronda", { rondaId: r, notes: "Notas nuevas", lettersCount: 5 });
    const er = await prisma.creditRound.findUnique({ where: { id: r } });
    check("STAFF edita", er?.notes === "Notas nuevas" && er.lettersCount === 5 && hrefOk(edited), er);
    const au2 = await auditOf("editar_ronda", r);
    check("auditoría", !!au2 && au2.entityType === "CreditRound" && meta(au2.metadata).via === "claude", au2);
    check("refresca", roundsPaths(calls), calls);
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "editar_ronda", { rondaId: r, lettersCount: 1.5 }))) === "ZodError");
    check("ronda ajena -> no encontrada y sin cambios", (await notFound(() => call(a.staff, "editar_ronda", { rondaId: foreign.id, notes: "hack" }))) && (await prisma.creditRound.findUnique({ where: { id: foreign.id } }))!.notes === null);

    console.log("marcar_ronda_enviada");
    check("VIEWER -> Sin permiso", (await errorName(() => call(a.viewer, "marcar_ronda_enviada", { rondaId: r, expectedReviewAt: "2026-12-10" }))) === "ForbiddenError");
    check("sin fecha -> ZodError", (await errorName(() => call(a.staff, "marcar_ronda_enviada", { rondaId: r }))) === "ZodError");
    check("sin contrato firmado no se envía", (await errorName(() => call(a.staff, "marcar_ronda_enviada", { rondaId: r, expectedReviewAt: "2026-12-10" }))) === "DomainError" && (await unchanged(r, "DRAFT")));
    await prisma.clientContract.create({
      data: { organizationId: a.org.id, clientId: a.client.id, caseId: caseA.id, title: "Contrato sintético", version: "1", contentSnapshot: "x", status: "SIGNED", signedAt: new Date() },
    });
    calls.length = 0;
    const sent = await call(a.staff, "marcar_ronda_enviada", { rondaId: r, expectedReviewAt: "2026-12-10", createReviewTask: true, assignedToId: a.staff.userId });
    const sr = await prisma.creditRound.findUnique({ where: { id: r } });
    check("STAFF envía: estado SENT", sr?.status === "SENT" && !!sr.sentAt, sr);
    check("expectedReviewAt cae el mismo día en la zona de la organización", ymdIn(sr?.expectedReviewAt, tz) === "2026-12-10", sr?.expectedReviewAt);
    check("expectedReviewAt a las 12:00 locales", Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(sr!.expectedReviewAt!)) === 12);
    const rt = sent.reviewTaskId ? await prisma.task.findUnique({ where: { id: String(sent.reviewTaskId) } }) : null;
    check("crea la tarea de revisión con recordatorio a las 09:00 del mismo día", !!rt && ymdIn(rt.reminderAt, tz) === "2026-12-10" && Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(rt.reminderAt!)) === 9, rt);
    check("devuelve estado y href", sent.status === "SENT" && hrefOk(sent), sent);
    const au3 = await auditOf("marcar_ronda_enviada", r);
    check("auditoría", !!au3 && au3.entityType === "CreditRound" && meta(au3.metadata).via === "claude", au3);
    check("refresca rondas y tareas", roundsPaths(calls) && calls.some((x) => x.path === "/crm/tareas"), calls);
    check("ronda ya enviada no se reenvía", (await errorName(() => call(a.staff, "marcar_ronda_enviada", { rondaId: r, expectedReviewAt: "2026-12-11" }))) === "DomainError");
    const fSent = await mkRound(b.org.id, caseB.id, 2);
    check("ronda ajena -> no encontrada y sin cambios", (await notFound(() => call(a.staff, "marcar_ronda_enviada", { rondaId: fSent.id, expectedReviewAt: "2026-12-10" }))) && (await unchanged(fSent.id, "DRAFT")));

    console.log("marcar_ronda_revisada");
    check("VIEWER -> Sin permiso", (await errorName(() => call(a.viewer, "marcar_ronda_revisada", { rondaId: r }))) === "ForbiddenError");
    calls.length = 0;
    const reviewing = await call(a.staff, "marcar_ronda_revisada", { rondaId: r, outcome: "REVIEWING", notes: "Respuesta parcial" });
    check("REVIEWING", reviewing.status === "REVIEWING" && (await prisma.creditRound.findUnique({ where: { id: r } }))?.notes === "Respuesta parcial");
    const reviewed = await call(a.staff, "marcar_ronda_revisada", { rondaId: r });
    const rr = await prisma.creditRound.findUnique({ where: { id: r } });
    check("sin outcome -> COMPLETED con reviewedAt", reviewed.status === "COMPLETED" && rr?.status === "COMPLETED" && !!rr.reviewedAt && hrefOk(reviewed), rr);
    const au4 = await auditOf("marcar_ronda_revisada", r);
    check("auditoría", !!au4 && au4.entityType === "CreditRound" && meta(au4.metadata).via === "claude", au4);
    check("refresca", roundsPaths(calls), calls);
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "marcar_ronda_revisada", { rondaId: r, outcome: "NOPE" }))) === "ZodError");
    check("ronda en borrador no se revisa", (await errorName(() => call(a.staff, "marcar_ronda_revisada", { rondaId: String(second.id) }))) === "DomainError");
    const fSent2 = await mkRound(b.org.id, caseB.id, 3, { status: "SENT" });
    check("ronda ajena -> no encontrada y sin cambios", (await notFound(() => call(a.staff, "marcar_ronda_revisada", { rondaId: fSent2.id }))) && (await unchanged(fSent2.id, "SENT")));

    console.log("cancelar_ronda");
    const k = String(second.id);
    check("VIEWER -> Sin permiso", (await errorName(() => call(a.viewer, "cancelar_ronda", { rondaId: k }))) === "ForbiddenError");
    calls.length = 0;
    const cancelled = await call(a.staff, "cancelar_ronda", { rondaId: k });
    const kc = await prisma.creditRound.findUnique({ where: { id: k } });
    check("STAFF cancela (la ronda sigue existiendo, estado CANCELLED)", kc?.status === "CANCELLED" && cancelled.status === "CANCELLED" && hrefOk(cancelled), kc);
    const au5 = await auditOf("cancelar_ronda", k);
    check("auditoría", !!au5 && au5.entityType === "CreditRound" && meta(au5.metadata).via === "claude", au5);
    check("refresca", roundsPaths(calls), calls);
    check("ronda completada no se cancela", (await errorName(() => call(a.staff, "cancelar_ronda", { rondaId: r }))) === "DomainError" && (await unchanged(r, "COMPLETED")));
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "cancelar_ronda", { rondaId: "" }))) === "ZodError");
    check("ronda ajena -> no encontrada y sin cambios", (await notFound(() => call(a.staff, "cancelar_ronda", { rondaId: foreign.id }))) && (await unchanged(foreign.id, "DRAFT")));

    const tool = roundsTools.find((t) => t.name === "cancelar_ronda");
    check("cancelar_ronda es destructiva y no promete deshacer", tool?.kind === "destructive" && !/se puede (deshacer|revertir|reabrir)/i.test(tool.description));
  } finally {
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
  if (failed) {
    console.error(`\n${failed} comprobaciones fallaron`);
    process.exit(1);
  }
  console.log("\nmcp-write-rounds: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
