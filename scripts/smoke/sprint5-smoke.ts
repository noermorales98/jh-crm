/**
 * Smoke SPRINT 5 — planes de pago, consultas, automatizaciones.
 *
 *   npm run smoke:sprint5
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as cases from "../../src/server/cases";
import * as rounds from "../../src/server/rounds";
import * as paymentPlans from "../../src/server/payment-plans";
import * as consultations from "../../src/server/consultations";
import * as automations from "../../src/server/automations";

const prisma = new PrismaClient();
const MARK = "S5-SMOKE";
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

  let clientId: string | null = null;
  let planId: string | null = null;
  let consultationId: string | null = null;
  let caseId: string | null = null;
  let roundId: string | null = null;

  try {
    console.log("\n[1] Payment plan — 3 monthly installments → 3 PENDING payments");
    const client = await clients.createClient(ctx, {
      firstName: `${MARK} Luis`,
      lastName: "Cuotas",
      email: `s5-smoke-${Date.now()}@example.com`,
      phone: "3125550205",
      addressLine1: "200 Main St",
      city: "Houston",
      state: "TX",
      postalCode: "77002",
    });
    clientId = client.id;

    const startDate = new Date();
    startDate.setUTCHours(12, 0, 0, 0);

    const plan = await paymentPlans.createPaymentPlan(ctx, {
      clientId: client.id,
      totalAmount: 300,
      numberOfInstallments: 3,
      frequency: "MONTHLY",
      startDate,
      notes: `${MARK} plan`,
    });
    planId = plan.id;
    check("createPaymentPlan ACTIVE", plan.status === "ACTIVE");
    check("3 installments", plan.installments.length === 3, plan.installments.length);

    const pendingPayments = await prisma.payment.findMany({
      where: {
        organizationId: org.id,
        clientId: client.id,
        status: "PENDING",
        notes: { contains: "Cuota" },
      },
    });
    check("3 PENDING payments", pendingPayments.length === 3, pendingPayments.length);

    const due0 = paymentPlans.addInstallmentDate(startDate, "MONTHLY", 0);
    const due1 = paymentPlans.addInstallmentDate(startDate, "MONTHLY", 1);
    const due2 = paymentPlans.addInstallmentDate(startDate, "MONTHLY", 2);
    check(
      "addInstallmentDate monthly spacing",
      due1.getUTCMonth() !== due0.getUTCMonth() ||
        due1.getUTCFullYear() !== due0.getUTCFullYear(),
    );
    check("installment 3 due after 2", due2.getTime() > due1.getTime());

    console.log("\n[2] Cancel plan cancels pending installments + payments");
    await paymentPlans.cancelPaymentPlan(ctx, plan.id, "smoke cancel");
    const cancelledPlan = await prisma.paymentPlan.findUniqueOrThrow({
      where: { id: plan.id },
    });
    check("plan CANCELLED", cancelledPlan.status === "CANCELLED");

    const instAfter = await prisma.paymentInstallment.findMany({
      where: { planId: plan.id },
    });
    check(
      "installments CANCELLED",
      instAfter.every((i) => i.status === "CANCELLED"),
      instAfter.map((i) => i.status),
    );

    const payAfter = await prisma.payment.findMany({
      where: { id: { in: pendingPayments.map((p) => p.id) } },
    });
    check(
      "linked payments CANCELLED",
      payAfter.every((p) => p.status === "CANCELLED"),
      payAfter.map((p) => p.status),
    );

    console.log("\n[3] Consultation stays REQUESTED (no fake PAID)");
    check(
      "gateway not configured",
      consultations.isConsultationPaymentConfigured() === false,
    );
    const consultation = await consultations.requestConsultation(ctx, {
      clientId: client.id,
      amount: 1,
      notes: `${MARK} consulta`,
    });
    consultationId = consultation.id;
    check("consultation REQUESTED", consultation.status === "REQUESTED");
    check("consultation never PAID", consultation.status !== "PAID");

    console.log("\n[4] onNewLead creates FOLLOW_UP task");
    const leadClient = await clients.createClient(ctx, {
      firstName: `${MARK} Lead`,
      lastName: "Auto",
      email: `s5-lead-${Date.now()}@example.com`,
      phone: "3125550206",
      status: "LEAD",
    });
    const task = await automations.onNewLead(org.id, leadClient.id);
    check("follow-up task created", Boolean(task?.id));
    check("task type FOLLOW_UP", task?.type === "FOLLOW_UP");
    check(
      "task mentions Nuevo lead",
      Boolean(
        task?.title.includes("Nuevo lead") ||
          task?.description?.includes("Nuevo lead"),
      ),
    );
    const again = await automations.onNewLead(org.id, leadClient.id);
    check("onNewLead idempotent", again?.id === task?.id);

    // cleanup lead client tasks + client
    if (task) {
      await prisma.task.deleteMany({ where: { clientId: leadClient.id } });
    }
    await prisma.client.delete({ where: { id: leadClient.id } }).catch(() => undefined);

    console.log("\n[5] markRoundSent → expectedReviewAt + onRoundSent task");
    const creditCase = await cases.createCreditCase(ctx, {
      clientId: client.id,
      summary: `${MARK} caso`,
    });
    caseId = creditCase.id;
    const round = await rounds.createRound(ctx, { caseId: creditCase.id });
    roundId = round.id;

    const reviewAt = new Date();
    reviewAt.setUTCDate(reviewAt.getUTCDate() + 30);
    const sent = await rounds.markRoundSent(ctx, round.id, {
      expectedReviewAt: reviewAt,
      createReviewTask: false,
    });
    check("round SENT", sent.round.status === "SENT");
    check("expectedReviewAt set", Boolean(sent.round.expectedReviewAt));

    const reviewTask = await prisma.task.findFirst({
      where: {
        organizationId: org.id,
        roundId: round.id,
        title: { contains: `Revisar ronda ${round.roundNumber}` },
      },
    });
    check("onRoundSent created review task", Boolean(reviewTask), reviewTask);

    // Direct onRoundSent with null expectedReviewAt path
    const round2 = await rounds.createRound(ctx, { caseId: creditCase.id });
    await prisma.creditRound.update({
      where: { id: round2.id },
      data: { status: "SENT", sentAt: new Date(), expectedReviewAt: null },
    });
    const auto = await automations.onRoundSent(ctx, {
      id: round2.id,
      organizationId: org.id,
      caseId: creditCase.id,
      roundNumber: round2.roundNumber,
      expectedReviewAt: null,
      case: {
        clientId: client.id,
        assignedToId: creditCase.assignedToId,
        caseCode: creditCase.caseCode,
      },
    });
    check("onRoundSent fills +30d", Boolean(auto?.expectedReviewAt));
    check("onRoundSent task", Boolean(auto?.task?.id));

    await prisma.task.deleteMany({ where: { roundId: round2.id } });
    await prisma.creditRound.delete({ where: { id: round2.id } });
  } finally {
    console.log("\n[cleanup]");
    if (consultationId) {
      await prisma.consultation.delete({ where: { id: consultationId } }).catch(() => undefined);
    }
    if (planId) {
      const insts = await prisma.paymentInstallment.findMany({
        where: { planId },
        select: { paymentId: true },
      });
      const paymentIds = insts.map((i) => i.paymentId).filter(Boolean) as string[];
      await prisma.paymentInstallment.deleteMany({ where: { planId } }).catch(() => undefined);
      await prisma.paymentPlan.delete({ where: { id: planId } }).catch(() => undefined);
      if (paymentIds.length) {
        await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } }).catch(() => undefined);
      }
    }
    if (roundId) {
      await prisma.task.deleteMany({ where: { roundId } }).catch(() => undefined);
      await prisma.creditRound.delete({ where: { id: roundId } }).catch(() => undefined);
    }
    if (caseId) {
      await prisma.task.deleteMany({ where: { caseId } }).catch(() => undefined);
      await prisma.creditRound.deleteMany({ where: { caseId } }).catch(() => undefined);
      await prisma.creditCase.delete({ where: { id: caseId } }).catch(() => undefined);
    }
    if (clientId) {
      await prisma.payment.deleteMany({
        where: { clientId, notes: { contains: "Cuota" } },
      }).catch(() => undefined);
      await prisma.notification.deleteMany({
        where: { link: "/crm/consultas", body: { contains: "smoke" } },
      }).catch(() => undefined);
      await prisma.activityLog.deleteMany({ where: { clientId } }).catch(() => undefined);
      await prisma.task.deleteMany({ where: { clientId } }).catch(() => undefined);
      await prisma.client.delete({ where: { id: clientId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }

  console.log(`\nResultado: ${passed} ok, ${failed} fallos`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
