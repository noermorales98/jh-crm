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
/** 10 dígitos: el redactor solo atrapa 11 o más, así que solo `maskAccount` lo oculta. */
const SHORT_ACCOUNT = "1234567890";
const ADDRESS = "742 Calle Ficticia 123";
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
  const shortItem = await prisma.creditItem.create({
    data: {
      organizationId: orgId,
      clientId: s.client.id,
      caseId: creditCase.id,
      reportId: report.id,
      creditorName: `Corta ${suffix}`,
      accountNumberMasked: SHORT_ACCOUNT,
      bureau: "EQUIFAX",
      isNegative: true,
    },
  });
  await prisma.disputeItem.create({
    data: {
      organizationId: orgId,
      roundId: round.id,
      creditItemId: shortItem.id,
      bureau: "EQUIFAX",
      disputeReason: "Cuenta corta",
    },
  });
  const letter = await prisma.disputeLetter.create({
    data: {
      organizationId: orgId,
      roundId: round.id,
      bureau: "EXPERIAN",
      recipient: "Experian (sintético)",
      subjectSnapshot: `Disputa ${suffix}`,
      contentSnapshot: `Estimados señores, vivo en ${ADDRESS}, mi SSN es ${SSN} y la cuenta ${ACCOUNT}.`,
      status: "FINAL",
    },
  });
  await prisma.disputeLetterItem.create({ data: { letterId: letter.id, disputeItemId: dispute.id } });
  const consultation = await prisma.consultation.create({
    data: { organizationId: orgId, clientId: s.client.id, notes: `Consulta ${suffix} SSN ${SSN} cuenta ${ACCOUNT}` },
  });
  return { s, serviceCase, creditCase, round, dispute, letter, report, consultation };
}

/**
 * Segundo juego de registros en la MISMA organización, distinto en estado/tipo y en nombre
 * de cliente: sirve para probar que los filtros `estado` y `texto` excluyen de verdad.
 */
async function seedSibling(base: Awaited<ReturnType<typeof seed>>) {
  const { s } = base;
  const orgId = s.org.id;
  const client = await prisma.client.create({
    data: { organizationId: orgId, clientCode: `ZZ${Date.now()}`, firstName: "Beto", lastName: "Zeta Distinto", status: "ACTIVE" },
  });
  const serviceCase = await prisma.serviceCase.create({
    data: {
      organizationId: orgId,
      clientId: client.id,
      serviceId: s.service.id,
      caseNumber: `SC-Z-${MARK}`.slice(0, 30),
      status: "OPEN",
      stageId: s.stage.id,
    } as never,
  });
  const creditCase = await prisma.creditCase.create({
    data: { organizationId: orgId, clientId: client.id, serviceCaseId: serviceCase.id, caseCode: `CC-Z-${MARK}`.slice(0, 30), stageId: s.stage.id },
  });
  const report = await prisma.creditReport.create({
    data: { organizationId: orgId, clientId: client.id, caseId: creditCase.id, type: "INITIAL", reportDate: new Date("2026-02-15") },
  });
  const item = await prisma.creditItem.create({
    data: {
      organizationId: orgId,
      clientId: client.id,
      caseId: creditCase.id,
      reportId: report.id,
      creditorName: "Acreedor hermano",
      accountNumberMasked: "****0001",
      bureau: "EXPERIAN",
      isNegative: true,
    },
  });
  const round = await prisma.creditRound.create({
    data: { organizationId: orgId, caseId: creditCase.id, roundNumber: 1, status: "SENT" },
  });
  const dispute = await prisma.disputeItem.create({
    data: { organizationId: orgId, roundId: round.id, creditItemId: item.id, bureau: "EXPERIAN", disputeReason: "Disputa hermana" },
  });
  const letter = await prisma.disputeLetter.create({
    data: {
      organizationId: orgId,
      roundId: round.id,
      bureau: "EXPERIAN",
      recipient: "Experian (sintético)",
      subjectSnapshot: "Disputa hermana",
      contentSnapshot: "Texto de la carta hermana.",
      status: "DRAFT",
    },
  });
  const consultation = await prisma.consultation.create({
    data: { organizationId: orgId, clientId: client.id, status: "SCHEDULED", notes: "Consulta hermana" },
  });
  return { client, report, item, round, dispute, letter, consultation };
}

