/**
 * Herramientas de escritura de Clientes del conector MCP contra una base real y desechable:
 * crear_cliente, editar_cliente, asignar_cliente, archivar_cliente (archivo lógico).
 * Permiso, validación, aislamiento por organización, auditoría, refresco, sin datos sensibles.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-clients.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, errorName, meta, seedMcpOrg } from "./_lib/mcp-seed";

assertDisposableDb();
const prisma = new PrismaClient();
const MARK = `mcpwcli${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

const NOT_FOUND = ["NotFoundError", "DomainError"];

async function run() {
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const { allTools } = await import("../../src/server/mcp/tools");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  const created: string[] = [];
  try {
    const revalidated: string[] = [];
    const opts = { tools: allTools(), revalidate: (p: string) => revalidated.push(p) };
    const call = (ctx: typeof a.staff, name: string, args: unknown) => callTool(ctx, name, args, opts);
    const auditOf = (action: string, entityId: string) =>
      prisma.auditLog.findFirst({ where: { organizationId: a.org.id, action, entityId } });

    console.log("\n[mcp-write-clients] crear_cliente\n");
    check("VIEWER → ForbiddenError", (await errorName(() => call(a.viewer, "crear_cliente", { firstName: "Zoe" }))) === "ForbiddenError");
    check("VIEWER no escribió nada", (await prisma.client.count({ where: { organizationId: a.org.id, firstName: "Zoe" } })) === 0);
    check("sin nombre → ZodError", (await errorName(() => call(a.staff, "crear_cliente", { firstName: "" }))) === "ZodError");
    revalidated.length = 0;
    const made = (await call(a.staff, "crear_cliente", {
      firstName: "Zoe",
      lastName: "Nueva",
      email: `${MARK}-zoe@example.test`,
      phone: "555-123-4567",
      state: "tx",
      ssn: "123-45-6789",
    })) as { id: string; clientCode: string; href: string };
    created.push(made.id);
    const row = await prisma.client.findUnique({ where: { id: made.id }, include: { sensitive: true } });
    check("crea el cliente en la organización", row?.organizationId === a.org.id && row?.firstName === "Zoe" && row?.state === "TX", row);
    check("devuelve id, código y enlace", !!made.clientCode && made.href === `/crm/clientes/${made.id}`, made);
    check("no acepta ni devuelve datos sensibles", !row?.sensitive && !JSON.stringify(made).includes("123-45"), made);
    const aud = await auditOf("mcp.tool.crear_cliente", made.id);
    check("auditoría con origen Claude", aud?.entityType === "Client" && aud.actorUserId === a.staff.userId && meta(aud.metadata).via === "claude", aud);
    check("refresca como la action",
      ["/crm/clientes", "/crm/dashboard", `/crm/clientes/${made.id}`, `/crm/clientes/${made.id}/expediente`].every((p) => revalidated.includes(p)), revalidated);

    console.log("\n[mcp-write-clients] editar_cliente\n");
    check("VIEWER → ForbiddenError", (await errorName(() => call(a.viewer, "editar_cliente", { clienteId: made.id, firstName: "X" }))) === "ForbiddenError");
    check("id inválido → ZodError", (await errorName(() => call(a.staff, "editar_cliente", { clienteId: "", firstName: "X" }))) === "ZodError");
    check("email inválido → ZodError", (await errorName(() => call(a.staff, "editar_cliente", { clienteId: made.id, email: "mal" }))) === "ZodError");
    revalidated.length = 0;
    const edited = (await call(a.staff, "editar_cliente", { clienteId: made.id, city: "Austin", status: "ACTIVE" })) as { id: string; href: string };
    const row2 = await prisma.client.findUnique({ where: { id: made.id } });
    check("edita solo lo enviado", row2?.city === "Austin" && row2.status === "ACTIVE" && row2.firstName === "Zoe", row2);
    check("devuelve id y enlace", edited.id === made.id && edited.href === `/crm/clientes/${made.id}`, edited);
    check("auditoría editar_cliente", (await auditOf("mcp.tool.editar_cliente", made.id))?.metadata !== undefined && meta((await auditOf("mcp.tool.editar_cliente", made.id))?.metadata).via === "claude");
    check("refresca la ficha", revalidated.includes(`/crm/clientes/${made.id}`) && revalidated.includes("/crm/clientes"), revalidated);
    await prisma.client.update({ where: { id: made.id }, data: { assignedToId: a.owner.userId } });
    await call(a.staff, "editar_cliente", { clienteId: made.id, city: "Dallas", assignedToId: "" });
    check("responsable vacío al editar → no se quita la asignación",
      (await prisma.client.findUnique({ where: { id: made.id } }))?.assignedToId === a.owner.userId);
    const foreign = (await errorName(() => call(a.staff, "editar_cliente", { clienteId: b.client.id, city: "Hackeo" })));
    check("cliente de otra organización → no encontrado", NOT_FOUND.includes(foreign), foreign);
    check("otra organización intacta", (await prisma.client.findUnique({ where: { id: b.client.id } }))?.city === null);

    console.log("\n[mcp-write-clients] asignar_cliente\n");
    check("VIEWER → ForbiddenError", (await errorName(() => call(a.viewer, "asignar_cliente", { clienteId: made.id, assignedToId: a.owner.userId }))) === "ForbiddenError");
    check("sin asignado → ZodError", (await errorName(() => call(a.staff, "asignar_cliente", { clienteId: made.id }))) === "ZodError");
    revalidated.length = 0;
    await call(a.staff, "asignar_cliente", { clienteId: made.id, assignedToId: a.owner.userId });
    check("asigna al responsable", (await prisma.client.findUnique({ where: { id: made.id } }))?.assignedToId === a.owner.userId);
    check("auditoría asignar_cliente", meta((await auditOf("mcp.tool.asignar_cliente", made.id))?.metadata).via === "claude");
    check("refresca la ficha", revalidated.includes(`/crm/clientes/${made.id}`), revalidated);
    await call(a.staff, "asignar_cliente", { clienteId: made.id, assignedToId: null });
    check("null quita al responsable", (await prisma.client.findUnique({ where: { id: made.id } }))?.assignedToId === null);
    const outsider = await errorName(() => call(a.staff, "asignar_cliente", { clienteId: made.id, assignedToId: b.owner.userId }));
    check("responsable de otra organización → rechazado", outsider !== "ok", outsider);
    check("nada asignado tras el rechazo", (await prisma.client.findUnique({ where: { id: made.id } }))?.assignedToId === null);
    const foreign2 = await errorName(() => call(a.staff, "asignar_cliente", { clienteId: b.client.id, assignedToId: a.owner.userId }));
    check("cliente de otra organización → no encontrado", NOT_FOUND.includes(foreign2), foreign2);

    console.log("\n[mcp-write-clients] archivar_cliente\n");
    check("VIEWER → ForbiddenError", (await errorName(() => call(a.viewer, "archivar_cliente", { clienteId: made.id }))) === "ForbiddenError");
    check("VIEWER no archivó", (await prisma.client.findUnique({ where: { id: made.id } }))?.status !== "ARCHIVED");
    const foreign3 = await errorName(() => call(a.staff, "archivar_cliente", { clienteId: b.client.id }));
    check("cliente de otra organización → no encontrado", NOT_FOUND.includes(foreign3), foreign3);
    check("otra organización sin archivar", (await prisma.client.findUnique({ where: { id: b.client.id } }))?.status === "ACTIVE");
    revalidated.length = 0;
    await call(a.staff, "archivar_cliente", { clienteId: made.id });
    const row3 = await prisma.client.findUnique({ where: { id: made.id } });
    check("archivo lógico: el cliente sigue existiendo", row3?.status === "ARCHIVED" && row3.archivedAt instanceof Date, row3);
    check("auditoría archivar_cliente", meta((await auditOf("mcp.tool.archivar_cliente", made.id))?.metadata).via === "claude");
    check("refresca la ficha", revalidated.includes(`/crm/clientes/${made.id}`), revalidated);
    check("ya archivado → error y sigue ahí", (await errorName(() => call(a.staff, "archivar_cliente", { clienteId: made.id }))) !== "ok");
  } finally {
    await prisma.client.deleteMany({ where: { id: { in: created } } }).catch(() => undefined);
    await a.cleanup();
    await b.cleanup();
  }
}

run()
  .catch((error) => {
    failed += 1;
    console.error(error);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failed ? `\n${failed} comprobación(es) fallaron.` : "\nTodo bien.");
    process.exit(failed ? 1 : 0);
  });
