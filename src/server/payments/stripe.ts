/**
 * AU-005 — Stripe Checkout (keys por organización).
 */
import type { OrganizationContext } from "@/src/server/auth/guards";
import { writeActivityLog } from "@/src/server/activity";
import { nextReceiptFolio } from "@/src/server/folios";
import { DomainError } from "@/src/server/errors";
import { decrypt } from "@/src/lib/security/encryption";
import { prisma } from "@/src/lib/db";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";

const money = (v: Prisma.Decimal) =>
  v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export type StripeOrgSettings = {
  stripeEnabled: boolean;
  stripeSecretKeyEncrypted: string | null;
  stripeWebhookSecretEncrypted: string | null;
  stripePublishableKey: string | null;
};

/** Opt-out de emergencia: FEATURE_CONSULTATION_PAYMENTS=false bloquea cobros de consulta. */
export function isConsultationPaymentsEnvBlocked(): boolean {
  return process.env.FEATURE_CONSULTATION_PAYMENTS === "false";
}

export function isStripeConfigured(settings: StripeOrgSettings): boolean {
  return Boolean(
    settings.stripeEnabled && settings.stripeSecretKeyEncrypted?.trim(),
  );
}

export async function getStripeSettings(
  organizationId: string,
): Promise<StripeOrgSettings | null> {
  return prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: {
      stripeEnabled: true,
      stripeSecretKeyEncrypted: true,
      stripeWebhookSecretEncrypted: true,
      stripePublishableKey: true,
    },
  });
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
}

function decryptSecret(encrypted: string, label: string): string {
  try {
    return decrypt(encrypted);
  } catch {
    throw new DomainError(
      `No se pudo leer ${label}. Vuelve a pegarlo en Configuración.`,
    );
  }
}

async function requireStripeClient(organizationId: string) {
  const settings = await getStripeSettings(organizationId);
  if (!settings || !isStripeConfigured(settings)) {
    throw new DomainError(
      "Stripe no está configurado. Actívalo en Configuración y guarda la secret key.",
    );
  }
  const secret = decryptSecret(
    settings.stripeSecretKeyEncrypted!,
    "la secret key de Stripe",
  );
  return {
    stripe: createStripeClient(secret),
    settings,
    webhookSecret: settings.stripeWebhookSecretEncrypted
      ? decryptSecret(
          settings.stripeWebhookSecretEncrypted,
          "el webhook secret de Stripe",
        )
      : null,
  };
}

function toStripeAmountCents(amount: Prisma.Decimal, currency: string): number {
  const major = money(amount);
  // USD etc. two decimals
  const cents = major.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  const n = Number(cents.toString());
  if (!Number.isFinite(n) || n < 50) {
    throw new DomainError(
      `El monto mínimo de Stripe es 0.50 ${currency.toUpperCase()}.`,
    );
  }
  return n;
}

export async function startConsultationCheckout(
  ctx: OrganizationContext,
  consultationId: string,
): Promise<{ url: string; sessionId: string }> {
  if (isConsultationPaymentsEnvBlocked()) {
    throw new DomainError(
      "Los cobros de consulta están desactivados (FEATURE_CONSULTATION_PAYMENTS=false).",
    );
  }

  const consultation = await prisma.consultation.findFirst({
    where: { id: consultationId, organizationId: ctx.organizationId },
    include: {
      client: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
  if (!consultation) throw new DomainError("Consulta no encontrada.");
  if (
    consultation.status !== "REQUESTED" &&
    consultation.status !== "PAYMENT_PENDING"
  ) {
    throw new DomainError(
      "Solo se puede cobrar una consulta solicitada o pendiente de pago.",
    );
  }
  if (consultation.paymentId) {
    throw new DomainError("Esta consulta ya tiene un pago ligado.");
  }

  const { stripe } = await requireStripeClient(ctx.organizationId);
  const base = appBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: consultation.client.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: consultation.currency.toLowerCase(),
          unit_amount: toStripeAmountCents(
            money(consultation.amount),
            consultation.currency,
          ),
          product_data: {
            name: `Consulta — ${[consultation.client.firstName, consultation.client.lastName].filter(Boolean).join(" ") || "cliente"}`,
          },
        },
      },
    ],
    success_url: `${base}/pay/success?kind=consultation&id=${consultation.id}`,
    cancel_url: `${base}/pay/cancel?kind=consultation&id=${consultation.id}`,
    metadata: {
      organizationId: ctx.organizationId,
      kind: "consultation",
      consultationId: consultation.id,
      clientId: consultation.clientId,
    },
  });

  if (!session.url) {
    throw new DomainError("Stripe no devolvió URL de Checkout.");
  }

  await prisma.consultation.update({
    where: { id: consultation.id },
    data: {
      status: "PAYMENT_PENDING",
      stripeCheckoutSessionId: session.id,
    },
  });

  return { url: session.url, sessionId: session.id };
}