async function run() {
  const { allTools } = await import("../../src/server/mcp/tools");
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const opts = { tools: allTools() };

  const a = await seed("A");
  const b = await seed("B");
  const sib = await seedSibling(a);
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
  check("ver rondas → no mezcla los ítems de otra ronda de la misma organización", !round.includes(sib.dispute.id) && !round.includes("Disputa hermana"), round);
  check("ver rondas → cuenta de 10 dígitos solo como ****7890", round.includes("****7890") && !round.includes(SHORT_ACCOUNT), round);
  check("ver rondas → declara que los ítems no están ocultos ni truncados", round.includes('"disputeItemsHidden":false') && round.includes('"itemsTruncated":false'), round);
  const letter = JSON.stringify(await callTool(octx, "ver", { seccion: "cartas", id: a.letter.id }, opts));
  check("ver cartas → incluye el asunto", letter.includes("Disputa A"), letter.slice(0, 300));
  check("ver cartas → no devuelve el cuerpo de la carta (lleva el domicilio)", !letter.includes(ADDRESS) && !letter.includes("Estimados") && !letter.includes("contentPreview") && !letter.includes("contentTruncated"), letter);
  const report = JSON.stringify(await callTool(octx, "ver", { seccion: "reportes_credito", id: a.report.id }, opts));
  check("ver reportes_credito → cuenta de 10 dígitos solo como ****7890", report.includes("****7890") && !report.includes(SHORT_ACCOUNT), report);
  check("ver reportes_credito → no mezcla las partidas de otro reporte de la misma organización", !report.includes(sib.item.id) && !report.includes("Acreedor hermano"), report);
  check("ver reportes_credito → declara que los ítems no están truncados", report.includes('"itemsTruncated":false'), report);
  const sibReport = JSON.stringify(await callTool(octx, "ver", { seccion: "reportes_credito", id: sib.report.id }, opts));
  check("ver el segundo reporte → solo sus partidas", sibReport.includes(sib.item.id) && !sibReport.includes(a.report.id) && !sibReport.includes("Acreedor A"), sibReport);

  console.log("\n[mcp-read-tools-2] tope de 100 ítems\n");
  const bigReport = await prisma.creditReport.create({
    data: { organizationId: a.s.org.id, clientId: a.s.client.id, caseId: a.creditCase.id, reportDate: new Date("2026-03-01") },
  });
  await prisma.creditItem.createMany({
    data: Array.from({ length: 101 }, (_, i) => ({
      organizationId: a.s.org.id,
      clientId: a.s.client.id,
      caseId: a.creditCase.id,
      reportId: bigReport.id,
      creditorName: `Masivo ${i}`,
      bureau: "EXPERIAN" as const,
    })),
  });
  const bigRound = await prisma.creditRound.create({
    data: { organizationId: a.s.org.id, caseId: a.creditCase.id, roundNumber: 9, status: "PREPARING" },
  });
  await prisma.disputeItem.createMany({
    data: Array.from({ length: 101 }, (_, i) => ({
      organizationId: a.s.org.id,
      roundId: bigRound.id,
      targetKind: "PERSONAL_INFO" as const,
      targetLabel: `Dato ${i}`,
      bureau: "EXPERIAN" as const,
      disputeReason: "Masivo",
    })),
  });
  const bigR = JSON.parse(JSON.stringify(await callTool(octx, "ver", { seccion: "reportes_credito", id: bigReport.id }, opts)));
  check("ver reportes_credito con 101 partidas → 100 y itemsTruncated:true", bigR.items?.length === 100 && bigR.itemsTruncated === true, { n: bigR.items?.length, t: bigR.itemsTruncated });
  const bigD = JSON.parse(JSON.stringify(await callTool(octx, "ver", { seccion: "rondas", id: bigRound.id }, opts)));
  check("ver rondas con 101 disputas → 100 y itemsTruncated:true", bigD.disputeItems?.length === 100 && bigD.itemsTruncated === true, { n: bigD.disputeItems?.length, t: bigD.itemsTruncated });

  console.log("\n[mcp-read-tools-2] filtros estado y texto (dos registros distintos por sección)\n");
  const listIds = async (seccion: string, args: Record<string, unknown>) =>
    JSON.stringify(await callTool(octx, "listar", { seccion, ...args }, opts));
  const sections: Array<{ seccion: string; first: string; second: string; firstState: string; secondState: string }> = [
    { seccion: "rondas", first: a.round.id, second: sib.round.id, firstState: "PREPARING", secondState: "SENT" },
    { seccion: "cartas", first: a.letter.id, second: sib.letter.id, firstState: "FINAL", secondState: "DRAFT" },
    { seccion: "reportes_credito", first: a.report.id, second: sib.report.id, firstState: "MANUAL", secondState: "INITIAL" },
    { seccion: "consultas", first: a.consultation.id, second: sib.consultation.id, firstState: "REQUESTED", secondState: "SCHEDULED" },
  ];
  for (const { seccion, first, second, firstState, secondState } of sections) {
    const onlySecond = await listIds(seccion, { estado: secondState });
    check(`${seccion} estado=${secondState} → incluye el segundo y excluye el primero`, onlySecond.includes(second) && !onlySecond.includes(first), onlySecond);
    const onlyFirst = await listIds(seccion, { estado: firstState });
    check(`${seccion} estado=${firstState} → incluye el primero y excluye el segundo`, onlyFirst.includes(first) && !onlyFirst.includes(second), onlyFirst);
    const textSecond = await listIds(seccion, { texto: "Zeta" });
    check(`${seccion} texto=Zeta → incluye el segundo y excluye el primero`, textSecond.includes(second) && !textSecond.includes(first), textSecond);
    const textFirst = await listIds(seccion, { texto: MARK });
    check(`${seccion} texto=<cliente del primero> → incluye el primero y excluye el segundo`, textFirst.includes(first) && !textFirst.includes(second), textFirst);
  }
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
