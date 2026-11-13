/**
 * Herramientas de escritura de tareas del conector MCP contra una base real y desechable.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-tasks.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, errorName, meta, seedMcpOrg } from "./_lib/mcp-seed";

/** Nombre y mensaje del error: AC-3 pide que Claude lea "no encontrada", no otro fallo. */
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
const MARK = `mcptask${Date.now()}`;
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
  const { allTools } = await import("../../src/server/mcp/tools");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  const calls: Array<{ path: string; type?: string }> = [];
  const opts = { tools: allTools(), revalidate: (path: string, type?: "layout" | "page") => void calls.push({ path, type }) };
  const call = (ctx: typeof a.staff, name: string, args: unknown) => callTool(ctx, name, args, opts) as Promise<Record<string, unknown>>;

  try {
    const tz = (await prisma.organizationSettings.findUnique({ where: { organizationId: a.org.id } }))!.timezone;
    const auditOf = (name: string, entityId: string) =>
      prisma.auditLog.findFirst({ where: { organizationId: a.org.id, action: `mcp.tool.${name}`, entityId } });
    const taskCount = () => prisma.task.count({ where: { organizationId: a.org.id } });
    const mk = (organizationId: string, assignedToId: string, createdById: string, extra: object = {}) =>
      prisma.task.create({ data: { organizationId, title: `T ${MARK}`, assignedToId, createdById, ...extra } });
    const tasksPaths = (c: typeof calls) =>
      c.some((x) => x.path === "/crm/tareas") && c.some((x) => x.path === "/crm/dashboard");

    console.log("crear_tarea");
    const before = await taskCount();
    check("VIEWER -> ForbiddenError", (await errorName(() => call(a.viewer, "crear_tarea", { title: "x", assignedToId: a.staff.userId }))) === "ForbiddenError");
    check("VIEWER no escribe", (await taskCount()) === before);
    calls.length = 0;
    const created = await call(a.staff, "crear_tarea", {
      title: `  Llamar a Ana ${MARK} `,
      type: "CALL",
      priority: "HIGH",
      dueAt: "2026-12-01",
      reminderAt: "2026-11-30",
      assignedToId: a.staff.userId,
      clientId: a.client.id,
    });
    const row = await prisma.task.findUnique({ where: { id: String(created.id) } });
    check("STAFF crea la tarea", !!row && row.title === `Llamar a Ana ${MARK}` && row.type === "CALL" && row.priority === "HIGH" && row.clientId === a.client.id, row);
    check("dueAt cae el mismo día en la zona de la organización", ymdIn(row?.dueAt, tz) === "2026-12-01", row?.dueAt);
    check("dueAt a las 12:00 locales", row?.dueAt?.toISOString() !== undefined && Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(row!.dueAt!)) === 12);
    check("reminderAt el día 2026-11-30 a las 09:00", ymdIn(row?.reminderAt, tz) === "2026-11-30" && Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(row!.reminderAt!)) === 9);
    const au = await auditOf("crear_tarea", String(created.id));
    check("auditoría con via claude y entidad Task", !!au && au.entityType === "Task" && meta(au.metadata).via === "claude", au);
    check("refresca tareas y dashboard", tasksPaths(calls), calls);
    check("devuelve id y href", typeof created.href === "string" && String(created.href).startsWith("/crm/"), created);
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "crear_tarea", { title: "", assignedToId: a.staff.userId }))) === "ZodError");
    const n1 = await taskCount();
    check("responsable de otra organización: no se crea", (await errorName(() => call(a.staff, "crear_tarea", { title: "x", assignedToId: b.staff.userId }))) !== "ok" && (await taskCount()) === n1);
    check("cliente de otra organización: no se crea", (await errorName(() => call(a.staff, "crear_tarea", { title: "x", assignedToId: a.staff.userId, clientId: b.client.id }))) !== "ok" && (await taskCount()) === n1);

    console.log("editar_tarea");
    const t = await mk(a.org.id, a.staff.userId, a.owner.userId);
    const foreign = await mk(b.org.id, b.staff.userId, b.owner.userId);
    check("VIEWER -> ForbiddenError", (await errorName(() => call(a.viewer, "editar_tarea", { tareaId: t.id, title: "z" }))) === "ForbiddenError");
    calls.length = 0;
    await call(a.staff, "editar_tarea", { tareaId: t.id, title: "Nuevo título", priority: "URGENT", dueAt: "2026-12-01" });
    const e = await prisma.task.findUnique({ where: { id: t.id } });
    check("STAFF edita", e?.title === "Nuevo título" && e.priority === "URGENT" && ymdIn(e.dueAt, tz) === "2026-12-01", e);
    const au2 = await auditOf("editar_tarea", t.id);
    check("auditoría", !!au2 && au2.entityType === "Task" && meta(au2.metadata).via === "claude", au2);
    check("refresca", tasksPaths(calls), calls);
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "editar_tarea", { tareaId: t.id, priority: "NOPE" }))) === "ZodError");
    check("tarea ajena -> no encontrada y sin cambios", (await errorText(() => call(a.staff, "editar_tarea", { tareaId: foreign.id, title: "hack" }))) === "DomainError: Tarea no encontrada." && (await prisma.task.findUnique({ where: { id: foreign.id } }))!.title === `T ${MARK}`);

    console.log("completar_tarea");
    check("VIEWER -> ForbiddenError", (await errorName(() => call(a.viewer, "completar_tarea", { tareaId: t.id }))) === "ForbiddenError");
    calls.length = 0;
    await call(a.staff, "completar_tarea", { tareaId: t.id });
    const c = await prisma.task.findUnique({ where: { id: t.id } });
    check("STAFF completa", c?.status === "COMPLETED" && !!c.completedAt, c);
    const au3 = await auditOf("completar_tarea", t.id);
    check("auditoría", !!au3 && meta(au3.metadata).via === "claude", au3);
    check("refresca", tasksPaths(calls), calls);
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "completar_tarea", {}))) === "ZodError");
    check("tarea ajena -> no encontrada y sin cambios", (await errorText(() => call(a.staff, "completar_tarea", { tareaId: foreign.id }))) === "DomainError: Tarea no encontrada." && (await prisma.task.findUnique({ where: { id: foreign.id } }))!.status === "PENDING");

    console.log("reasignar_tarea");
    const r = await mk(a.org.id, a.staff.userId, a.owner.userId);
    check("VIEWER -> ForbiddenError", (await errorName(() => call(a.viewer, "reasignar_tarea", { tareaId: r.id, assignedToId: a.owner.userId }))) === "ForbiddenError");
    calls.length = 0;
    await call(a.staff, "reasignar_tarea", { tareaId: r.id, assignedToId: a.owner.userId });
    check("STAFF reasigna", (await prisma.task.findUnique({ where: { id: r.id } }))?.assignedToId === a.owner.userId);
    const au4 = await auditOf("reasignar_tarea", r.id);
    check("auditoría", !!au4 && meta(au4.metadata).via === "claude", au4);
    check("refresca", tasksPaths(calls), calls);
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "reasignar_tarea", { tareaId: r.id }))) === "ZodError");
    check("tarea ajena -> no encontrada y sin cambios", (await errorText(() => call(a.staff, "reasignar_tarea", { tareaId: foreign.id, assignedToId: a.owner.userId }))) === "DomainError: Tarea no encontrada." && (await prisma.task.findUnique({ where: { id: foreign.id } }))!.assignedToId === b.staff.userId);
    check("responsable de otra organización: sin cambios", (await errorName(() => call(a.staff, "reasignar_tarea", { tareaId: r.id, assignedToId: b.staff.userId }))) !== "ok" && (await prisma.task.findUnique({ where: { id: r.id } }))?.assignedToId === a.owner.userId);

    console.log("cancelar_tarea");
    const k = await mk(a.org.id, a.staff.userId, a.owner.userId);
    check("VIEWER -> ForbiddenError", (await errorName(() => call(a.viewer, "cancelar_tarea", { tareaId: k.id }))) === "ForbiddenError");
    calls.length = 0;
    await call(a.staff, "cancelar_tarea", { tareaId: k.id });
    const kc = await prisma.task.findUnique({ where: { id: k.id } });
    check("STAFF cancela (la tarea sigue existiendo)", kc?.status === "CANCELLED", kc);
    const au5 = await auditOf("cancelar_tarea", k.id);
    check("auditoría", !!au5 && meta(au5.metadata).via === "claude", au5);
    check("refresca", tasksPaths(calls), calls);
    check("entrada inválida -> ZodError", (await errorName(() => call(a.staff, "cancelar_tarea", { tareaId: "" }))) === "ZodError");
    check("tarea ajena -> no encontrada y sin cambios", (await errorText(() => call(a.staff, "cancelar_tarea", { tareaId: foreign.id }))) === "DomainError: Tarea no encontrada." && (await prisma.task.findUnique({ where: { id: foreign.id } }))!.status === "PENDING");
  } finally {
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
  if (failed) {
    console.error(`\n${failed} comprobaciones fallaron`);
    process.exit(1);
  }
  console.log("\nmcp-write-tasks: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
