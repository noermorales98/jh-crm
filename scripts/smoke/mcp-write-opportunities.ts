/**
 * Herramientas de escritura de oportunidades del conector MCP contra una base real y
 * desechable: crear_lead, editar_lead, crear_oportunidad, mover_oportunidad_etapa,
 * marcar_ganada, marcar_perdida. Permiso, escritura, auditoría, refresco, entrada
 * inválida, otra organización y borrado lógico.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-opportunities.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, errorName, meta, seedMcpOrg } from "./_lib/mcp-seed";

assertDisposableDb();
const prisma = new PrismaClient();
const MARK = `mcpwopp${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function main() {
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const { allTools } = await import("../../src/server/mcp/tools");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  try {
    const revalidated: string[] = [];
    const opts = {
      tools: allTools(),
      revalidate: (path: string, type?: string) => {
        revalidated.push(type ? `${path}|${type}` : path);
      },
    };
    const call = (ctx: typeof a.staff, name: string, args: unknown) => callTool(ctx, name, args, opts);
    const audit = (orgId: string, name: string) =>
      prisma.auditLog.findFirst({ where: { organizationId: orgId, action: `mcp.tool.${name}` }, orderBy: { createdAt: "desc" } });
    const auditOk = async (name: string, entityType: string, entityId: string, ctx: typeof a.staff) => {
      const row = await audit(a.org.id, name);
      check(
        `${name}: auditoría ${entityType}`,
        !!row && row.entityType === entityType && row.entityId === entityId && meta(row.metadata).via === "claude" &&
          meta(row.metadata).connectionId === ctx.connectionId,
        row,
      );
    };

    // ---------- crear_lead ----------
    console.log("\n[crear_lead]");
    const oppsBefore = await prisma.opportunity.count({ where: { organizationId: a.org.id } });
    check("VIEWER → ForbiddenError", (await errorName(() => call(a.viewer, "crear_lead", { firstName: "Luis" }))) === "ForbiddenError");
    check("VIEWER no escribió", (await prisma.opportunity.count({ where: { organizationId: a.org.id } })) === oppsBefore);
    check("entrada inválida → ZodError", (await errorName(() => call(a.staff, "crear_lead", { firstName: "" }))) === "ZodError");
    revalidated.length = 0;
    const lead = (await call(a.staff, "crear_lead", {
      firstName: "Luis",
      lastName: "Lead",
      email: `${MARK}-lead@example.test`,
      source: "Claude",
      nextFollowUpAt: "2030-01-15",
    })) as { opportunityId: string; clientId: string; href: string };
    const leadOpp = await prisma.opportunity.findUnique({ where: { id: lead.opportunityId }, include: { client: true } });
    check("crea cliente y oportunidad",
      leadOpp?.organizationId === a.org.id && leadOpp?.client.firstName === "Luis" && leadOpp?.stage === "NEW_LEAD" &&
        leadOpp?.nextFollowUpAt !== null, leadOpp);
    check("devuelve href", typeof lead.href === "string" && lead.href.includes("/crm/"), lead);
    await auditOk("crear_lead", "Opportunity", lead.opportunityId, a.staff);
    check("refresca como la action",
      ["/crm/oportunidades|layout", "/crm/oportunidades|page", "/crm/clientes", "/crm/dashboard", `/crm/clientes/${lead.clientId}`,
        `/crm/clientes/${lead.clientId}/casos`, `/crm/clientes/${lead.clientId}/servicios`].every((p) => revalidated.includes(p)),
      revalidated);

    // ---------- editar_lead ----------
    console.log("\n[editar_lead]");
    check("VIEWER → ForbiddenError",
      (await errorName(() => call(a.viewer, "editar_lead", { opportunityId: lead.opportunityId, firstName: "X" }))) === "ForbiddenError");
    check("entrada inválida → ZodError",
      (await errorName(() => call(a.staff, "editar_lead", { opportunityId: lead.opportunityId, email: "no-es-correo" }))) === "ZodError");
    // Edición parcial: lo que no se envía se conserva (antes se borraba).
    const leadClientId = (await prisma.opportunity.findUnique({ where: { id: lead.opportunityId } }))!.clientId;
    await prisma.client.update({ where: { id: leadClientId }, data: { email: "conservar@example.test", phone: "5551230000" } });
    await prisma.opportunity.update({
      where: { id: lead.opportunityId },
      data: { campaign: "Campaña X", nextFollowUpAt: new Date("2026-12-15T18:00:00Z"), estimatedValue: 900 },
    });
    const foreignOpp = await prisma.opportunity.create({ data: { organizationId: b.org.id, clientId: b.client.id } });
    check("id de otra organización → error de no encontrado",
      ["NotFoundError", "DomainError"].includes(await errorName(() => call(a.staff, "editar_lead", { opportunityId: foreignOpp.id, firstName: "Hack" }))));
    check("otra organización intacta", (await prisma.client.findUnique({ where: { id: b.client.id } }))?.firstName === "Ana");
    revalidated.length = 0;
    const edited = (await call(a.staff, "editar_lead", {
      opportunityId: lead.opportunityId,
      firstName: "Luisa",
      lastName: "Lead",
      source: "Claude 2",
    })) as { opportunityId: string; clientId: string };
    check("edita el cliente", (await prisma.client.findUnique({ where: { id: edited.clientId } }))?.firstName === "Luisa");
    const keptClient = await prisma.client.findUnique({ where: { id: edited.clientId } });
    const keptOpp = await prisma.opportunity.findUnique({ where: { id: lead.opportunityId } });
    check("edición parcial: conserva correo y teléfono no enviados",
      keptClient?.email === "conservar@example.test" && keptClient?.phone === "5551230000", keptClient);
    check("edición parcial: conserva campaña, valor y seguimiento no enviados",
      keptOpp?.campaign === "Campaña X" && Number(keptOpp?.estimatedValue) === 900 &&
        keptOpp?.nextFollowUpAt?.toISOString() === "2026-12-15T18:00:00.000Z", keptOpp);
    await auditOk("editar_lead", "Opportunity", lead.opportunityId, a.staff);
    check("refresca como la action", revalidated.includes("/crm/dashboard") && revalidated.includes(`/crm/clientes/${edited.clientId}`), revalidated);

    // ---------- crear_oportunidad ----------
    console.log("\n[crear_oportunidad]");
    check("VIEWER → ForbiddenError",
      (await errorName(() => call(a.viewer, "crear_oportunidad", { clientId: a.client.id }))) === "ForbiddenError");
    check("entrada inválida → ZodError",
      (await errorName(() => call(a.staff, "crear_oportunidad", { clientId: a.client.id, stage: "NOPE" }))) === "ZodError");
    check("crear ya ganada → ZodError (hay que usar marcar_ganada)",
      (await errorName(() => call(a.staff, "crear_oportunidad", { clientId: a.client.id, stage: "WON" }))) === "ZodError");
    check("crear ya perdida → ZodError",
      (await errorName(() => call(a.staff, "crear_oportunidad", { clientId: a.client.id, stage: "LOST" }))) === "ZodError");
    const foreignCount = await prisma.opportunity.count({ where: { organizationId: b.org.id } });
    check("cliente de otra organización → error de no encontrado",
      ["NotFoundError", "DomainError"].includes(await errorName(() => call(a.staff, "crear_oportunidad", { clientId: b.client.id }))));
    check("nada escrito en la otra organización", (await prisma.opportunity.count({ where: { organizationId: b.org.id } })) === foreignCount);
    revalidated.length = 0;
    const opp = (await call(a.staff, "crear_oportunidad", {
      clientId: a.client.id,
      stage: "CONTACTED",
      estimatedValue: 1500,
      source: "Referido",
    })) as { id: string; href: string };
    const oppRow = await prisma.opportunity.findUnique({ where: { id: opp.id } });
    check("crea la oportunidad", oppRow?.clientId === a.client.id && oppRow?.stage === "CONTACTED" && oppRow?.source === "Referido", oppRow);
    await auditOk("crear_oportunidad", "Opportunity", opp.id, a.staff);
    check("refresca como la action",
      revalidated.includes("/crm/oportunidades|layout") && revalidated.includes(`/crm/clientes/${a.client.id}/servicios`), revalidated);

    // ---------- mover_oportunidad_etapa ----------
    console.log("\n[mover_oportunidad_etapa]");
    check("VIEWER → ForbiddenError",
      (await errorName(() => call(a.viewer, "mover_oportunidad_etapa", { opportunityId: opp.id, stage: "PROPOSAL" }))) === "ForbiddenError");
    check("entrada inválida → ZodError",
      (await errorName(() => call(a.staff, "mover_oportunidad_etapa", { opportunityId: opp.id, stage: "NOPE" }))) === "ZodError");
    check("id de otra organización → error de no encontrado",
      ["NotFoundError", "DomainError"].includes(await errorName(() => call(a.staff, "mover_oportunidad_etapa", { opportunityId: foreignOpp.id, stage: "PROPOSAL" }))));
    check("otra organización intacta", (await prisma.opportunity.findUnique({ where: { id: foreignOpp.id } }))?.stage === "NEW_LEAD");
    revalidated.length = 0;
    await call(a.staff, "mover_oportunidad_etapa", { opportunityId: opp.id, stage: "PROPOSAL" });
    check("mueve la etapa", (await prisma.opportunity.findUnique({ where: { id: opp.id } }))?.stage === "PROPOSAL");
    await auditOk("mover_oportunidad_etapa", "Opportunity", opp.id, a.staff);
    check("refresca como la action", revalidated.includes("/crm/oportunidades|page") && revalidated.includes(`/crm/clientes/${a.client.id}`), revalidated);

    // ---------- marcar_perdida ----------
    console.log("\n[marcar_perdida]");
    check("VIEWER → ForbiddenError",
      (await errorName(() => call(a.viewer, "marcar_perdida", { opportunityId: opp.id, lostReason: "x" }))) === "ForbiddenError");
    check("entrada inválida → ZodError",
      (await errorName(() => call(a.staff, "marcar_perdida", { opportunityId: opp.id, lostReason: "" }))) === "ZodError");
    check("id de otra organización → error de no encontrado",
      ["NotFoundError", "DomainError"].includes(await errorName(() => call(a.staff, "marcar_perdida", { opportunityId: foreignOpp.id, lostReason: "x" }))));
    check("otra organización intacta", (await prisma.opportunity.findUnique({ where: { id: foreignOpp.id } }))?.stage === "NEW_LEAD");
    revalidated.length = 0;
    await call(a.staff, "marcar_perdida", { opportunityId: opp.id, lostReason: "Sin presupuesto" });
    const lost = await prisma.opportunity.findUnique({ where: { id: opp.id } });
    check("queda perdida y sigue existiendo (borrado lógico)", lost?.stage === "LOST" && lost?.lostReason === "Sin presupuesto", lost);
    await auditOk("marcar_perdida", "Opportunity", opp.id, a.staff);
    check("refresca como la action", revalidated.includes("/crm/oportunidades|layout"), revalidated);

    // ---------- marcar_ganada ----------
    console.log("\n[marcar_ganada]");
    const winnable = (await call(a.staff, "crear_oportunidad", { clientId: a.client.id })) as { id: string };
    check("VIEWER → ForbiddenError",
      (await errorName(() => call(a.viewer, "marcar_ganada", { opportunityId: winnable.id }))) === "ForbiddenError");
    check("entrada inválida → ZodError",
      (await errorName(() => call(a.staff, "marcar_ganada", { opportunityId: winnable.id, serviceCode: "NOPE" }))) === "ZodError");
    check("id de otra organización → error de no encontrado",
      ["NotFoundError", "DomainError"].includes(await errorName(() => call(a.staff, "marcar_ganada", { opportunityId: foreignOpp.id }))));
    check("otra organización intacta", (await prisma.opportunity.findUnique({ where: { id: foreignOpp.id } }))?.stage === "NEW_LEAD");
    check("no estaba ganada", (await prisma.opportunity.findUnique({ where: { id: winnable.id } }))?.stage !== "WON");
    revalidated.length = 0;
    const won = (await call(a.staff, "marcar_ganada", { opportunityId: winnable.id, serviceCode: "CREDIT_REPAIR" })) as {
      id: string;
      serviceCaseId: string | null;
      caseId: string | null;
    };
    const wonRow = await prisma.opportunity.findUnique({ where: { id: winnable.id } });
    check("queda ganada", wonRow?.stage === "WON", wonRow);
    check("devuelve el caso creado", won.serviceCaseId === wonRow?.wonServiceCaseId && won.serviceCaseId !== null, won);
    await auditOk("marcar_ganada", "Opportunity", winnable.id, a.staff);
    check("refresca como la action (incluye el expediente)",
      revalidated.includes("/crm/oportunidades|layout") && !!won.serviceCaseId &&
        revalidated.includes(`/crm/expedientes/${won.serviceCaseId}`) &&
        revalidated.includes(`/crm/clientes/${a.client.id}/servicios`), revalidated);
  } finally {
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    if (failed > 0) {
      console.error(`\n✗ ${failed} comprobación(es) fallaron\n`);
      process.exit(1);
    }
    console.log("\n✓ mcp-write-opportunities OK\n");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
