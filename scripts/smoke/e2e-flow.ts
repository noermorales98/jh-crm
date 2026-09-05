/**
 * Flujo E2E integral (verificación final): crea datos prefijados "E2E-" y
 * ejecuta el flujo principal de punta a punta usando los servicios de dominio:
 *   cliente → caso (etapa inicial) → mover etapa → ronda enviada con tarea
 *   automática → servicio + paquete → cotización (3 tipos de ítem) → enviada
 *   → aceptada → pago parcial RECIBIDO (quote PARTIAL) → pago del saldo
 *   (quote PAID) → anular segundo recibo (VOID).
 * Imprime un JSON con todos los IDs/folios para la verificación de UI.
 * Limpiar con: npx tsx --env-file=.env.local scripts/smoke/e2e-cleanup.ts
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as cases from "../../src/server/cases";
import * as rounds from "../../src/server/rounds";
import * as services from "../../src/server/services";
import * as quotes from "../../src/server/quotes";
import * as payments from "../../src/server/payments";
import * as receipts from "../../src/server/receipts";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`E2E ASSERT FAILED: ${msg}`);
}

async function main() {
  const org = await prisma.organization.findFirstOrThrow({
    where: { name: "J&H Multiservices LLC" },
  });
  const owner = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: org.id, role: "OWNER" },
  });
  const ctx: OrganizationContext = {
    userId: owner.userId,
    organizationId: org.id,
    role: "OWNER",
  };

  // 1. Cliente
  const client = await clients.createClient(ctx, {
    firstName: "E2E-Verificacion",
    lastName: "Integral",
    email: "e2e-verificacion@example.com",
    phone: "+1 555 010 2030",
  });
  assert(client.clientCode, "cliente sin clientCode");

  // 2. Caso con etapa inicial
  const creditCase = await cases.createCreditCase(ctx, {
    clientId: client.id,
    summary: "E2E-Caso de verificación integral del flujo principal.",
  });
  const initialStage = await prisma.workflowStage.findUniqueOrThrow({
    where: { id: creditCase.stageId },
  });
  const firstStage = await prisma.workflowStage.findFirstOrThrow({
    where: { organizationId: org.id, isActive: true },
    orderBy: { order: "asc" },
  });
  assert(
    initialStage.id === firstStage.id,
    `etapa inicial esperada "${firstStage.name}" pero caso está en "${initialStage.name}"`,
  );

  // 3. Mover etapa (a la siguiente por orden)
  const nextStage = await prisma.workflowStage.findFirstOrThrow({
    where: { organizationId: org.id, isActive: true, order: { gt: firstStage.order } },
    orderBy: { order: "asc" },
  });
  await cases.moveCaseToStage(ctx, creditCase.id, nextStage.id);
  const moved = await prisma.creditCase.findUniqueOrThrow({ where: { id: creditCase.id } });
  assert(moved.stageId === nextStage.id, "el caso no cambió de etapa");

  // 4. Ronda enviada con fecha de revisión + tarea automática
  const round = await rounds.createRound(ctx, {
    caseId: creditCase.id,
    notes: "E2E-Ronda de verificación.",
    lettersCount: 3,
  });
  const expectedReviewAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const sent = await rounds.markRoundSent(ctx, round.id, {
    expectedReviewAt,
    createReviewTask: true,
  });
  assert(sent.round.status === "SENT", "la ronda no quedó SENT");
  assert(sent.reviewTask, "markRoundSent no creó la tarea automática");
  const autoTask = sent.reviewTask!;

  // 5. Servicio y paquete
  const service = await services.createService(ctx, {
    name: "E2E-Servicio Verificación",
    description: "Servicio creado por la verificación E2E.",
    defaultPrice: "150.00",
  });
  const service2 = await services.createService(ctx, {
    name: "E2E-Servicio Complementario",
    defaultPrice: "80.00",
  });
  const pkg = await services.createPackage(ctx, {
    name: "E2E-Paquete Verificación",
    description: "Paquete creado por la verificación E2E.",
    defaultPrice: "400.00",
    items: [
      { serviceId: service.id, quantity: 1 },
      { serviceId: service2.id, quantity: 2 },
    ],
  });

  // 6. Cotización con los tres tipos de ítem
  const quote = await quotes.createQuote(ctx, {
    clientId: client.id,
    caseId: creditCase.id,
    items: [
      { kind: "service", serviceId: service.id, quantity: 2 },
      { kind: "package", packageId: pkg.id, quantity: 1 },
      { kind: "manual", description: "E2E-Ítem manual de verificación", quantity: 1, unitPrice: "100.00" },
    ],
    notes: "E2E-Cotización de verificación integral.",
  });
  const detail = await quotes.getQuoteDetail(ctx, quote.id);
  assert(detail.items.length === 3, "la cotización no tiene 3 ítems");
  const total = Number(detail.total);

  // 7. Enviada y aceptada
  await quotes.markQuoteSent(ctx, quote.id);
  await quotes.markQuoteAccepted(ctx, quote.id);
  let q = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
  assert(q.status === "ACCEPTED", `quote status esperado ACCEPTED, tiene ${q.status}`);

  // 8. Pago parcial RECIBIDO → quote PARTIAL + recibo
  const half = (total / 2).toFixed(2);
  const pay1 = await payments.registerPayment(ctx, {
    clientId: client.id,
    quoteId: quote.id,
    caseId: creditCase.id,
    amount: half,
    method: "ZELLE",
    reference: "E2E-PAGO-PARCIAL",
    status: "RECEIVED",
  });
  assert(pay1.receipt, "pago parcial sin recibo");
  q = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
  assert(q.status === "PARTIAL", `tras pago parcial quote esperado PARTIAL, tiene ${q.status}`);

  // 9. Pago del saldo → quote PAID
  const remaining = (total - Number(half)).toFixed(2);
  const pay2 = await payments.registerPayment(ctx, {
    clientId: client.id,
    quoteId: quote.id,
    caseId: creditCase.id,
    amount: remaining,
    method: "CASH",
    reference: "E2E-PAGO-SALDO",
    status: "RECEIVED",
  });
  assert(pay2.receipt, "pago del saldo sin recibo");
  q = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
  assert(q.status === "PAID", `tras pago del saldo quote esperado PAID, tiene ${q.status}`);

  // 10. Anular el segundo recibo → VOID (y quote vuelve a PARTIAL)
  await receipts.voidReceipt(ctx, pay2.receipt!.id, "E2E-Anulación de verificación integral");
  const voided = await prisma.receipt.findUniqueOrThrow({ where: { id: pay2.receipt!.id } });
  assert(voided.status === "VOID", "el segundo recibo no quedó VOID");
  // Nota de diseño (spec: "anulación sin borrar"): anular el recibo NO
  // revierte el pago ni el estado de la cotización; el pago sigue RECEIVED.
  q = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
  console.error(`[e2e] quote tras anular recibo: ${q.status} (esperado por diseño: se mantiene)`);

  const out = {
    ok: true,
    orgId: org.id,
    clientId: client.id,
    clientCode: client.clientCode,
    caseId: creditCase.id,
    caseCode: creditCase.caseCode,
    initialStage: firstStage.name,
    movedStage: nextStage.name,
    roundId: round.id,
    taskId: autoTask.id,
    serviceId: service.id,
    service2Id: service2.id,
    packageId: pkg.id,
    quoteId: quote.id,
    quoteFolio: quote.folio,
    quoteTotal: total,
    payment1Id: pay1.payment.id,
    receipt1Id: pay1.receipt!.id,
    receipt1Folio: pay1.receipt!.folio,
    payment2Id: pay2.payment.id,
    receipt2Id: pay2.receipt!.id,
    receipt2Folio: pay2.receipt!.folio,
  };
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    new URL("./e2e-ids.json", import.meta.url),
    JSON.stringify(out, null, 2),
  );
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