export async function startQuoteCheckout(
  ctx: OrganizationContext,
  quoteId: string,
): Promise<{ url: string; sessionId: string }> {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, organizationId: ctx.organizationId },
    include: {
      client: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
  if (!quote) throw new DomainError("Cotización no encontrada.");
  if (quote.status !== "SENT" && quote.status !== "PARTIAL" && quote.status !== "ACCEPTED") {
    throw new DomainError(
      "Solo se puede generar link de pago para cotizaciones enviadas, parciales o aceptadas.",
    );
  }

  const received = await prisma.payment.aggregate({
    where: { quoteId: quote.id, status: "RECEIVED" },
    _sum: { amount: true },
  });
  const paid = money(received._sum.amount ?? new Prisma.Decimal(0));
  const balance = money(money(quote.total).sub(paid));
  if (balance.lte(0)) {
    throw new DomainError("Esta cotización ya está saldada.");
  }

  const { stripe } = await requireStripeClient(ctx.organizationId);
  const base = appBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: quote.client.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: quote.currency.toLowerCase(),
          unit_amount: toStripeAmountCents(balance, quote.currency),
          product_data: {
            name: `Cotización ${quote.folio}`,
            description: `Saldo pendiente`,
          },
        },
      },
    ],
    success_url: `${base}/pay/success?kind=quote&id=${quote.id}`,
    cancel_url: `${base}/pay/cancel?kind=quote&id=${quote.id}`,
    metadata: {
      organizationId: ctx.organizationId,
      kind: "quote",
      quoteId: quote.id,
      clientId: quote.clientId,
      caseId: quote.caseId ?? "",
    },
  });

  if (!session.url) {
    throw new DomainError("Stripe no devolvió URL de Checkout.");
  }

  return { url: session.url, sessionId: session.id };
}

/**
 * Genera Checkout de cotización y envía el link al WhatsApp del cliente (Whapi).
 */
export async function sendQuoteCheckoutWhatsapp(
  ctx: OrganizationContext,
  quoteId: string,
): Promise<{ url: string; to: string }> {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, organizationId: ctx.organizationId },
    include: {
      client: {
        select: { id: true, phone: true, firstName: true, lastName: true },
      },
    },
  });
  if (!quote) throw new DomainError("Cotización no encontrada.");
  if (!quote.client.phone?.trim()) {
    throw new DomainError(
      "El cliente no tiene teléfono. Añádelo en la ficha y vuelve a intentar.",
    );
  }

  const orgSettings = await prisma.organizationSettings.findUnique({
    where: { organizationId: ctx.organizationId },
    select: {
      whapiEnabled: true,
      whapiTokenEncrypted: true,
      whapiBaseUrl: true,
      legalName: true,
      phone: true,
    },
  });
  const { isWhapiConfigured, sendWhapiText, formatClientWhatsappMessage } =
    await import("@/src/server/notifications/whapi");
  if (!orgSettings || !isWhapiConfigured(orgSettings)) {
    throw new DomainError(
      "Whapi no está configurado. Actívalo en Configuración → Notificaciones.",
    );
  }
  const { decrypt } = await import("@/src/lib/security/encryption");
  let token: string;
  try {
    token = decrypt(orgSettings.whapiTokenEncrypted!);
  } catch {
    throw new DomainError(
      "No se pudo leer el token de Whapi. Vuelve a pegarlo en Configuración.",
    );
  }

  const { url } = await startQuoteCheckout(ctx, quoteId);
  const legalName = orgSettings.legalName || "J&H Multiservices LLC";
  const body = formatClientWhatsappMessage({
    legalName,
    firstName: quote.client.firstName,
    body: `Tu link de pago para la cotización ${quote.folio}:\n${url}\n\nSi ya pagaste, ignora este mensaje.`,
    companyPhone: orgSettings.phone,
  });
  await sendWhapiText({
    token,
    baseUrl: orgSettings.whapiBaseUrl,
    to: quote.client.phone,
    body,
  });

  return { url, to: quote.client.phone };
}

/**
 * Genera Checkout de consulta y envía el link al WhatsApp del cliente.
 */
