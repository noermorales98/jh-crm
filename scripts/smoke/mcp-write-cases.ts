/**
 * Herramientas de escritura del conector MCP para casos de crédito y casos de servicio,
 * contra una base real y desechable: permiso, escritura, auditoría, refresco, validación
 * y aislamiento entre organizaciones. T018.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-cases.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, errorName, meta, seedMcpOrg } from "./_lib/mcp-seed";

assertDisposableDb();
process.env.FEATURE_MCP_CONNECTOR = "true";

const prisma = new PrismaClient();
const MARK = `mcpcases${Date.now()}`;
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
  const caseService = await import("../../src/server/cases");

  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  try {
    const tools = allTools();
    const paths: string[] = [];
    const opts = { tools, revalidate: (p: string) => paths.push(p) };
    const call = (ctx: typeof a.staff, name: string, args: unknown) => callTool(ctx, name, args, opts);
    const run = async <T = Record<string, unknown>>(ctx: typeof a.staff, name: string, args: unknown) =>
      (await call(ctx, name, args)) as T;
    const audits = (name: string) =>
      prisma.auditLog.findMany({ where: { organizationId: a.org.id, action: `mcp.tool.${name}` } });

    // Un caso ajeno (otra organización) para los chequeos de aislamiento.
    const foreignCase = await caseService.createCreditCase(
      { userId: b.owner.userId, organizationId: b.org.id, role: "OWNER" },
      { clientId: b.client.id },
    );
    const foreignStatusBefore = await prisma.serviceCase.findUnique({ where: { id: foreignCase.serviceCaseId } });

    // ===== crear_caso =====
    console.log("crear_caso");
    paths.length = 0;
    check("VIEWER no puede crear un caso",
      (await errorName(() => call(a.viewer, "crear_caso", { clientId: a.client.id }))) === "ForbiddenError");
    check("VIEWER no escribió nada", (await prisma.creditCase.count({ where: { organizationId: a.org.id } })) === 0);
    check("entrada inválida (summary demasiado largo) → ZodError",
      (await errorName(() => call(a.staff, "crear_caso", { clientId: a.client.id, summary: "x".repeat(5001) }))) === "ZodError");
    check("sin clientId → ZodError", (await errorName(() => call(a.staff, "crear_caso", {}))) === "ZodError");
    check("cliente de otra organización → NotFoundError",
      (await errorName(() => call(a.staff, "crear_caso", { clientId: b.client.id }))) === "NotFoundError");
    check("nada escrito por el rechazo", (await prisma.creditCase.count({ where: { organizationId: a.org.id } })) === 0);

    const created = await run<{ id: string; caseCode: string; serviceCaseId: string; href: string }>(a.staff, "crear_caso", {
      clientId: a.client.id,
      summary: "Caso desde Claude",
      nextActionAt: "2030-03-15",
    });
    const cc = await prisma.creditCase.findUnique({ where: { id: created.id } });
    const sc = await prisma.serviceCase.findUnique({ where: { id: created.serviceCaseId } });
    check("crea el CreditCase", cc?.summary === "Caso desde Claude" && cc?.organizationId === a.org.id, cc);
    check("crea el ServiceCase con etapa inicial", sc?.stageId === a.stage.id && sc?.status === "OPEN", sc);
    check("próxima acción al mediodía de la zona de la organización (15-mar-2030)",
      !!sc?.nextActionAt && /^2030-03-1[56]T/.test(sc.nextActionAt.toISOString()),
      sc?.nextActionAt);
    check("devuelve href de la ficha del cliente", created.href === `/crm/clientes/${a.client.id}/servicios/${created.id}`, created.href);
    const aud = (await audits("crear_caso"))[0];
    check("auditoría crear_caso (entidad y via claude)",
      !!aud && aud.entityId === created.id && meta(aud.metadata).via === "claude", aud);
    check("refresca las rutas del caso",
      paths.includes("/crm/clientes/[clientId]") && paths.includes("/crm/dashboard") &&
        paths.includes(`/crm/clientes/${a.client.id}/casos`), paths);
    const caseId = created.id;
    const serviceCaseId = created.serviceCaseId;

    // ===== editar_caso =====
    console.log("editar_caso");
    paths.length = 0;
    check("VIEWER no puede editar",
      (await errorName(() => call(a.viewer, "editar_caso", { caseId, summary: "no" }))) === "ForbiddenError");
    check("entrada inválida → ZodError",
      (await errorName(() => call(a.staff, "editar_caso", { caseId: "", summary: "x" }))) === "ZodError");
    check("caso ajeno → NotFoundError",
      (await errorName(() => call(a.staff, "editar_caso", { caseId: foreignCase.id, summary: "hack" }))) === "NotFoundError");
    check("caso ajeno intacto", (await prisma.creditCase.findUnique({ where: { id: foreignCase.id } }))?.summary !== "hack");
    await run(a.staff, "editar_caso", { caseId, summary: "Resumen editado", assignedToId: a.staff.userId });
    const edited = await prisma.creditCase.findUnique({ where: { id: caseId } });
    check("edita resumen y responsable", edited?.summary === "Resumen editado" && edited?.assignedToId === a.staff.userId, edited);
    const audE = (await audits("editar_caso"))[0];
    check("auditoría editar_caso", !!audE && audE.entityId === caseId && meta(audE.metadata).via === "claude", audE);
    check("refresca la ficha del cliente", paths.includes(`/crm/clientes/${a.client.id}`), paths);

    // ===== editar_importes_caso =====
    console.log("editar_importes_caso");
    paths.length = 0;
    check("VIEWER no puede editar importes",
      (await errorName(() => call(a.viewer, "editar_importes_caso", { caseId, quotedAmount: "10.00" }))) === "ForbiddenError");
    check("monto inválido → ZodError",
      (await errorName(() => call(a.staff, "editar_importes_caso", { caseId, quotedAmount: "10.999" }))) === "ZodError");
    check("caso ajeno → NotFoundError",
      (await errorName(() => call(a.staff, "editar_importes_caso", { caseId: foreignCase.id, quotedAmount: "1.00" }))) === "NotFoundError");
    await run(a.staff, "editar_importes_caso", { caseId, quotedAmount: "1500.50", agreedAmount: "1200" });
    const amounts = await prisma.serviceCase.findUnique({ where: { id: serviceCaseId } });
    check("guarda cotizado y acordado", amounts?.quotedAmount?.toString() === "1500.5" && amounts?.agreedAmount?.toString() === "1200", amounts);
    const audA = (await audits("editar_importes_caso"))[0];
    check("auditoría editar_importes_caso", !!audA && audA.entityId === caseId && meta(audA.metadata).via === "claude", audA);
    check("refresca la ficha del cliente", paths.includes(`/crm/clientes/${a.client.id}`), paths);
    await run(a.staff, "editar_importes_caso", { caseId, quotedAmount: null });
    check("nulo borra el monto",
      (await prisma.serviceCase.findUnique({ where: { id: serviceCaseId } }))?.quotedAmount === null);

    // ===== fijar_proxima_accion_caso =====
    console.log("fijar_proxima_accion_caso");
    paths.length = 0;
    check("VIEWER no puede fijar la próxima acción",
      (await errorName(() => call(a.viewer, "fijar_proxima_accion_caso", { caseId, nextActionAt: "2031-01-10" }))) === "ForbiddenError");
    check("fecha inválida → ZodError",
      (await errorName(() => call(a.staff, "fijar_proxima_accion_caso", { caseId, nextActionAt: "no-es-fecha" }))) === "ZodError");
    check("caso ajeno → NotFoundError",
      (await errorName(() => call(a.staff, "fijar_proxima_accion_caso", { caseId: foreignCase.id, nextActionAt: "2031-01-10" }))) === "NotFoundError");
    await run(a.staff, "fijar_proxima_accion_caso", { caseId, nextActionAt: "2031-01-10" });
    const na = await prisma.serviceCase.findUnique({ where: { id: serviceCaseId } });
    check("guarda la próxima acción (10-ene-2031)", !!na?.nextActionAt && /^2031-01-1[01]T/.test(na.nextActionAt.toISOString()), na?.nextActionAt);
    const audN = (await audits("fijar_proxima_accion_caso"))[0];
    check("auditoría fijar_proxima_accion_caso", !!audN && audN.entityId === caseId && meta(audN.metadata).via === "claude", audN);
    check("refresca la ficha del cliente", paths.includes(`/crm/clientes/${a.client.id}`), paths);
    await run(a.staff, "fijar_proxima_accion_caso", { caseId, nextActionAt: null });
    check("nulo borra la próxima acción",
      (await prisma.serviceCase.findUnique({ where: { id: serviceCaseId } }))?.nextActionAt === null);

    // ===== mover_caso_etapa =====
    console.log("mover_caso_etapa");
    paths.length = 0;
    check("VIEWER no puede mover de etapa",
      (await errorName(() => call(a.viewer, "mover_caso_etapa", { caseId, stageId: a.stage2.id }))) === "ForbiddenError");
    check("sin stageId → ZodError", (await errorName(() => call(a.staff, "mover_caso_etapa", { caseId }))) === "ZodError");
    check("caso ajeno → NotFoundError",
      (await errorName(() => call(a.staff, "mover_caso_etapa", { caseId: foreignCase.id, stageId: a.stage2.id }))) === "NotFoundError");
    check("etapa de otra organización → error y el caso no se mueve",
      (await errorName(() => call(a.staff, "mover_caso_etapa", { caseId, stageId: b.stage2.id }))) !== "ok" &&
        (await prisma.serviceCase.findUnique({ where: { id: serviceCaseId } }))?.stageId === a.stage.id);
    const moved = await run<{ id: string; suggestedTaskId: string | null }>(a.staff, "mover_caso_etapa", { caseId, stageId: a.stage2.id });
    check("mueve el ServiceCase y el CreditCase",
      (await prisma.serviceCase.findUnique({ where: { id: serviceCaseId } }))?.stageId === a.stage2.id &&
        (await prisma.creditCase.findUnique({ where: { id: caseId } }))?.stageId === a.stage2.id);
    check("crea la tarea sugerida", !!moved.suggestedTaskId &&
      !!(await prisma.task.findUnique({ where: { id: moved.suggestedTaskId } })), moved);
    const audM = (await audits("mover_caso_etapa"))[0];
    check("auditoría mover_caso_etapa", !!audM && audM.entityId === caseId && meta(audM.metadata).via === "claude", audM);
    check("refresca tareas y la tarea sugerida",
      paths.includes("/crm/tareas") && paths.includes(`/crm/tareas/${moved.suggestedTaskId}`) &&
        paths.includes(`/crm/clientes/${a.client.id}`), paths);

    // ===== pausar / reabrir / completar =====
    console.log("pausar_caso, reabrir_caso, completar_caso");
    for (const name of ["pausar_caso", "reabrir_caso", "completar_caso"]) {
      check(`VIEWER no puede ${name}`, (await errorName(() => call(a.viewer, name, { caseId }))) === "ForbiddenError");
      check(`${name}: sin caseId → ZodError`, (await errorName(() => call(a.staff, name, {}))) === "ZodError");
      check(`${name}: caso ajeno → NotFoundError`,
        (await errorName(() => call(a.staff, name, { caseId: foreignCase.id }))) === "NotFoundError");
    }
    paths.length = 0;
    await run(a.staff, "pausar_caso", { caseId });
    check("pausa el caso",
      (await prisma.creditCase.findUnique({ where: { id: caseId } }))?.state === "PAUSED" &&
        (await prisma.serviceCase.findUnique({ where: { id: serviceCaseId } }))?.status === "ON_HOLD");
    check("pausar_caso refresca la ficha", paths.includes(`/crm/clientes/${a.client.id}`), paths);
    await run(a.staff, "reabrir_caso", { caseId });
    check("reabre el caso", (await prisma.creditCase.findUnique({ where: { id: caseId } }))?.state === "OPEN");
    await run(a.staff, "completar_caso", { caseId });
    const done = await prisma.creditCase.findUnique({ where: { id: caseId } });
    check("completa el caso (sigue existiendo, con cierre)", done?.state === "COMPLETED" && !!done.closedAt, done);
    check("un caso cerrado no vuelve a pausarse (regla del servicio)",
      (await errorName(() => call(a.staff, "pausar_caso", { caseId }))) === "DomainError");
    await run(a.staff, "reabrir_caso", { caseId });
    for (const name of ["pausar_caso", "reabrir_caso", "completar_caso"]) {
      check(`auditoría ${name}`, (await audits(name)).some((x) => x.entityId === caseId && meta(x.metadata).via === "claude"));
    }

    // ===== crear_caso_servicio =====
    console.log("crear_caso_servicio");
    paths.length = 0;
    check("VIEWER no puede crear un caso de servicio",
      (await errorName(() => call(a.viewer, "crear_caso_servicio", { clientId: a.client.id, serviceCode: "HOME_BUYER" }))) === "ForbiddenError");
    check("sin serviceCode → ZodError",
      (await errorName(() => call(a.staff, "crear_caso_servicio", { clientId: a.client.id }))) === "ZodError");
    check("código de servicio inexistente → DomainError",
      (await errorName(() => call(a.staff, "crear_caso_servicio", { clientId: a.client.id, serviceCode: "NOPE" }))) === "DomainError");
    check("cliente de otra organización → NotFoundError",
      (await errorName(() => call(a.staff, "crear_caso_servicio", { clientId: b.client.id, serviceCode: "HOME_BUYER" }))) === "NotFoundError");
    const svc = await run<{ serviceCaseId: string; caseId: string | null; caseNumber: string; href: string }>(
      a.staff, "crear_caso_servicio", { clientId: a.client.id, serviceCode: "HOME_BUYER", summary: "Compra de casa", nextActionAt: "2030-06-01" });
    const hb = await prisma.serviceCase.findUnique({ where: { id: svc.serviceCaseId }, include: { service: true } });
    check("crea el expediente HOME_BUYER sin CreditCase", hb?.service.code === "HOME_BUYER" && svc.caseId === null && hb.organizationId === a.org.id, hb);
    check("href de la ficha genérica", svc.href === `/crm/expedientes/${svc.serviceCaseId}`, svc.href);
    check("existe la extensión HOME_BUYER",
      (await prisma.homeBuyerCase.count({ where: { serviceCaseId: svc.serviceCaseId } })) === 1);
    const audC = (await audits("crear_caso_servicio"))[0];
    check("auditoría crear_caso_servicio", !!audC && audC.entityId === svc.serviceCaseId && meta(audC.metadata).via === "claude", audC);
    check("refresca expediente y ficha del cliente",
      paths.includes(`/crm/expedientes/${svc.serviceCaseId}`) && paths.includes(`/crm/clientes/${a.client.id}/servicios`), paths);

    // ===== mover_caso_servicio_etapa =====
    console.log("mover_caso_servicio_etapa");
    const hbStages = await prisma.workflowStage.findMany({ where: { serviceId: hb!.serviceId }, orderBy: { order: "asc" } });
    paths.length = 0;
    check("VIEWER no puede mover",
      (await errorName(() => call(a.viewer, "mover_caso_servicio_etapa", { serviceCaseId: svc.serviceCaseId, stageId: hbStages[1].id }))) === "ForbiddenError");
    check("sin stageId → ZodError",
      (await errorName(() => call(a.staff, "mover_caso_servicio_etapa", { serviceCaseId: svc.serviceCaseId }))) === "ZodError");
    check("expediente ajeno → NotFoundError",
      (await errorName(() => call(a.staff, "mover_caso_servicio_etapa", { serviceCaseId: foreignCase.serviceCaseId, stageId: a.stage2.id }))) === "NotFoundError");
    await run(a.staff, "mover_caso_servicio_etapa", { serviceCaseId: svc.serviceCaseId, stageId: hbStages[1].id });
    check("mueve la etapa del expediente",
      (await prisma.serviceCase.findUnique({ where: { id: svc.serviceCaseId } }))?.stageId === hbStages[1].id);
    const audS = (await audits("mover_caso_servicio_etapa"))[0];
    check("auditoría mover_caso_servicio_etapa", !!audS && audS.entityId === svc.serviceCaseId && meta(audS.metadata).via === "claude", audS);
    check("refresca expediente y ficha del cliente",
      paths.includes(`/crm/expedientes/${svc.serviceCaseId}`) && paths.includes(`/crm/clientes/${a.client.id}`), paths);

    // ===== fijar_proxima_accion_caso_servicio =====
    console.log("fijar_proxima_accion_caso_servicio");
    paths.length = 0;
    check("VIEWER no puede fijar",
      (await errorName(() => call(a.viewer, "fijar_proxima_accion_caso_servicio", { serviceCaseId: svc.serviceCaseId, nextActionAt: "2031-02-02" }))) === "ForbiddenError");
    check("fecha inválida → ZodError",
      (await errorName(() => call(a.staff, "fijar_proxima_accion_caso_servicio", { serviceCaseId: svc.serviceCaseId, nextActionAt: "mañana" }))) === "ZodError");
    check("expediente ajeno → NotFoundError",
      (await errorName(() => call(a.staff, "fijar_proxima_accion_caso_servicio", { serviceCaseId: foreignCase.serviceCaseId, nextActionAt: "2031-02-02" }))) === "NotFoundError");
    await run(a.staff, "fijar_proxima_accion_caso_servicio", { serviceCaseId: svc.serviceCaseId, nextActionAt: "2031-02-02" });
    const sna = await prisma.serviceCase.findUnique({ where: { id: svc.serviceCaseId } });
    check("guarda la próxima acción", !!sna?.nextActionAt && /^2031-02-0[23]T/.test(sna.nextActionAt.toISOString()), sna?.nextActionAt);
    const audP = (await audits("fijar_proxima_accion_caso_servicio"))[0];
    check("auditoría fijar_proxima_accion_caso_servicio", !!audP && audP.entityId === svc.serviceCaseId && meta(audP.metadata).via === "claude", audP);
    check("refresca el expediente", paths.includes(`/crm/expedientes/${svc.serviceCaseId}`), paths);

    // ===== editar_importes_caso_servicio =====
    console.log("editar_importes_caso_servicio");
    paths.length = 0;
    check("VIEWER no puede editar importes",
      (await errorName(() => call(a.viewer, "editar_importes_caso_servicio", { serviceCaseId: svc.serviceCaseId, agreedAmount: "5.00" }))) === "ForbiddenError");
    check("monto inválido → ZodError",
      (await errorName(() => call(a.staff, "editar_importes_caso_servicio", { serviceCaseId: svc.serviceCaseId, agreedAmount: "abc" }))) === "ZodError");
    check("expediente ajeno → NotFoundError",
      (await errorName(() => call(a.staff, "editar_importes_caso_servicio", { serviceCaseId: foreignCase.serviceCaseId, agreedAmount: "5.00" }))) === "NotFoundError");
    await run(a.staff, "editar_importes_caso_servicio", { serviceCaseId: svc.serviceCaseId, quotedAmount: "300.25", agreedAmount: "250" });
    const sam = await prisma.serviceCase.findUnique({ where: { id: svc.serviceCaseId } });
    check("guarda los importes", sam?.quotedAmount?.toString() === "300.25" && sam?.agreedAmount?.toString() === "250", sam);
    const audI = (await audits("editar_importes_caso_servicio"))[0];
    check("auditoría editar_importes_caso_servicio", !!audI && audI.entityId === svc.serviceCaseId && meta(audI.metadata).via === "claude", audI);
    check("refresca el expediente", paths.includes(`/crm/expedientes/${svc.serviceCaseId}`), paths);

    // ===== cambiar_estado_caso_servicio =====
    console.log("cambiar_estado_caso_servicio");
    paths.length = 0;
    check("VIEWER no puede cambiar el estado",
      (await errorName(() => call(a.viewer, "cambiar_estado_caso_servicio", { serviceCaseId: svc.serviceCaseId, status: "ON_HOLD" }))) === "ForbiddenError");
    check("estado inválido → ZodError",
      (await errorName(() => call(a.staff, "cambiar_estado_caso_servicio", { serviceCaseId: svc.serviceCaseId, status: "BORRADO" }))) === "ZodError");
    check("expediente ajeno → NotFoundError",
      (await errorName(() => call(a.staff, "cambiar_estado_caso_servicio", { serviceCaseId: foreignCase.serviceCaseId, status: "CANCELED" }))) === "NotFoundError");
    await run(a.staff, "cambiar_estado_caso_servicio", { serviceCaseId: svc.serviceCaseId, status: "ON_HOLD" });
    check("pone el expediente en pausa",
      (await prisma.serviceCase.findUnique({ where: { id: svc.serviceCaseId } }))?.status === "ON_HOLD");
    await run(a.staff, "cambiar_estado_caso_servicio", { serviceCaseId: svc.serviceCaseId, status: "CANCELED" });
    const canceled = await prisma.serviceCase.findUnique({ where: { id: svc.serviceCaseId } });
    check("cancelar es lógico: el expediente sigue existiendo", canceled?.status === "CANCELED" && !!canceled.completedAt, canceled);
    const audT = await audits("cambiar_estado_caso_servicio");
    check("auditoría cambiar_estado_caso_servicio", audT.length === 2 && audT.every((x) => x.entityId === svc.serviceCaseId && meta(x.metadata).via === "claude"), audT);
    check("refresca el expediente", paths.includes(`/crm/expedientes/${svc.serviceCaseId}`), paths);

    // ===== aislamiento global =====
    const foreignAfter = await prisma.serviceCase.findUnique({ where: { id: foreignCase.serviceCaseId } });
    check("el caso de la otra organización no cambió nunca",
      foreignAfter?.status === foreignStatusBefore?.status && foreignAfter?.stageId === foreignStatusBefore?.stageId &&
        foreignAfter?.quotedAmount === null && foreignAfter?.nextActionAt?.getTime() === foreignStatusBefore?.nextActionAt?.getTime());
  } finally {
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
  if (failed > 0) {
    console.error(`\n${failed} check(s) fallaron.`);
    process.exit(1);
  }
  console.log("\nmcp-write-cases: todo OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
