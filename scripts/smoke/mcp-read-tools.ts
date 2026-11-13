/**
 * Herramientas de lectura del conector MCP contra una base real y desechable: cada
 * sección de la tanda 1 se lista y se ve por id; nada de otra organización; nada
 * sensible en las respuestas; un VIEWER lee. AC-3, AC-4, AC-5, AC-6.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-read-tools.ts
 */
import { PrismaClient, type Role } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^mysql:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\/jh_gates(\?|$)/.test(databaseUrl)) {
  throw new Error("mcp-read-tools solo corre contra la base local desechable jh_gates.");
}

const prisma = new PrismaClient();
const MARK = `mcpread${Date.now()}`;
const SSN = "123-45-6789";
const ACCOUNT = "4111222233334444";
const DOC_CATEGORY = "SSN_DOCUMENT";
const createdOrgs: string[] = [];
const createdUsers: string[] = [];
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function errorName(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (error) {
    return (error as Error).name ?? "Error";
  }
}

async function seedOrg(suffix: string) {
  const org = await prisma.organization.create({ data: { name: `TEST JH-CRM ${MARK} ${suffix}` } });
  createdOrgs.push(org.id);
  await prisma.organizationSettings.create({ data: { organizationId: org.id, mcpEnabled: true } });
  const owner = await prisma.user.create({
    data: { email: `${MARK}-${suffix}-owner@example.test`, passwordHash: "x", name: `Owner ${suffix}` },
  });
  createdUsers.push(owner.id);
  await prisma.organizationMember.create({ data: { userId: owner.id, organizationId: org.id, role: "OWNER" } });
  const service = await prisma.service.create({
    data: { organizationId: org.id, code: "CREDIT_REPAIR", name: "Reparación de crédito" },
  });
  const stage = await prisma.workflowStage.create({
    data: { organizationId: org.id, serviceId: service.id, key: "INICIO", name: "Inicio", order: 1 },
  });
  const client = await prisma.client.create({
    data: {
      organizationId: org.id,
      clientCode: `R-${suffix}-${MARK}`.slice(0, 20),
      firstName: `Ana${suffix}`,
      lastName: "Lectura",
      status: "ACTIVE",
    },
  });
  await prisma.clientSensitiveProfile.create({
    data: { clientId: client.id, ssnLast4: "6789" } as never,
  }).catch(() => undefined);
  await prisma.note.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      authorUserId: owner.id,
      body: `Nota con SSN ${SSN} y cuenta ${ACCOUNT}`,
    },
  });
  const serviceCase = await prisma.serviceCase.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      serviceId: service.id,
      caseNumber: `SC-${suffix}-${MARK}`.slice(0, 30),
      status: "OPEN",
      stageId: stage.id,
    } as never,
  });
  const creditCase = await prisma.creditCase.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      serviceCaseId: serviceCase.id,
      caseCode: `CC-${suffix}-${MARK}`.slice(0, 30),
      stageId: stage.id,
    },
  });
  const task = await prisma.task.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      title: `Llamar a Ana ${suffix}`,
      description: `SSN ${SSN}`,
      assignedToId: owner.id,
      type: "FOLLOW_UP",
    } as never,
  });
  const quote = await prisma.quote.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      folioNumber: 1,
      folio: `COT-${suffix}-${MARK}`.slice(0, 30),
      subtotal: 100,
      total: 100,
      notes: `cuenta ${ACCOUNT}`,
    } as never,
  });
  await prisma.document.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      category: DOC_CATEGORY,
      sensitivity: "HIGHLY_SENSITIVE",
      originalName: "tarjeta SSN de Ana.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      storageKey: `smoke/${MARK}/${suffix}/ssn.pdf`,
    } as never,
  });
  const opportunity = await prisma.opportunity.create({
    data: { organizationId: org.id, clientId: client.id, source: "smoke", estimatedValue: 500 } as never,
  });
  const ownerCtx = { userId: owner.id, organizationId: org.id, role: "OWNER" as Role, connectionId: `conn-${suffix}` };
  return { org, owner, ownerCtx, client, serviceCase, creditCase, task, quote, opportunity };
}

