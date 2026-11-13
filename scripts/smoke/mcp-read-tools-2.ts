/**
 * Lecturas de la tanda 2 del conector MCP contra una base real y desechable:
 * rondas (con sus ítems de disputa), cartas, reportes de crédito y consultas.
 * Cada sección se lista y se ve por id; nada de otra organización; nada sensible;
 * un VIEWER lee.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-read-tools-2.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, seedMcpOrg } from "./_lib/mcp-seed";

assertDisposableDb();

const prisma = new PrismaClient();
const MARK = `mcpr2${Date.now()}`;
const SSN = "123-45-6789";
const ACCOUNT = "4111222233334444";
const cleanups: Array<() => Promise<void>> = [];
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

async function seed(suffix: string) {
  const s = await seedMcpOrg(prisma, `${MARK}${suffix}`);
  cleanups.push(s.cleanup);
  const orgId = s.org.id;
  const serviceCase = await prisma.serviceCase.create({
    data: {
      organizationId: orgId,
      clientId: s.client.id,
      serviceId: s.service.id,
      caseNumber: `SC-${suffix}-${MARK}`.slice(0, 30),
      status: "OPEN",
      stageId: s.stage.id,
    } as never,
  });
  const creditCase = await prisma.creditCase.create({
    data: {
      organizationId: orgId,
      clientId: s.client.id,
      serviceCaseId: serviceCase.id,
      caseCode: `CC-${suffix}-${MARK}`.slice(0, 30),
      stageId: s.stage.id,
    },
  });
  const report = await prisma.creditReport.create({
    data: {
      organizationId: orgId,
      clientId: s.client.id,
      caseId: creditCase.id,
      provider: "Proveedor sintético",
      reportDate: new Date("2026-01-15"),
      notes: `Nota con SSN ${SSN} y cuenta ${ACCOUNT}`,
    },
  });
  await prisma.creditBureauSnapshot.create({
    data: { reportId: report.id, bureau: "EXPERIAN", score: 600, negativeAccounts: 1 },
  });
  const item = await prisma.creditItem.create({
    data: {
      organizationId: orgId,
      clientId: s.client.id,
      caseId: creditCase.id,
      reportId: report.id,
      creditorName: `Acreedor ${suffix}`,
      accountNumberMasked: ACCOUNT,
      bureau: "EXPERIAN",
      isNegative: true,
      remarks: `cuenta ${ACCOUNT} ssn ${SSN}`,
    },
  });
  const round = await prisma.creditRound.create({
    data: {
      organizationId: orgId,
      caseId: creditCase.id,
      roundNumber: 1,
      status: "PREPARING",
      notes: `Ronda SSN ${SSN}`,
    },
  });
  const dispute = await prisma.disputeItem.create({
    data: {
      organizationId: orgId,
      roundId: round.id,
      creditItemId: item.id,
      bureau: "EXPERIAN",
      disputeReason: "No es mi cuenta",
      disputeDetails: `Detalle con cuenta ${ACCOUNT}`,
    },
  });
  const letter = await prisma.disputeLetter.create({
    data: {
      organizationId: orgId,
      roundId: round.id,
      bureau: "EXPERIAN",
      recipient: "Experian (sintético)",
      subjectSnapshot: `Disputa ${suffix}`,
      contentSnapshot: `Estimados señores, mi SSN es ${SSN} y la cuenta ${ACCOUNT}.`,
    },
  });
  await prisma.disputeLetterItem.create({ data: { letterId: letter.id, disputeItemId: dispute.id } });
  const consultation = await prisma.consultation.create({
    data: { organizationId: orgId, clientId: s.client.id, notes: `Consulta ${suffix} SSN ${SSN} cuenta ${ACCOUNT}` },
  });
  return { s, round, dispute, letter, report, consultation };
}

async function run() {
  const { allTools } = await import("../../src/server/mcp/tools");
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const opts = { tools: allTools() };

  const a = await seed("A");
  const b = await seed("B");
  const octx = a.s.owner;
  const vctx = a.s.viewer;

  const ids: Record<string, { a: string; b: string }> = {
    rondas: { a: a.round.id, b: b.round.id },
    cartas: { a: a.letter.id, b: b.letter.id },
    reportes_credito: { a: a.report.id, b: b.report.id },
    consultas: { a: a.consultation.id, b: b.consultation.id },
  };

  console.log("\n[mcp-read-tools-2] listar y ver cada sección\n");
  for (const [seccion, id] of Object.entries(ids)) {
    const list = await callTool(octx, "listar", { seccion }, opts).catch((e) => e);
    const listText = JSON.stringify(list);
    check(`listar ${seccion} → incluye el registro propio`, listText.includes(id.a), listText.slice(0, 300));
    check(`listar ${seccion} → no mezcla otra organización`, !listText.includes(id.b));
    const seen = await callTool(octx, "ver", { seccion, id: id.a }, opts).catch((e) => e);
    const seenText = JSON.stringify(seen);
    check(`ver ${seccion} → devuelve el registro`, !(seen instanceof Error) && seenText.includes(id.a), seenText.slice(0, 300));
    check(`ver ${seccion} con id de otra organización → NotFoundError`,
      (await errorName(() => callTool(octx, "ver", { seccion, id: id.b }, opts))) === "NotFoundError");
    check(`ver ${seccion} → incluye enlace al CRM`, seenText.includes("/crm/"), seenText.slice(0, 200));
    check(`ver ${seccion} → sin SSN ni cuenta completa`, !seenText.includes(SSN) && !seenText.includes(ACCOUNT), seenText);
    check(`listar ${seccion} → sin SSN ni cuenta completa`, !listText.includes(SSN) && !listText.includes(ACCOUNT), listText);
    check(`VIEWER puede listar ${seccion}`, (await errorName(() => callTool(vctx, "listar", { seccion }, opts))) === "ok");
    check(`VIEWER puede ver ${seccion}`, (await errorName(() => callTool(vctx, "ver", { seccion, id: id.a }, opts))) === "ok");
  }

  console.log("\n[mcp-read-tools-2] detalle de rondas y filtros\n");
  const round = JSON.stringify(await callTool(octx, "ver", { seccion: "rondas", id: a.round.id }, opts));
  check("ver rondas → incluye los ítems de disputa", round.includes(a.dispute.id) && round.includes("No es mi cuenta"), round.slice(0, 500));
  check("ver rondas → no incluye el ítem de otra organización", !round.includes(b.dispute.id));
  const letter = JSON.stringify(await callTool(octx, "ver", { seccion: "cartas", id: a.letter.id }, opts));
  check("ver cartas → incluye el asunto", letter.includes("Disputa A"), letter.slice(0, 300));
  const byStatus = JSON.stringify(await callTool(octx, "listar", { seccion: "rondas", estado: "SENT" }, opts));
  check("listar rondas con estado distinto → no devuelve la ronda", !byStatus.includes(a.round.id));
  check("listar rondas con estado inválido → DomainError",
    (await errorName(() => callTool(octx, "listar", { seccion: "rondas", estado: "NOPE" }, opts))) === "DomainError");
}

async function main() {
  console.log("\n[mcp-read-tools-2] herramientas de lectura, tanda 2\n");
  try {
    await run();
  } finally {
    for (const fn of cleanups) await fn().catch(() => undefined);
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
    console.log("\n✓ mcp-read-tools-2 OK\n");
  });
