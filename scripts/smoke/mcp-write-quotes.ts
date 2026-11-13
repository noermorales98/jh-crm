/**
 * Herramientas de escritura de cotizaciones del conector MCP contra la base desechable jh_gates.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-quotes.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, errorName, meta, seedMcpOrg } from "./_lib/mcp-seed";

assertDisposableDb();
const prisma = new PrismaClient();
const MARK = `mcpwq${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function run() {
  const { allTools } = await import("../../src/server/mcp/tools");
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  try {
    const paths: Array<[string, string | undefined]> = [];
    const spy = (path: string, type?: "layout" | "page") => void paths.push([path, type]);
    const call = (ctx: typeof a.staff, name: string, args: unknown) =>
      callTool(ctx, name, args, { tools: allTools(), revalidate: spy });
    const auditOf = (name: string) =>
      prisma.auditLog.findMany({ where: { organizationId: a.org.id, action: `mcp.tool.${name}` } });
    const quoteInB = await prisma.quote.create({
      data: { organizationId: b.org.id, clientId: b.client.id, folioNumber: 1, folio: `COT-B-${MARK}`.slice(0, 30), subtotal: 10, total: 10 } as never,
    });
    const items = [{ kind: "manual", description: "Servicio de prueba", quantity: 2, unitPrice: 50 }];

    console.log("\n[mcp-write-quotes] crear_cotizacion\n");
    const before = await prisma.quote.count({ where: { organizationId: a.org.id } });
    check("VIEWER → ForbiddenError", (await errorName(() => call(a.viewer, "crear_cotizacion", { clientId: a.client.id, items }))) === "ForbiddenError");
    check("VIEWER no escribió", (await prisma.quote.count({ where: { organizationId: a.org.id } })) === before);
    check("entrada inválida → ZodError", (await errorName(() => call(a.staff, "crear_cotizacion", { clientId: a.client.id, items: [] }))) === "ZodError");
    check("cliente de otra organización → no encontrado", ["NotFoundError", "DomainError"].includes(await errorName(() => call(a.staff, "crear_cotizacion", { clientId: b.client.id, items }))));
    check("nada escrito con cliente ajeno", (await prisma.quote.count({ where: { organizationId: a.org.id } })) === before);
    paths.length = 0;
    const created = meta(await call(a.staff, "crear_cotizacion", { clientId: a.client.id, items, taxRate: 10 }));
    const quoteId = String(created.id);
    const row = await prisma.quote.findUnique({ where: { id: quoteId } });
    check("STAFF crea la cotización", !!row && row.organizationId === a.org.id && row.status === "DRAFT", row);
    check("el servicio calcula el total (100 + 10%)", row?.total.toString() === "110", row?.total.toString());
    check("respuesta con id, folio, total y href", !!created.folio && created.total === "110" && String(created.href).includes(quoteId), created);
    const audit = (await auditOf("crear_cotizacion"))[0];
    check("auditoría mcp.tool.crear_cotizacion", !!audit && audit.entityId === quoteId && meta(audit.metadata).via === "claude", audit);
    check("refresca cotizaciones, dashboard y detalle", ["/crm/cotizaciones", "/crm/dashboard", `/crm/cotizaciones/${quoteId}`].every((p) => paths.some(([x]) => x === p)), paths);

    console.log("\n[mcp-write-quotes] editar_cotizacion\n");
    check("VIEWER → ForbiddenError", (await errorName(() => call(a.viewer, "editar_cotizacion", { cotizacionId: quoteId, notes: "x" }))) === "ForbiddenError");
    check("id inválido → ZodError", (await errorName(() => call(a.staff, "editar_cotizacion", { cotizacionId: "", notes: "x" }))) === "ZodError");
    check("id de otra organización → no encontrado", ["NotFoundError", "DomainError"].includes(await errorName(() => call(a.staff, "editar_cotizacion", { cotizacionId: quoteInB.id, notes: "x" }))));
    check("la de la otra organización no cambió", (await prisma.quote.findUnique({ where: { id: quoteInB.id } }))?.notes == null);
    paths.length = 0;
    const edited = meta(await call(a.staff, "editar_cotizacion", { cotizacionId: quoteId, notes: "Nota nueva", items: [{ kind: "manual", description: "Otro", quantity: 1, unitPrice: 200 }] }));
    const row2 = await prisma.quote.findUnique({ where: { id: quoteId } });
    check("STAFF edita notas y recalcula el total (200 + 10%)", row2?.notes === "Nota nueva" && row2.total.toString() === "220" && edited.total === "220", row2?.total.toString());
    check("auditoría mcp.tool.editar_cotizacion", (await auditOf("editar_cotizacion")).some((l) => l.entityId === quoteId && meta(l.metadata).via === "claude"));
    check("refresca las mismas rutas", ["/crm/cotizaciones", "/crm/dashboard", `/crm/cotizaciones/${quoteId}`].every((p) => paths.some(([x]) => x === p)), paths);

    console.log("\n[mcp-write-quotes] transiciones\n");
    const transitions: Array<[string, string, string]> = [
      ["marcar_cotizacion_enviada", "SENT", "DRAFT"],
      ["marcar_cotizacion_rechazada", "REJECTED", "SENT"],
    ];
    check("VIEWER → ForbiddenError (enviada)", (await errorName(() => call(a.viewer, "marcar_cotizacion_enviada", { cotizacionId: quoteId }))) === "ForbiddenError");
    check("sigue en borrador tras el VIEWER", (await prisma.quote.findUnique({ where: { id: quoteId } }))?.status === "DRAFT");
    check("id inválido → ZodError", (await errorName(() => call(a.staff, "marcar_cotizacion_enviada", { cotizacionId: "" }))) === "ZodError");
    for (const name of ["marcar_cotizacion_enviada", "marcar_cotizacion_aceptada", "marcar_cotizacion_rechazada", "cancelar_cotizacion"]) {
      check(`${name}: id ajeno → no encontrado`, ["NotFoundError", "DomainError"].includes(await errorName(() => call(a.staff, name, { cotizacionId: quoteInB.id }))));
    }
    check("la ajena sigue en borrador", (await prisma.quote.findUnique({ where: { id: quoteInB.id } }))?.status === "DRAFT");
    for (const [name, status] of transitions) {
      paths.length = 0;
      const res = meta(await call(a.staff, name, { cotizacionId: quoteId }));
      check(`${name}: estado ${status}`, (await prisma.quote.findUnique({ where: { id: quoteId } }))?.status === status && res.id === quoteId);
      check(`${name}: auditoría y rutas`, (await auditOf(name)).some((l) => l.entityId === quoteId && meta(l.metadata).via === "claude") && paths.some(([x]) => x === `/crm/cotizaciones/${quoteId}`), paths);
    }
    // Aceptar: otra cotización en borrador.
    const q2 = meta(await call(a.staff, "crear_cotizacion", { clientId: a.client.id, items }));
    paths.length = 0;
    await call(a.staff, "marcar_cotizacion_aceptada", { cotizacionId: String(q2.id) });
    check("marcar_cotizacion_aceptada: estado ACCEPTED", (await prisma.quote.findUnique({ where: { id: String(q2.id) } }))?.status === "ACCEPTED");
    check("marcar_cotizacion_aceptada: auditoría y rutas", (await auditOf("marcar_cotizacion_aceptada")).some((l) => l.entityId === String(q2.id)) && paths.some(([x]) => x === `/crm/cotizaciones/${q2.id}`));

    console.log("\n[mcp-write-quotes] cancelar_cotizacion\n");
    check("VIEWER → ForbiddenError", (await errorName(() => call(a.viewer, "cancelar_cotizacion", { cotizacionId: String(q2.id) }))) === "ForbiddenError");
    paths.length = 0;
    await call(a.staff, "cancelar_cotizacion", { cotizacionId: String(q2.id) });
    const cancelled = await prisma.quote.findUnique({ where: { id: String(q2.id) } });
    check("la cotización sigue existiendo y queda CANCELLED (cancelación lógica)", cancelled?.status === "CANCELLED", cancelled?.status);
    check("auditoría mcp.tool.cancelar_cotizacion", (await auditOf("cancelar_cotizacion")).some((l) => l.entityId === String(q2.id) && meta(l.metadata).via === "claude"));
    check("refresca las rutas", paths.some(([x]) => x === "/crm/cotizaciones") && paths.some(([x]) => x === `/crm/cotizaciones/${q2.id}`), paths);
    check("no hay enlaces de pago ni Stripe en la respuesta", !JSON.stringify(created).toLowerCase().includes("stripe"));
  } finally {
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
    console.log(failed === 0 ? "\nTodo en verde." : `\n${failed} comprobaciones fallaron.`);
    process.exit(failed === 0 ? 0 : 1);
  });
