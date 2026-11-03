/**
 * Envío de rondas y cobros contra una base real y desechable.
 * Recorre el mismo camino que la pantalla, sin operaciones sintéticas.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npm run smoke:contract-gates-db
 */
import { Prisma, PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^mysql:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(databaseUrl)) {
  throw new Error("contract-gates-db solo corre contra una base local desechable.");
}

const prisma = new PrismaClient();
const MARK = `gates${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function errorMessage(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function makeOrg(suffix: string) {
  const user = await prisma.user.create({
    data: { email: `${MARK}-${suffix}@example.test`, passwordHash: "x", name: "Gate" },
  });
  const org = await prisma.organization.create({ data: { name: `TEST JH-CRM ${MARK} ${suffix}` } });
  await prisma.organizationMember.create({
    data: { userId: user.id, organizationId: org.id, role: "OWNER" },
  });
  await prisma.organizationSettings.create({ data: { organizationId: org.id } });
  const service = await prisma.service.create({
    data: { organizationId: org.id, code: "CREDIT_REPAIR", name: "Reparación de crédito" },
  });
  await prisma.workflowStage.create({
    data: { organizationId: org.id, serviceId: service.id, key: "INICIO", name: "Inicio", order: 1 },
  });
  const ctx: OrganizationContext = {
    userId: user.id,
    organizationId: org.id,
    role: "OWNER",
  };
  return ctx;
}

async function makeClient(ctx: OrganizationContext, code: string) {
  return prisma.client.create({
    data: {
      organizationId: ctx.organizationId,
      clientCode: `${code}-${MARK}`.slice(0, 20),
      firstName: "Gate",
      lastName: code,
      status: "ACTIVE",
    },
  });
}

async function makeContract(
  ctx: OrganizationContext,
  clientId: string,
  caseId: string | null,
  status: "DRAFT" | "SENT" | "SIGNED" | "CANCELLED",
) {
  return prisma.clientContract.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      caseId,
      title: "Contrato de prueba",
      version: "1.0",
      contentSnapshot: "Texto de prueba",
      status,
      signedAt: status === "SIGNED" ? new Date() : null,
    },
  });
}

async function makeQuote(
  ctx: OrganizationContext,
  clientId: string,
  caseId: string | null,
  folioNumber: number,
) {
  return prisma.quote.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      caseId,
      folioNumber,
      folio: `Q-${folioNumber}`,
      status: "SENT",
      subtotal: 100,
      total: 100,
    },
  });
}

async function main() {
  const { createCreditCase } = await import("../../src/server/cases");
  const rounds = await import("../../src/server/rounds");
  const { getEmbeddedRoundDetail } = await import("../../src/server/rounds/embedded-detail");
  const payments = await import("../../src/server/payments");
  const stripe = await import("../../src/server/payments/stripe");

  const ctx = await makeOrg("a");
  const otherOrg = await makeOrg("b");
  const expectedReviewAt = new Date(Date.now() + 30 * 86400_000);

  console.log("\n[contract-gates-db] envío de rondas\n");
  const client = await makeClient(ctx, "A");
  const creditCase = await createCreditCase(ctx, { clientId: client.id, summary: "Caso A" });
  const round = await rounds.createRound(ctx, { caseId: creditCase.id });

  const blockedDetail = await getEmbeddedRoundDetail(ctx, round.id);
  check("sin contrato, la pantalla no ofrece enviar", blockedDetail.sendGate?.allowed === false);
  check(
    "la pantalla explica que falta el contrato",
    /contrato/i.test(blockedDetail.sendGate?.reason ?? ""),
    blockedDetail.sendGate,
  );
  const noContract = await errorMessage(() =>
    rounds.markRoundSent(ctx, round.id, { expectedReviewAt }),
  );
  check("sin contrato, el servidor rechaza con ese motivo", /contrato/i.test(noContract ?? ""), noContract);

  await makeContract(ctx, client.id, creditCase.id, "DRAFT");
  await makeContract(ctx, client.id, creditCase.id, "SENT");
  await makeContract(ctx, client.id, creditCase.id, "CANCELLED");
  const unsigned = await errorMessage(() =>
    rounds.markRoundSent(ctx, round.id, { expectedReviewAt }),
  );
  check("un contrato sin firmar o cancelado no alcanza", /contrato/i.test(unsigned ?? ""), unsigned);

  const otherClient = await makeClient(ctx, "B");
  const otherCase = await createCreditCase(ctx, { clientId: otherClient.id, summary: "Caso B" });
  await makeContract(ctx, otherClient.id, otherCase.id, "SIGNED");
  const foreign = await errorMessage(() =>
    rounds.markRoundSent(ctx, round.id, { expectedReviewAt }),
  );
  check("el contrato de otro cliente no alcanza", /contrato/i.test(foreign ?? ""), foreign);

  const otherOrgClient = await makeClient(otherOrg, "C");
  await prisma.clientContract.create({
    data: {
      organizationId: otherOrg.organizationId,
      clientId: otherOrgClient.id,
      title: "Ajeno",
      version: "1.0",
      contentSnapshot: "Texto",
      status: "SIGNED",
      signedAt: new Date(),
    },
  });

  await makeContract(ctx, client.id, creditCase.id, "SIGNED");
  const allowedDetail = await getEmbeddedRoundDetail(ctx, round.id);
  check("con contrato firmado, la pantalla ofrece enviar", allowedDetail.sendGate?.allowed === true);
  const sentError = await errorMessage(() =>
    rounds.markRoundSent(ctx, round.id, { expectedReviewAt, createReviewTask: true }),
  );
  check("con contrato firmado, la ronda se envía", sentError === null, sentError);
  const sentRound = await prisma.creditRound.findUnique({ where: { id: round.id } });
  check("la ronda queda en SENT", sentRound?.status === "SENT", sentRound?.status);

  const generalClient = await makeClient(ctx, "D");
  const generalCase = await createCreditCase(ctx, { clientId: generalClient.id, summary: "Caso D" });
  const generalRound = await rounds.createRound(ctx, { caseId: generalCase.id });
  await makeContract(ctx, generalClient.id, null, "SIGNED");
  const generalError = await errorMessage(() =>
    rounds.markRoundSent(ctx, generalRound.id, { expectedReviewAt }),
  );
  check("sirve un contrato firmado del cliente sin caso", generalError === null, generalError);

  console.log("\n[contract-gates-db] cobros\n");
  const payer = await makeClient(ctx, "E");
  const payerCase = await createCreditCase(ctx, { clientId: payer.id, summary: "Caso E" });
  const quote = await makeQuote(ctx, payer.id, payerCase.id, 9001);

  const webhookInput = {
    organizationId: ctx.organizationId,
    quoteId: quote.id,
    clientId: payer.id,
    caseId: payerCase.id,
    amount: new Prisma.Decimal(40),
    currency: "USD",
    sessionId: `cs_${MARK}`,
    paymentIntentId: `pi_${MARK}`,
  };
  const webhookError = await errorMessage(() => stripe.fulfillQuotePayment(webhookInput));
  check("el dinero ya cobrado por Stripe siempre se registra", webhookError === null, webhookError);
  const replayError = await errorMessage(() => stripe.fulfillQuotePayment(webhookInput));
  check("el reintento de Stripe no falla", replayError === null, replayError);
  const stripePayments = await prisma.payment.count({
    where: { stripeCheckoutSessionId: webhookInput.sessionId, status: "RECEIVED" },
  });
  check("el reintento no duplica el pago", stripePayments === 1, stripePayments);

  const manualError = await errorMessage(() =>
    payments.registerPayment(ctx, {
      clientId: payer.id,
      caseId: payerCase.id,
      amount: 10,
      method: "CASH",
    }),
  );
  check("un pago manual ligado a un caso se registra", manualError === null, manualError);

  const checkoutBlocked = await errorMessage(() => stripe.startQuoteCheckout(ctx, quote.id));
  check(
    "sin contrato no se genera un enlace de pago del caso",
    /contrato/i.test(checkoutBlocked ?? ""),
    checkoutBlocked,
  );

  const looseQuote = await makeQuote(ctx, payer.id, null, 9003);
  const looseError = await errorMessage(() => stripe.startQuoteCheckout(ctx, looseQuote.id));
  check(
    "una cotización sin caso no pide contrato",
    !/contrato/i.test(looseError ?? ""),
    looseError,
  );

  await makeContract(ctx, payer.id, payerCase.id, "SIGNED");
  const checkoutAllowed = await errorMessage(() => stripe.startQuoteCheckout(ctx, quote.id));
  check(
    "con contrato firmado, el bloqueo ya no es por contrato",
    !/contrato/i.test(checkoutAllowed ?? ""),
    checkoutAllowed,
  );

  await prisma.$disconnect();
  if (failed > 0) {
    console.error(`\n[contract-gates-db] FALLÓ (${failed})\n`);
    process.exit(1);
  }
  console.log("\n[contract-gates-db] OK\n");
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