export async function sendConsultationCheckoutWhatsapp(
  ctx: OrganizationContext,
  consultationId: string,
): Promise<{ url: string; to: string }> {
  const consultation = await prisma.consultation.findFirst({
    where: { id: consultationId, organizationId: ctx.organizationId },
    include: {
      client: {
        select: { id: true, phone: true, firstName: true },
      },
    },
  });
  if (!consultation) throw new DomainError("Consulta no encontrada.");
  if (!consultation.client.phone?.trim()) {
    throw new DomainError(
      "El cliente no tiene teléfono. Añádelo en la ficha y vuelve a intentar.",
    );
  }

  const orgSettings = await prisma.organizationSettings.findUnique({
    where: { organizationId: ctx.organizationId },
    select: {
      whapiEnabled: true,
      whapiTokenEncrypted: true,
      whapiBaseUrl: true,
      legalName: true,
      phone: true,
    },
  });
  const { isWhapiConfigured, sendWhapiText, formatClientWhatsappMessage } =
    await import("@/src/server/notifications/whapi");
  if (!orgSettings || !isWhapiConfigured(orgSettings)) {
    throw new DomainError(
      "Whapi no está configurado. Actívalo en Configuración → Notificaciones.",
    );
  }
  const { decrypt } = await import("@/src/lib/security/encryption");
  let token: string;
  try {
    token = decrypt(orgSettings.whapiTokenEncrypted!);
  } catch {
    throw new DomainError(
      "No se pudo leer el token de Whapi. Vuelve a pegarlo en Configuración.",
    );
  }

  const { url } = await startConsultationCheckout(ctx, consultationId);
  const legalName = orgSettings.legalName || "J&H Multiservices LLC";
  const body = formatClientWhatsappMessage({
    legalName,
    firstName: consultation.client.firstName,
    body: `Tu link de pago de consulta:\n${url}\n\nSi ya pagaste, ignora este mensaje.`,
    companyPhone: orgSettings.phone,
  });
  await sendWhapiText({
    token,
    baseUrl: orgSettings.whapiBaseUrl,
    to: consultation.client.phone,
    body,
  });

  return { url, to: consultation.client.phone };
}

export async function handleStripeWebhook(
  organizationId: string,
  rawBody: string,
  signature: string,
): Promise<{ handled: boolean; kind?: string }> {
  const { stripe, webhookSecret } = await requireStripeClient(organizationId);
  if (!webhookSecret) {
    throw new DomainError(
      "Falta el webhook secret de Stripe en Configuración.",
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    throw new DomainError("Firma de webhook Stripe inválida.");
  }

  if (event.type !== "checkout.session.completed") {
    return { handled: false };
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid" && session.status !== "complete") {
    return { handled: false };
  }

  const meta = session.metadata ?? {};
  if (meta.organizationId && meta.organizationId !== organizationId) {
    throw new DomainError("organizationId del metadata no coincide.");
  }

  const sessionId = session.id;
  const existing = await prisma.payment.findFirst({
    where: { organizationId, stripeCheckoutSessionId: sessionId },
  });
  if (existing) {
    return { handled: true, kind: meta.kind ?? "duplicate" };
  }

  const amountTotal = session.amount_total;
  if (amountTotal == null || amountTotal <= 0) {
    throw new DomainError("Sesión Stripe sin monto.");
  }
  const amount = money(new Prisma.Decimal(amountTotal).div(100));
  const currency = (session.currency ?? "usd").toUpperCase();
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  if (meta.kind === "consultation" && meta.consultationId) {
    await fulfillConsultationPayment({
      organizationId,
      consultationId: meta.consultationId,
      clientId: meta.clientId,
      amount,
      currency,
      sessionId,
      paymentIntentId,
    });
    return { handled: true, kind: "consultation" };
  }

  if (meta.kind === "quote" && meta.quoteId) {
    await fulfillQuotePayment({
      organizationId,
      quoteId: meta.quoteId,
      clientId: meta.clientId,
      caseId: meta.caseId || null,
      amount,
      currency,
      sessionId,
      paymentIntentId,
    });
    return { handled: true, kind: "quote" };
  }

  return { handled: false };
}

async function fulfillConsultationPayment(input: {
  organizationId: string;
  consultationId: string;
  clientId: string;
  amount: Prisma.Decimal;
  currency: string;
  sessionId: string;
  paymentIntentId: string | null;
}) {
  const consultation = await prisma.consultation.findFirst({
    where: {
      id: input.consultationId,
      organizationId: input.organizationId,
    },
  });
  if (!consultation) {
    throw new DomainError("Consulta no encontrada en webhook.");
  }
  if (consultation.paymentId) return;

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        organizationId: input.organizationId,
        clientId: consultation.clientId,
        amount: input.amount,
        currency: input.currency,
        method: "STRIPE",
        status: "RECEIVED",
        receivedAt: new Date(),
        reference: input.sessionId,
        notes: "Pago Stripe (consulta)",
        stripeCheckoutSessionId: input.sessionId,
        stripePaymentIntentId: input.paymentIntentId,
      },
    });

    const { folio, folioNumber } = await nextReceiptFolio(
      tx,
      input.organizationId,
    );
    await tx.receipt.create({
      data: {
        organizationId: input.organizationId,
        paymentId: payment.id,
        clientId: consultation.clientId,
        folioNumber,
        folio,
        amount: input.amount,
        currency: input.currency,
        paymentMethod: "STRIPE",
      },
    });

    await tx.consultation.update({
      where: { id: consultation.id },
      data: {
        status: "PAID",
        paymentId: payment.id,
        stripeCheckoutSessionId: input.sessionId,
      },
    });

    await writeActivityLog(
      { organizationId: input.organizationId, actorUserId: null },
      {
        type: "PAYMENT_RECORDED",
        description: `Consulta pagada con Stripe (${input.amount.toString()} ${input.currency}).`,
        clientId: consultation.clientId,
        metadata: {
          consultationId: consultation.id,
          paymentId: payment.id,
          stripeCheckoutSessionId: input.sessionId,
        },
      },
      tx,
    );
  });
}