async function run() {
  const { allTools } = await import("../../src/server/mcp/tools");
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const tools = allTools();
  const opts = { tools };

  const a = await seedOrg("A");
  const b = await seedOrg("B");
  const viewer = await prisma.user.create({
    data: { email: `${MARK}-viewer@example.test`, passwordHash: "x", name: "Viewer" },
  });
  createdUsers.push(viewer.id);
  await prisma.organizationMember.create({ data: { userId: viewer.id, organizationId: a.org.id, role: "VIEWER" } });
  const vctx = { userId: viewer.id, organizationId: a.org.id, role: "VIEWER" as Role, connectionId: "conn-viewer" };

  const ids: Record<string, { a: string; b: string }> = {
    clientes: { a: a.client.id, b: b.client.id },
    casos: { a: a.creditCase.id, b: b.creditCase.id },
    casos_servicio: { a: a.serviceCase.id, b: b.serviceCase.id },
    tareas: { a: a.task.id, b: b.task.id },
    cotizaciones: { a: a.quote.id, b: b.quote.id },
    oportunidades: { a: a.opportunity.id, b: b.opportunity.id },
  };

  console.log("\n[mcp-read-tools] listar y ver cada sección (AC-5)\n");
  for (const [seccion, id] of Object.entries(ids)) {
    const list = await callTool(a.ownerCtx, "listar", { seccion }, opts).catch((e) => e);
    const listText = JSON.stringify(list);
    check(`listar ${seccion} → incluye el registro propio`, listText.includes(id.a), listText.slice(0, 300));
    check(`listar ${seccion} → no mezcla otra organización (AC-3)`, !listText.includes(id.b));
    const seen = await callTool(a.ownerCtx, "ver", { seccion, id: id.a }, opts).catch((e) => e);
    const seenText = JSON.stringify(seen);
    check(`ver ${seccion} → devuelve el registro`, !(seen instanceof Error) && seenText.includes(id.a), seenText.slice(0, 300));
    check(`ver ${seccion} con id de otra organización → NotFoundError (AC-3)`,
      (await errorName(() => callTool(a.ownerCtx, "ver", { seccion, id: id.b }, opts))) === "NotFoundError");
    check(`ver ${seccion} → incluye enlace al CRM`, seenText.includes("/crm/"), seenText.slice(0, 200));
    check(`ver ${seccion} → sin SSN ni cuenta completa (AC-6)`,
      !seenText.includes(SSN) && !seenText.includes(ACCOUNT), seenText);
    check(`listar ${seccion} → sin SSN ni cuenta completa (AC-6)`,
      !listText.includes(SSN) && !listText.includes(ACCOUNT));
    check(`VIEWER puede listar ${seccion} (AC-4)`,
      (await errorName(() => callTool(vctx, "listar", { seccion }, opts))) === "ok");
  }

  console.log("\n[mcp-read-tools] casos de servicio archivados\n");
  const archived = await prisma.serviceCase.update({ where: { id: a.serviceCase.id }, data: { archivedAt: new Date() } });
  check("ver casos_servicio archivado → NotFoundError (como en la app)",
    (await errorName(() => callTool(a.ownerCtx, "ver", { seccion: "casos_servicio", id: archived.id }, opts))) === "NotFoundError");
  await prisma.serviceCase.update({ where: { id: a.serviceCase.id }, data: { archivedAt: null } });

  console.log("\n[mcp-read-tools] documentos sensibles y límite\n");
  const ownerView = JSON.stringify(await callTool(a.ownerCtx, "ver", { seccion: "clientes", id: a.client.id }, opts));
  check("ver clientes: el nombre de un documento muy sensible no sale ni al propietario",
    !ownerView.includes("tarjeta SSN de Ana") && ownerView.includes("[documento sensible]"), ownerView.slice(0, 400));
  for (let i = 0; i < 3; i += 1) {
    await prisma.client.create({
      data: { organizationId: a.org.id, clientCode: `L${i}-${MARK}`.slice(0, 20), firstName: `Extra${i}`, lastName: "Lim", status: "ACTIVE" },
    });
  }
  const limited = (await callTool(a.ownerCtx, "listar", { seccion: "clientes", limite: 2 }, opts)) as { items?: unknown[] };
  check("listar respeta el límite pedido", Array.isArray(limited.items) && limited.items.length === 2, limited.items?.length);

  console.log("\n[mcp-read-tools] buscar\n");
  check("buscar por un número de 9 dígitos → rechazado (DomainError)",
    (await errorName(() => callTool(a.ownerCtx, "buscar", { texto: SSN }, opts))) === "DomainError");
  check("buscar por un número de cuenta → rechazado",
    (await errorName(() => callTool(a.ownerCtx, "buscar", { texto: ACCOUNT }, opts))) === "DomainError");
  const found = JSON.stringify(await callTool(a.ownerCtx, "buscar", { texto: "AnaA" }, opts));
  check("buscar encuentra al cliente propio", found.includes(a.client.id), found.slice(0, 300));
  check("buscar no devuelve otra organización", !found.includes(b.client.id));
  const foundB = JSON.stringify(await callTool(a.ownerCtx, "buscar", { texto: "AnaB" }, opts));
  check("buscar el nombre de otra organización → sin resultados suyos", !foundB.includes(b.client.id));
  check("buscar con 1 carácter → ZodError",
    (await errorName(() => callTool(a.ownerCtx, "buscar", { texto: "a" }, opts))) === "ZodError");
  check("ver con sección desconocida → ZodError",
    (await errorName(() => callTool(a.ownerCtx, "ver", { seccion: "pagos", id: a.client.id }, opts))) === "ZodError");
}

async function main() {
  console.log("\n[mcp-read-tools] herramientas de lectura\n");
  try {
    await run();
  } finally {
    for (const id of createdOrgs) await prisma.organization.delete({ where: { id } }).catch(() => undefined);
    for (const id of createdUsers) await prisma.user.delete({ where: { id } }).catch(() => undefined);
  }
}

main()
  .catch((error) => {
    failed += 1;
    console.error(error);
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (failed > 0) {
      console.error(`\n✗ ${failed} comprobación(es) fallaron\n`);
      process.exit(1);
    }
    console.log("\n✓ mcp-read-tools OK\n");
  });
