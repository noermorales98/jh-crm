/**
 * Lecturas de la tanda 3a del conector MCP contra una base real y desechable:
 * pagos, recibos, planes de pago (con sus cuotas), contratos y plantillas de contrato.
 * Cada sección se lista y se ve por id; nada de otra organización; nada sensible;
 * el texto y la firma de los contratos no salen; un VIEWER lee.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-read-tools-3.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, seedMcpOrg } from "./_lib/mcp-seed";

assertDisposableDb();

const prisma = new PrismaClient();
const MARK = `mcpr3${Date.now()}`;
const SSN = "123-45-6789";
const ACCOUNT = "4111222233334444";
const CONTRACT_TEXT = `CLAUSULA-SECRETA-${MARK}`;
const TEMPLATE_TEXT = `PLANTILLA-SECRETA-${MARK}`;
const SIGNATURE = `data:image/png;base64,FIRMA${MARK}`;
const SIGNER_IP = "203.0.113.77";
const cleanups: Array<() => Promise<void>> = [];
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function errorText(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`;
  }
}

async function seed(suffix: string) {
  const s = await seedMcpOrg(prisma, `${MARK}${suffix}`);
  cleanups.push(s.cleanup);
  const orgId = s.org.id;
  const clientId = s.client.id;
  const payment = await prisma.payment.create({
    data: {
      organizationId: orgId,
      clientId,
      amount: 150,
      method: "ZELLE",
      status: "RECEIVED",
      receivedAt: new Date("2026-02-01T12:00:00Z"),
      reference: `ref cuenta ${ACCOUNT}`,
      notes: `Nota con SSN ${SSN}`,
    },
  });
  const receipt = await prisma.receipt.create({
    data: {
      organizationId: orgId,
      paymentId: payment.id,
      clientId,
      folioNumber: 1,
      folio: `R-${suffix}-${MARK}`.slice(0, 40),
      amount: 150,
      paymentMethod: "ZELLE",
    },
  });
  const plan = await prisma.paymentPlan.create({
    data: {
      organizationId: orgId,
      clientId,
      totalAmount: 300,
      installmentAmount: 100,
      frequency: "MONTHLY",
      numberOfInstallments: 3,
      startDate: new Date("2026-03-01T12:00:00Z"),
      notes: `Plan con cuenta ${ACCOUNT}`,
      installments: {
        create: [1, 2, 3].map((sequence) => ({
          organizationId: orgId,
          sequence,
          amount: 100,
          dueAt: new Date(`2026-0${sequence + 2}-01T12:00:00Z`),
        })),
      },
    },
  });
  const template = await prisma.contractTemplate.create({
    data: { organizationId: orgId, name: `Plantilla ${suffix} ${MARK}`, contentHtml: `<p>${TEMPLATE_TEXT}</p>` },
  });
  const contract = await prisma.clientContract.create({
    data: {
      organizationId: orgId,
      clientId,
      templateId: template.id,
      title: `Contrato ${suffix}`,
      version: "1.0",
      contentSnapshot: `<p>${CONTRACT_TEXT}</p>`,
      status: "SIGNED",
      signerName: "Firmante Sintético",
      signerIp: SIGNER_IP,
      userAgent: `Agente ${MARK}`,
      signatureData: SIGNATURE,
      signedAt: new Date("2026-02-02T12:00:00Z"),
    },
  });
  const pendingPayment = await prisma.payment.create({
    data: { organizationId: orgId, clientId, amount: 40, method: "CASH", status: "PENDING" },
  });
  const inactiveTemplate = await prisma.contractTemplate.create({
    data: { organizationId: orgId, name: `Vieja ${suffix} ${MARK}`, contentHtml: "<p>vieja</p>", active: false },
  });
  return { s, payment, pendingPayment, receipt, plan, template, inactiveTemplate, contract };
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
    pagos: { a: a.payment.id, b: b.payment.id },
    recibos: { a: a.receipt.id, b: b.receipt.id },
    planes_pago: { a: a.plan.id, b: b.plan.id },
    contratos: { a: a.contract.id, b: b.contract.id },
  };
  const expectedHref: Record<string, string> = {
    pagos: "/crm/pagos",
    recibos: "/crm/recibos",
    planes_pago: `/crm/planes-pago/${a.plan.id}`,
    contratos: `/crm/clientes/${a.s.client.id}`,
  };
  const secrets = [SSN, ACCOUNT, CONTRACT_TEXT, TEMPLATE_TEXT, SIGNATURE, SIGNER_IP, `Agente ${MARK}`];
  const leaks = (text: string) => secrets.filter((secret) => text.includes(secret));

  console.log("\n[mcp-read-tools-3] listar y ver cada sección\n");
  for (const [seccion, id] of Object.entries(ids)) {
    const list = await callTool(octx, "listar", { seccion }, opts).catch((e) => e);
    const listText = JSON.stringify(list);
    check(`listar ${seccion} → incluye el registro propio`, listText.includes(id.a), listText.slice(0, 300));
    check(`listar ${seccion} → no mezcla otra organización`, !listText.includes(id.b));
    const seen = await callTool(octx, "ver", { seccion, id: id.a }, opts).catch((e) => e);
    const seenText = JSON.stringify(seen);
    check(`ver ${seccion} → devuelve el registro`, !(seen instanceof Error) && seenText.includes(id.a), seenText.slice(0, 300));
    check(`ver ${seccion} con id de otra organización → No encontrado`,
      (await errorText(() => callTool(octx, "ver", { seccion, id: id.b }, opts))) === "NotFoundError: No encontrado.");
    const href = String((seen as { href?: unknown }).href ?? "");
    check(`ver ${seccion} → enlace exacto a su página del CRM`, href.endsWith(expectedHref[seccion]), href);
    check(`ver ${seccion} → nada sensible`, leaks(seenText).length === 0, leaks(seenText));
    check(`listar ${seccion} → nada sensible`, leaks(listText).length === 0, leaks(listText));
    check(`VIEWER puede listar ${seccion}`, (await errorText(() => callTool(vctx, "listar", { seccion }, opts))) === "ok");
    check(`VIEWER puede ver ${seccion}`, (await errorText(() => callTool(vctx, "ver", { seccion, id: id.a }, opts))) === "ok");
  }

  console.log("\n[mcp-read-tools-3] detalle y filtros\n");
  const pay = JSON.parse(JSON.stringify(await callTool(octx, "ver", { seccion: "pagos", id: a.payment.id }, opts)));
  check("ver pagos → monto, método, estado y su recibo", pay.amount.includes("150") && pay.method === "ZELLE" && pay.status === "RECEIVED" && pay.receipt?.id === a.receipt.id, pay);
  check("ver pagos → la referencia sale con la cuenta enmascarada", String(pay.reference).includes("****4444"), pay.reference);
  const plan = JSON.parse(JSON.stringify(await callTool(octx, "ver", { seccion: "planes_pago", id: a.plan.id }, opts)));
  check("ver planes_pago → las 3 cuotas en orden", Array.isArray(plan.installments) && plan.installments.map((i: { sequence: number }) => i.sequence).join() === "1,2,3", plan.installments);
  check("ver planes_pago → enlace al plan", String(plan.href).endsWith(`/crm/planes-pago/${a.plan.id}`), plan.href);
  const con = JSON.parse(JSON.stringify(await callTool(octx, "ver", { seccion: "contratos", id: a.contract.id }, opts)));
  check("ver contratos → estado, firmante y aviso de texto oculto", con.status === "SIGNED" && con.signerName === "Firmante Sintético" && con.contentHidden === true, con);
  check("ver contratos → sin campos de texto, firma, IP ni navegador",
    !("contentSnapshot" in con) && !("signatureData" in con) && !("signerIp" in con) && !("userAgent" in con), Object.keys(con));

  const filtered = JSON.stringify(await callTool(octx, "listar", { seccion: "pagos", estado: "pending" }, opts));
  check("listar pagos estado PENDING → el pendiente sí, el recibido no", filtered.includes(a.pendingPayment.id) && !filtered.includes(a.payment.id), filtered.slice(0, 200));
  const list = async (seccion: string, args: object) => JSON.stringify(await callTool(octx, "listar", { seccion, ...args }, opts));
  const statusCases: Array<[string, string, string, string]> = [
    ["recibos", "ISSUED", "VOID", a.receipt.id],
    ["planes_pago", "ACTIVE", "CANCELLED", a.plan.id],
    ["contratos", "SIGNED", "CANCELLED", a.contract.id],
  ];
  for (const [seccion, match, other, id] of statusCases) {
    check(`listar ${seccion} estado ${match} → lo incluye`, (await list(seccion, { estado: match })).includes(id));
    check(`listar ${seccion} estado ${other} → no lo incluye`, !(await list(seccion, { estado: other })).includes(id));
  }
  const ownCode = a.s.client.clientCode;
  const otherCode = `NADA${MARK}`;
  for (const [seccion, id] of [["pagos", a.payment.id], ["planes_pago", a.plan.id], ["contratos", a.contract.id]] as const) {
    check(`listar ${seccion} por código del cliente → lo encuentra`, (await list(seccion, { texto: ownCode })).includes(id));
    check(`listar ${seccion} por un texto que no coincide → no sale`, !(await list(seccion, { texto: otherCode })).includes(id));
  }
  check("listar pagos con estado inválido → DomainError",
    (await errorText(() => callTool(octx, "listar", { seccion: "pagos", estado: "PAGADO" }, opts))).startsWith("DomainError"));
  const byFolio = JSON.stringify(await callTool(octx, "listar", { seccion: "recibos", texto: a.receipt.folio }, opts));
  check("listar recibos por folio → lo encuentra", byFolio.includes(a.receipt.id), byFolio.slice(0, 200));

  console.log("\n[mcp-read-tools-3] plantillas de contrato\n");
  // Con el MARK como texto, las plantillas de ambas organizaciones coinciden: solo el filtro por organización deja fuera la ajena.
  const tpl = JSON.stringify(await callTool(octx, "listar", { seccion: "plantillas_contrato", texto: MARK }, opts));
  check("listar plantillas_contrato → la propia, sin la ajena", tpl.includes(a.template.id) && !tpl.includes(b.template.id), tpl.slice(0, 300));
  const active = JSON.stringify(await callTool(octx, "listar", { seccion: "plantillas_contrato", estado: "ACTIVE", texto: MARK }, opts));
  check("listar plantillas_contrato ACTIVE → la activa sí, la inactiva no", active.includes(a.template.id) && !active.includes(a.inactiveTemplate.id), active);
  check("listar plantillas_contrato → sin texto legal", !tpl.includes(TEMPLATE_TEXT) && !tpl.includes("contentHtml"), tpl);
  const inactive = JSON.stringify(await callTool(octx, "listar", { seccion: "plantillas_contrato", estado: "INACTIVE", texto: MARK }, opts));
  check("listar plantillas_contrato INACTIVE → la inactiva sí, la activa no", inactive.includes(a.inactiveTemplate.id) && !inactive.includes(a.template.id), inactive);
  check("ver plantillas_contrato → error claro, sin texto",
    (await errorText(() => callTool(octx, "ver", { seccion: "plantillas_contrato", id: a.template.id }, opts))).startsWith("DomainError: Las plantillas"));
}

run()
  .catch((error) => {
    failed += 1;
    console.error(error);
  })
  .finally(async () => {
    for (const cleanup of cleanups) await cleanup();
    await prisma.$disconnect();
    if (failed) {
      console.error(`\n${failed} comprobaciones fallaron`);
      process.exit(1);
    }
    console.log("\nmcp-read-tools-3: OK");
  });
