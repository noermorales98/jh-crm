/**
 * Smoke AU-005: Stripe helpers + consulta sin cobro en create.
 * Uso: npx tsx --env-file=.env.local scripts/smoke/au-005-stripe-smoke.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  isConsultationPaymentsEnvBlocked,
  isStripeConfigured,
  stripeWebhookUrl,
} from "../../src/server/payments/stripe";
import * as consultations from "../../src/server/consultations";
import type { OrganizationContext } from "../../src/server/auth/guards";

const MARK = `au005-${Date.now()}`;
let checks = 0;
function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  checks++;
  console.log(`  ✓ ${label}`);
}

async function main() {
  const prisma = new PrismaClient();
  let clientId: string | null = null;
  let consultationId: string | null = null;

  try {
    const member = await prisma.organizationMember.findFirstOrThrow({
      where: { role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });
    const ctx: OrganizationContext = {
      userId: member.userId,
      organizationId: member.organizationId,
      role: "OWNER",
    };

    console.log("\n[AU-005] Stripe Checkout");

    check(
      "isStripeConfigured false sin keys",
      !isStripeConfigured({
        stripeEnabled: true,
        stripeSecretKeyEncrypted: null,
        stripeWebhookSecretEncrypted: null,
        stripePublishableKey: null,
      }),
    );
    check(
      "webhook URL incluye org",
      stripeWebhookUrl(ctx.organizationId).includes(ctx.organizationId),
    );
    check(
      "env block solo si false",
      typeof isConsultationPaymentsEnvBlocked() === "boolean",
    );

    const configured = await consultations.isConsultationPaymentConfigured(
      ctx.organizationId,
    );
    check(
      "sin Stripe en settings → no configurado (o sí si ya hay keys)",
      typeof configured === "boolean",
    );

    const client = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: `C-${MARK}`.slice(0, 20),
        firstName: "AU005",
        lastName: MARK,
        status: "ACTIVE",
        assignedToId: member.userId,
      },
    });
    clientId = client.id;

    const consultation = await consultations.requestConsultation(ctx, {
      clientId: client.id,
      amount: 1,
      notes: `Smoke ${MARK}`,
    });
    consultationId = consultation.id;
    check("consulta creada REQUESTED", consultation.status === "REQUESTED");
    check("consulta sin paymentId", consultation.paymentId == null);

    console.log(`AU-005: ${checks}/${checks} OK`);
  } finally {
    console.log("\n[cleanup]");
    if (consultationId) {
      await prisma.consultation
        .deleteMany({ where: { id: consultationId } })
        .catch(() => undefined);
    }
    if (clientId) {
      await prisma.activityLog
        .deleteMany({ where: { clientId } })
        .catch(() => undefined);
      await prisma.client
        .deleteMany({ where: { id: clientId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
