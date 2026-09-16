/**
 * Smoke test del dominio J&H contra la BD remota.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/smoke/domain-smoke.ts
 *
 * Ejercita los SERVICIOS directamente (sin HTTP): cliente → perfil sensible
 * → caso → cambio de etapa → rondas → envío con tarea → revisión → catálogo
 * → cotización con folio → pagos parcial/total → recibos → anulación →
 * reembolso → dashboard → verificación de ActivityLog/AuditLog.
 *
 * Limpia los datos de prueba al final. Los AuditLog se conservan (son
 * rastro de seguridad) y se reportan.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as cases from "../../src/server/cases";
import * as rounds from "../../src/server/rounds";
import * as tasks from "../../src/server/tasks";
import * as catalog from "../../src/server/services";
import * as quotes from "../../src/server/quotes";
import * as payments from "../../src/server/payments";
import * as receipts from "../../src/server/receipts";
import * as dashboard from "../../src/server/dashboard";

const prisma = new PrismaClient();
const MARK = "SMOKE";
let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function main() {
  // Contexto: organización + primer miembro OWNER.
  const org = await prisma.organization.findFirstOrThrow({
    where: { name: "J&H Multiservices LLC" },
  });
  const ownerMembership = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: org.id, role: "OWNER" },
  });
  const ctx: OrganizationContext = {
    userId: ownerMembership.userId,
    organizationId: org.id,
    role: "OWNER",
  };
  console.log(`Organización: ${org.name} (${org.id})`);

  const stageAnalysis = await prisma.workflowStage.findFirstOrThrow({
    where: { organizationId: org.id, key: "ANALYSIS" },
  });

  // ── 1. Cliente + folio ────────────────────────────────────────────────
  console.log("\n[1] Clientes");
  const client = await clients.createClient(ctx, {
    firstName: `${MARK} Ana`,
    lastName: "Prueba",
    email: "smoke.ana@example.com",
    phone: "+1 (555) 010-2233",
  });
  check("clientCode con formato CL-####", /^CL-\d{4}$/.test(client.clientCode), client.clientCode);
  console.log(`    folio cliente: ${client.clientCode}`);

  const found = await clients.listClients(ctx, { q: MARK });
  check("búsqueda por texto encuentra al cliente", found.items.some((c) => c.id === client.id));

  // ── 2. Perfil sensible (cifrado + auditoría) ──────────────────────────
  console.log("\n[2] Perfil sensible");
  await clients.updateSensitiveProfile(ctx, client.id, {
    ssn: "123-45-6789",
    dateOfBirth: new Date("1990-05-15"),
  });
  const profile = await clients.getSensitiveProfile(ctx, client.id);
  check("SSN se descifra correctamente", profile?.ssn === "123-45-6789");
  check("ssnMasked es ***-**-6789", profile?.ssnMasked === "***-**-6789");
  const rawProfile = await prisma.clientSensitiveProfile.findUnique({ where: { clientId: client.id } });
  check(
    "SSN cifrado en BD (no legible)",
    Boolean(rawProfile?.ssnEncrypted?.startsWith("v1:")) && !rawProfile?.ssnEncrypted?.includes("123-45-6789"),
  );
  check("ssnLast4 derivado", rawProfile?.ssnLast4 === "6789");

  // ── 3. Caso + etapas ──────────────────────────────────────────────────
  console.log("\n[3] Casos");
  const creditCase = await cases.createCreditCase(ctx, {
    clientId: client.id,
    assignedToId: ctx.userId,
    summary: "Caso de prueba smoke.",
  });
  check("caseCode con formato CASE-####", /^CASE-\d{4}$/.test(creditCase.caseCode), creditCase.caseCode);
  const defaultStage = await prisma.workflowStage.findFirstOrThrow({
    where: { organizationId: org.id, isActive: true },
    orderBy: { order: "asc" },
  });
  check("etapa inicial = primera activa por order", creditCase.stageId === defaultStage.id);
  console.log(`    folio caso: ${creditCase.caseCode}, etapa inicial: ${defaultStage.key}`);

  await cases.moveCaseToStage(ctx, creditCase.id, stageAnalysis.id);
  const moved = await prisma.creditCase.findUniqueOrThrow({ where: { id: creditCase.id } });
  check("moveToStage actualiza stageId", moved.stageId === stageAnalysis.id);

  await cases.setNextActionAt(ctx, creditCase.id, new Date(Date.now() + 5 * 86400_000));

  // ── 4. Rondas ─────────────────────────────────────────────────────────
  console.log("\n[4] Rondas");
  const round1 = await rounds.createRound(ctx, { caseId: creditCase.id });
  const round2 = await rounds.createRound(ctx, { caseId: creditCase.id });
  check("rondas numeradas 1 y 2", round1.roundNumber === 1 && round2.roundNumber === 2);

  const expectedReview = new Date(Date.now() + 30 * 86400_000);
  const sent = await rounds.markRoundSent(ctx, round1.id, {
    expectedReviewAt: expectedReview,
    createReviewTask: true,
  });
  check("ronda enviada: status SENT + sentAt", sent.round.status === "SENT" && Boolean(sent.round.sentAt));
  check("tarea CREDIT_UPDATE creada con dueAt=expectedReviewAt",
    sent.reviewTask?.type === "CREDIT_UPDATE" &&
    sent.reviewTask.dueAt?.getTime() === expectedReview.getTime());

  const reviewed = await rounds.markRoundReviewed(ctx, round1.id, { outcome: "COMPLETED" });
  check("ronda revisada: COMPLETED + reviewedAt", reviewed.status === "COMPLETED" && Boolean(reviewed.reviewedAt));
  const cancelled2 = await rounds.cancelRound(ctx, round2.id);
  check("ronda 2 cancelada", cancelled2.status === "CANCELLED");

  // ── 5. Tareas ─────────────────────────────────────────────────────────
  console.log("\n[5] Tareas");
  const manualTask = await tasks.createTask(ctx, {
    title: `${MARK} llamar al cliente`,
    type: "CALL",
    assignedToId: ctx.userId,
    clientId: client.id,
    caseId: creditCase.id,
    dueAt: new Date(),
  });
  await tasks.completeTask(ctx, manualTask.id);
  const doneTask = await prisma.task.findUniqueOrThrow({ where: { id: manualTask.id } });
  check("tarea completada con completedAt", doneTask.status === "COMPLETED" && Boolean(doneTask.completedAt));

  // ── 6. Catálogo ───────────────────────────────────────────────────────
  console.log("\n[6] Servicios y paquetes");
  const service = await catalog.createService(ctx, {
    name: `${MARK} Reparación mensual`,
    defaultPrice: "99.00",
  });
  const pkg = await catalog.createPackage(ctx, {
    name: `${MARK} Paquete anual`,
    defaultPrice: "1000.00",
    items: [{ serviceId: service.id, quantity: 12 }],
  });
  check("paquete creado con 1 ítem", pkg.items.length === 1);

  // ── 7. Cotización (snapshot + folio + totales Decimal) ────────────────
  console.log("\n[7] Cotizaciones");
  const quote = await quotes.createQuote(ctx, {
    clientId: client.id,
    caseId: creditCase.id,
    items: [
      { kind: "service", serviceId: service.id, quantity: 2 },               // 2 × 99 = 198
      { kind: "package", packageId: pkg.id, quantity: 1 },                   // 1000
      { kind: "manual", description: "Cargo manual", quantity: 1, unitPrice: "50.00", discountAmount: "10.00" }, // 40
    ],
    taxRate: 0,
  });
  check("folio de cotización Q-YYYY-####", /^Q-\d{4}-\d{4}$/.test(quote.folio), quote.folio);
  check(
    "quote.serviceCaseId dual-write",
    quote.serviceCaseId === creditCase.serviceCaseId,
  );
  check("subtotal = 1248.00", quote.subtotal.equals(new Prisma.Decimal("1248.00")), quote.subtotal.toString());
  check("discountTotal = 10.00", quote.discountTotal.equals(new Prisma.Decimal("10.00")));
  check("total = 1238.00", quote.total.equals(new Prisma.Decimal("1238.00")), quote.total.toString());
  console.log(`    folio cotización: ${quote.folio}, total: ${quote.total.toString()}`);

  // Snapshot: cambiar el precio del servicio no altera la cotización.
  await catalog.updateService(ctx, service.id, { defaultPrice: "150.00" });
  const quoteAfter = await quotes.getQuoteDetail(ctx, quote.id);
  check("snapshot: precio del ítem no cambió", quoteAfter.items[0].unitPrice.equals(new Prisma.Decimal("99.00")));

  await quotes.markQuoteSent(ctx, quote.id);
  const accepted = await quotes.markQuoteAccepted(ctx, quote.id);
  check("cotización aceptada", accepted.status === "ACCEPTED");

  // ── 8. Pagos + recibos (flujo transaccional completo) ─────────────────
  console.log("\n[8] Pagos y recibos");
  const pay1 = await payments.registerPayment(ctx, {
    clientId: client.id,
    caseId: creditCase.id,
    quoteId: quote.id,
    amount: "500.00",
    method: "ZELLE",
  });
  check("pago parcial → Quote PARTIAL", pay1.quoteStatus === "PARTIAL", pay1.quoteStatus);
  check("recibo 1 con folio REC-YYYY-####", Boolean(pay1.receipt && /^REC-\d{4}-\d{4}$/.test(pay1.receipt.folio)), pay1.receipt?.folio);

  const pay2 = await payments.registerPayment(ctx, {
    clientId: client.id,
    quoteId: quote.id,
    amount: "738.00",
    method: "CASH",
  });
  check("pago total → Quote PAID", pay2.quoteStatus === "PAID", pay2.quoteStatus);
  check("folios de recibo únicos", pay1.receipt!.folio !== pay2.receipt!.folio);
  console.log(`    folios recibo: ${pay1.receipt!.folio}, ${pay2.receipt!.folio}`);

  const balance = await payments.quoteBalance(ctx, quote.id);
  check("balance: paid=1238, balance=0",
    balance.paid.equals(new Prisma.Decimal("1238.00")) && balance.balance.equals(new Prisma.Decimal("0.00")),
    { paid: balance.paid.toString(), balance: balance.balance.toString() });

  const quotePaid = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
  check("quote.paidAt registrado", Boolean(quotePaid.paidAt));

  // Pago pendiente
  const pendingPayment = await payments.registerPayment(ctx, {
    clientId: client.id,
    amount: "200.00",
    method: "BANK_TRANSFER",
    status: "PENDING",
    dueAt: new Date(Date.now() - 86400_000), // vencido ayer (fixture cron)
  });
  check("pago pendiente sin recibo", pendingPayment.receipt === null && pendingPayment.payment.status === "PENDING");
  await payments.updatePendingPayment(ctx, pendingPayment.payment.id, { amount: "210.00" });
  const editedPending = await prisma.payment.findUniqueOrThrow({ where: { id: pendingPayment.payment.id } });
  check("pago pendiente editable", editedPending.amount.equals(new Prisma.Decimal("210.00")));

  // ── 9. Anulación de recibo + reembolso ────────────────────────────────
  console.log("\n[9] Anulación y reembolso");
  const voided = await receipts.voidReceipt(ctx, pay1.receipt!.id, "Error de captura en smoke test.");
  check("recibo anulado VOID + voidReason + voidedAt",
    voided.status === "VOID" && Boolean(voided.voidedAt) && Boolean(voided.voidReason));

  await payments.refundPaymentRecord(ctx, pay2.payment.id, "Reembolso smoke.");
  const refundedQuote = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
  check("tras reembolso el quote vuelve a PARTIAL", refundedQuote.status === "PARTIAL", refundedQuote.status);
  const receipt2After = await prisma.receipt.findUniqueOrThrow({ where: { id: pay2.receipt!.id } });
  check("reembolso anula su recibo", receipt2After.status === "VOID");

  // ── 10. Dashboard ─────────────────────────────────────────────────────
  console.log("\n[10] Dashboard");
  const summary = await dashboard.getDashboardSummary(ctx);
  check("dashboard: widgets presentes",
    summary.widgets.pendingPayments.count >= 1 &&
    Array.isArray(summary.widgets.overdueTasks.items) &&
    typeof summary.widgets.activeClients.count === "number");
  console.log(`    pagos pendientes: ${summary.widgets.pendingPayments.count} (suma ${summary.widgets.pendingPayments.totalAmount})`);

  // ── 11. Verificación de logs ──────────────────────────────────────────
  console.log("\n[11] ActivityLog / AuditLog");
  const activityTypes = (
    await prisma.activityLog.findMany({
      where: { clientId: client.id },
      select: { type: true },
    })
  ).map((a) => a.type);
  const expectedActivity = [
    "CREATED", "STAGE_CHANGE", "ROUND_CREATED", "ROUND_SENT", "ROUND_REVIEWED",
    "TASK_CREATED", "TASK_COMPLETED", "QUOTE_CREATED", "QUOTE_SENT",
    "PAYMENT_RECORDED", "RECEIPT_CREATED",
  ];
  for (const type of expectedActivity) {
    check(`ActivityLog ${type}`, activityTypes.includes(type as never));
  }

  const auditActions = (
    await prisma.auditLog.findMany({
      where: {
        organizationId: org.id,
        createdAt: { gte: new Date(Date.now() - 10 * 60_000) },
        action: { in: ["SENSITIVE_PROFILE_VIEWED", "SENSITIVE_PROFILE_UPDATED", "PAYMENT_RECEIVED", "RECEIPT_VOIDED", "PAYMENT_REFUNDED"] },
      },
      select: { action: true, metadata: true },
    })
  ).map((a) => a.action);
  for (const action of ["SENSITIVE_PROFILE_VIEWED", "SENSITIVE_PROFILE_UPDATED", "PAYMENT_RECEIVED", "RECEIPT_VOIDED", "PAYMENT_REFUNDED"]) {
    check(`AuditLog ${action}`, auditActions.includes(action));
  }

  // ── Fixture para el cron (se limpia en cleanup-cron.ts) ───────────────
  const cronTask = await prisma.task.create({
    data: {
      organizationId: org.id,
      title: `${MARK} cron fixture`,
      type: "FOLLOW_UP",
      assignedToId: ctx.userId,
      clientId: client.id,
      dueAt: new Date(Date.now() - 3600_000),
      reminderAt: new Date(Date.now() - 3600_000),
    },
  });
  console.log(`\nFixture cron (task): ${cronTask.id}`);

  // ── Limpieza (excepto fixture cron y AuditLogs) ───────────────────────
  console.log("\n[Limpieza]");
  await prisma.task.deleteMany({
    where: { organizationId: org.id, title: { contains: MARK }, NOT: { id: cronTask.id } },
  });
  const reviewTaskIds = (
    await prisma.task.findMany({
      where: { roundId: round1.id },
      select: { id: true },
    })
  ).map((t) => t.id);
  if (reviewTaskIds.length) {
    await prisma.task.deleteMany({ where: { id: { in: reviewTaskIds } } });
  }
  // Cliente en cascada: casos, rondas, cotizaciones (+ítems/eventos),
  // pagos, recibos, perfil sensible, activity logs.
  await prisma.client.delete({ where: { id: client.id } });
  await prisma.servicePackage.delete({ where: { id: pkg.id } });
  await prisma.service.delete({ where: { id: service.id } });
  console.log("  datos de prueba eliminados (fixture cron y AuditLogs conservados)");

  console.log(`\nRESULTADO: ${passed} verificaciones OK, ${failed} fallidas`);
  console.log(`CRON_FIXTURE_TASK_ID=${cronTask.id}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("FALLO en smoke test:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
