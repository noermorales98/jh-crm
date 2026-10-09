/**
 * PR-PY-IDEM — fulfill concurrente con el mismo stripeCheckoutSessionId.
 * Sin firma Stripe ni claves reales.
 *
 *   npm run smoke:stripe-idem
 */
import { Prisma, PrismaClient } from "@prisma/client";
import {
  fulfillConsultationPayment,
  isStripeCheckoutSessionUniqueConflict,
} from "../../src/server/payments/stripe";

const prisma = new PrismaClient();
const MARK = "PY-IDEM";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("Falta DATABASE_URL (sandbox).");
  }

  console.log("\n[PR-PY-IDEM] idempotencia Stripe session");

  const otherConflict = new Prisma.PrismaClientKnownRequestError("Unique", {
    code: "P2002",
    clientVersion: "smoke",
    meta: { target: ["email"] },
  });
  check(
    "P2002 de otro campo no se trata como session",
    isStripeCheckoutSessionUniqueConflict(otherConflict) === false,
  );
  const sessionConflict = new Prisma.PrismaClientKnownRequestError("Unique", {
    code: "P2002",
    clientVersion: "smoke",
    meta: { target: ["stripeCheckoutSessionId"] },
  });
  check(
    "P2002 de stripeCheckoutSessionId sí se reconoce",
    isStripeCheckoutSessionUniqueConflict(sessionConflict) === true,
  );

  const member = await prisma.organizationMember.findFirstOrThrow({
    where: { role: { in: ["OWNER", "ADMIN"] } },
    orderBy: { createdAt: "asc" },
    select: { userId: true, organizationId: true },
  });

  const sessionId = `cs_test_${MARK}_${Date.now()}`;
  const client = await prisma.client.create({
    data: {
      organizationId: member.organizationId,
      clientCode: `TMP-${Date.now().toString(36).slice(-6)}`,
      firstName: MARK,
      lastName: "Idem",
      email: `py-idem-${Date.now()}@example.com`,
      status: "ACTIVE",
      assignedToId: member.userId,
    },
    select: { id: true },
  });

  const consultation = await prisma.consultation.create({
    data: {
      organizationId: member.organizationId,
      clientId: client.id,
      amount: new Prisma.Decimal("1.00"),
      currency: "USD",
      status: "PAYMENT_PENDING",
    },
    select: { id: true },
  });

  const input = {
    organizationId: member.organizationId,
    consultationId: consultation.id,
    clientId: client.id,
    amount: new Prisma.Decimal("1.00"),
    currency: "USD",
    sessionId,
    paymentIntentId: `pi_${MARK}`,
  };

  try {
    await Promise.all([
      fulfillConsultationPayment(input),
      fulfillConsultationPayment(input),
    ]);

    const payments = await prisma.payment.findMany({
      where: {
        organizationId: member.organizationId,
        stripeCheckoutSessionId: sessionId,
      },
      select: { id: true },
    });
    check("un solo Payment para la sesión", payments.length === 1, payments);

    const receipts = await prisma.receipt.count({
      where: { paymentId: payments[0]!.id },
    });
    check("un solo recibo", receipts === 1);

    // Segunda ola secuencial (ya existe) no crea otro.
    await fulfillConsultationPayment(input);
    const again = await prisma.payment.count({
      where: { stripeCheckoutSessionId: sessionId },
    });
    check("tercera llamada sigue con un Payment", again === 1);
  } finally {
    const pays = await prisma.payment.findMany({
      where: { stripeCheckoutSessionId: sessionId },
      select: { id: true },
    });
    for (const p of pays) {
      await prisma.receipt.deleteMany({ where: { paymentId: p.id } });
      await prisma.payment.delete({ where: { id: p.id } });
    }
    await prisma.consultation.delete({ where: { id: consultation.id } });
    await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log("\nOK stripe-webhook-idempotency\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  void prisma.$disconnect();
});
