/**
 * Herramientas de escritura de notas del conector MCP (T020), contra la base local
 * desechable jh_gates: permisos, escritura real, auditoría, refresco, entrada inválida
 * y ids de otra organización.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-notes.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, errorName, meta, seedMcpOrg } from "./_lib/mcp-seed";

assertDisposableDb();
const prisma = new PrismaClient();
const MARK = `mcpnotes${Date.now()}`;
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
  const seedA = await seedMcpOrg(prisma, `${MARK}a`);
  const seedB = await seedMcpOrg(prisma, `${MARK}b`);
  try {
    const { org, staff, viewer, client, service, stage } = seedA;
    const serviceCase = await prisma.serviceCase.create({
      data: { organizationId: org.id, clientId: client.id, serviceId: service.id, caseNumber: `SC-${MARK}`.slice(0, 30), stageId: stage.id },
    });
    const creditCase = await prisma.creditCase.create({
      data: { organizationId: org.id, clientId: client.id, serviceCaseId: serviceCase.id, caseCode: `CC-${MARK}`.slice(0, 30), stageId: stage.id },
    });
    const opportunity = await prisma.opportunity.create({
      data: { organizationId: org.id, clientId: client.id, source: "smoke" } as never,
    });
    const foreignClient = seedB.client;
    const foreignServiceCase = await prisma.serviceCase.create({
      data: { organizationId: seedB.org.id, clientId: foreignClient.id, serviceId: seedB.service.id, caseNumber: `SF-${MARK}`.slice(0, 30), stageId: seedB.stage.id },
    });
    const foreignOpp = await prisma.opportunity.create({
      data: { organizationId: seedB.org.id, clientId: foreignClient.id, source: "smoke" } as never,
    });

    const revalidated: Array<[string, string | undefined]> = [];
    const opts = { tools: allTools(), revalidate: (p: string, t?: "layout" | "page") => revalidated.push([p, t]) };
    const notesOf = (clientId: string) => prisma.note.findMany({ where: { clientId } });
    const audit = (name: string) =>
      prisma.auditLog.findMany({ where: { organizationId: org.id, action: `mcp.tool.${name}` } });

    // --- agregar_nota_cliente ---
    console.log("\n[mcp-write-notes] agregar_nota_cliente\n");
    const T1 = "agregar_nota_cliente";
    check("VIEWER → ForbiddenError", (await errorName(() => callTool(viewer, T1, { clientId: client.id, body: "x" }, opts))) === "ForbiddenError");
    check("VIEWER no escribe nada", (await notesOf(client.id)).length === 0);
    revalidated.length = 0;
    const r1 = meta(await callTool(staff, T1, { clientId: client.id, body: "  Llamó el cliente  " }, opts));
    const n1 = await prisma.note.findUnique({ where: { id: String(r1.id) } });
    check("STAFF escribe la nota (recortada) en la BD", n1?.body === "Llamó el cliente" && n1.clientId === client.id && n1.authorUserId === staff.userId, n1);
    check("devuelve id y href de las notas del cliente", typeof r1.id === "string" && r1.href === `/crm/clientes/${client.id}/notas`, r1);
    const a1 = await audit(T1);
    check("auditoría mcp.tool.agregar_nota_cliente (Note, via claude)", a1.length === 1 && a1[0].entityType === "Note" && a1[0].entityId === r1.id && meta(a1[0].metadata).via === "claude", a1);
    const paths1 = revalidated.map(([p]) => p);
    check("refresca ficha, notas y actividad", [`/crm/clientes/${client.id}`, `/crm/clientes/${client.id}/notas`, `/crm/clientes/${client.id}/actividad`].every((p) => paths1.includes(p)), paths1);
    check("con oportunidad propia vale", (await errorName(() => callTool(staff, T1, { clientId: client.id, opportunityId: opportunity.id, body: "con oportunidad" }, opts))) === "ok");
    check("cuerpo vacío → ZodError", (await errorName(() => callTool(staff, T1, { clientId: client.id, body: "   " }, opts))) === "ZodError");
    check("id vacío → ZodError", (await errorName(() => callTool(staff, T1, { clientId: "", body: "x" }, opts))) === "ZodError");
    const before1 = (await prisma.note.count({ where: { organizationId: seedB.org.id } }));
    const e1 = await errorName(() => callTool(staff, T1, { clientId: foreignClient.id, body: "ajena" }, opts));
    check("cliente de otra organización → no encontrado", e1 === "NotFoundError" || e1 === "DomainError", e1);
    check("oportunidad de otra organización → no encontrada", ["NotFoundError", "DomainError"].includes(await errorName(() => callTool(staff, T1, { clientId: client.id, opportunityId: foreignOpp.id, body: "x" }, opts))));
    check("nada escrito en la otra organización", (await prisma.note.count({ where: { organizationId: seedB.org.id } })) === before1);

    // --- agregar_nota_caso ---
    console.log("\n[mcp-write-notes] agregar_nota_caso\n");
    const T2 = "agregar_nota_caso";
    const notesBefore = await prisma.note.count({ where: { organizationId: org.id } });
    check("VIEWER → ForbiddenError", (await errorName(() => callTool(viewer, T2, { serviceCaseId: serviceCase.id, body: "x" }, opts))) === "ForbiddenError");
    check("VIEWER no escribe nada", (await prisma.note.count({ where: { organizationId: org.id } })) === notesBefore);
    revalidated.length = 0;
    const r2 = meta(await callTool(staff, T2, { serviceCaseId: serviceCase.id, body: "Nota del expediente" }, opts));
    const n2 = await prisma.note.findUnique({ where: { id: String(r2.id) } });
    check("STAFF escribe la nota en el expediente", n2?.body === "Nota del expediente" && n2.serviceCaseId === serviceCase.id && n2.clientId === client.id, n2);
    check("devuelve id y href", typeof r2.id === "string" && typeof r2.href === "string" && String(r2.href).startsWith("/crm/"), r2);
    const a2 = await audit(T2);
    check("auditoría mcp.tool.agregar_nota_caso (Note, via claude)", a2.length === 1 && a2[0].entityType === "Note" && a2[0].entityId === r2.id && meta(a2[0].metadata).via === "claude", a2);
    const paths2 = revalidated.map(([p]) => p);
    check("refresca expediente, ficha, actividad y notas", [`/crm/expedientes/${serviceCase.id}`, `/crm/clientes/${client.id}`, `/crm/clientes/${client.id}/actividad`, `/crm/clientes/${client.id}/notas`].every((p) => paths2.includes(p)), paths2);
    revalidated.length = 0;
    const r2b = meta(await callTool(staff, T2, { caseId: creditCase.id, body: "Por caso de crédito" }, opts));
    const n2b = await prisma.note.findUnique({ where: { id: String(r2b.id) } });
    check("por caseId también escribe", n2b?.serviceCaseId === serviceCase.id, n2b);
    check("con caseId refresca el patrón de rutas del caso (layout)", revalidated.some(([, t]) => t === "layout"), revalidated);
    check("sin expediente → ZodError", (await errorName(() => callTool(staff, T2, { body: "x" }, opts))) === "ZodError");
    check("cuerpo vacío → ZodError", (await errorName(() => callTool(staff, T2, { serviceCaseId: serviceCase.id, body: "" }, opts))) === "ZodError");
    const beforeB = await prisma.note.count({ where: { organizationId: seedB.org.id } });
    check("expediente de otra organización → no encontrado", ["NotFoundError", "DomainError"].includes(await errorName(() => callTool(staff, T2, { serviceCaseId: foreignServiceCase.id, body: "x" }, opts))));
    check("nada escrito en la otra organización", (await prisma.note.count({ where: { organizationId: seedB.org.id } })) === beforeB);

    // --- agregar_mensaje_lead ---
    console.log("\n[mcp-write-notes] agregar_mensaje_lead\n");
    const T3 = "agregar_mensaje_lead";
    const countA = await prisma.note.count({ where: { organizationId: org.id } });
    check("VIEWER → ForbiddenError", (await errorName(() => callTool(viewer, T3, { clientId: client.id, body: "x" }, opts))) === "ForbiddenError");
    check("VIEWER no escribe nada", (await prisma.note.count({ where: { organizationId: org.id } })) === countA);
    revalidated.length = 0;
    const r3 = meta(await callTool(staff, T3, { clientId: client.id, opportunityId: opportunity.id, body: "Quiere cotización" }, opts));
    const n3 = await prisma.note.findUnique({ where: { id: String(r3.id) } });
    check("STAFF escribe el mensaje en la BD", n3?.body === "Quiere cotización" && n3.clientId === client.id, n3);
    check("devuelve id y href de oportunidades", typeof r3.id === "string" && typeof r3.href === "string" && String(r3.href).startsWith("/crm/oportunidades"), r3);
    const a3 = await audit(T3);
    check("auditoría mcp.tool.agregar_mensaje_lead (Note, via claude)", a3.length === 1 && a3[0].entityType === "Note" && a3[0].entityId === r3.id && meta(a3[0].metadata).via === "claude", a3);
    const paths3 = revalidated.map(([p, t]) => `${p}|${t ?? ""}`);
    check("refresca oportunidades (layout y page) y la ficha", ["/crm/oportunidades|layout", "/crm/oportunidades|page", `/crm/clientes/${client.id}|`, `/crm/clientes/${client.id}/actividad|`, `/crm/clientes/${client.id}/notas|`].every((p) => paths3.includes(p)), paths3);
    check("cuerpo demasiado largo → ZodError", (await errorName(() => callTool(staff, T3, { clientId: client.id, body: "a".repeat(5001) }, opts))) === "ZodError");
    const countB = await prisma.note.count({ where: { organizationId: seedB.org.id } });
    check("cliente de otra organización → no encontrado", ["NotFoundError", "DomainError"].includes(await errorName(() => callTool(staff, T3, { clientId: foreignClient.id, body: "x" }, opts))));
    check("nada escrito en la otra organización", (await prisma.note.count({ where: { organizationId: seedB.org.id } })) === countB);

    check("las notas no tienen herramienta de borrado", !allTools().some((t) => /nota|mensaje/.test(t.name) && t.kind === "destructive"));
  } finally {
    await seedA.cleanup();
    await seedB.cleanup();
  }
}

run()
  .catch((error) => {
    failed += 1;
    console.error(error);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failed === 0 ? "\n[mcp-write-notes] OK" : `\n[mcp-write-notes] FALLÓ (${failed})`);
    process.exit(failed === 0 ? 0 : 1);
  });