async function fulfillQuotePayment(input: {
  organizationId: string;
  quoteId: string;
  clientId: string;
  caseId: string | null;
  amount: Prisma.Decimal;
  currency: string;
  sessionId: string;
  paymentIntentId: string | null;
}) {
  const quote = await prisma.quote.findFirst({
    where: { id: input.quoteId, organizationId: input.organizationId },
  });
  if (!quote) throw new DomainError("Cotización no encontrada en webhook.");

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        organizationId: input.organizationId,
        clientId: quote.clientId,
        caseId: quote.caseId ?? input.caseId,
        quoteId: quote.id,
        amount: input.amount,
        currency: input.currency,
        method: "STRIPE",
        status: "RECEIVED",
        receivedAt: new Date(),
        reference: input.sessionId,
        notes: "Pago Stripe (cotización)",
        stripeCheckoutSessionId: input.sessionId,
        stripePaymentIntentId: input.paymentIntentId,
      },
    });

    const { folio, folioNumber } = await nextReceiptFolio(
      tx,
      input.organizationId,
    );
    await tx.receipt.create({
      data: {
        organizationId: input.organizationId,
        paymentId: payment.id,
        clientId: quote.clientId,
        folioNumber,
        folio,
        amount: input.amount,
        currency: input.currency,
        paymentMethod: "STRIPE",
      },
    });

    const received = await tx.payment.aggregate({
      where: { quoteId: quote.id, status: "RECEIVED" },
      _sum: { amount: true },
    });
    const paid = money(received._sum.amount ?? new Prisma.Decimal(0));
    const total = money(quote.total);
    const nextStatus =
      paid.gte(total) ? "PAID" : paid.gt(0) ? "PARTIAL" : quote.status;

    if (nextStatus !== quote.status) {
      await tx.quote.update({
        where: { id: quote.id },
        data: { status: nextStatus },
      });
    }

    await tx.quoteEvent.create({
      data: {
        organizationId: input.organizationId,
        quoteId: quote.id,
        type: "PAYMENT_RECORDED",
        description: `Pago Stripe: ${input.amount.toString()} ${input.currency}.`,
        metadata: {
          paymentId: payment.id,
          stripeCheckoutSessionId: input.sessionId,
        },
      },
    });

    await writeActivityLog(
      { organizationId: input.organizationId, actorUserId: null },
      {
        type: "PAYMENT_RECORDED",
        description: `Pago Stripe de cotización ${quote.folio} (${input.amount.toString()} ${input.currency}).`,
        clientId: quote.clientId,
        caseId: quote.caseId,
        metadata: {
          quoteId: quote.id,
          paymentId: payment.id,
          stripeCheckoutSessionId: input.sessionId,
        },
      },
      tx,
    );
  });
}

export function stripeWebhookUrl(organizationId: string): string {
  return `${appBaseUrl()}/api/webhooks/stripe/${organizationId}`;
}

/** Helper para UI/tests: ¿puede cobrarse consulta en esta org? */
export async function isOrgStripeReadyForConsultations(
  organizationId: string,
): Promise<boolean> {
  if (isConsultationPaymentsEnvBlocked()) return false;
  const settings = await getStripeSettings(organizationId);
  return Boolean(settings && isStripeConfigured(settings));
}
