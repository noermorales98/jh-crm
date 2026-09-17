# AU-005 Stripe Checkout Implementation Plan

> **For agentic workers:** Implement inline task-by-task. Spec: `docs/superpowers/specs/2026-09-16-au005-stripe-checkout-design.md`

**Goal:** Stripe Checkout diferido para consultas + link de pago para cotizaciones; keys cifradas en org.

**Architecture:** `stripe` SDK; Checkout Sessions; webhook `/api/webhooks/stripe/[organizationId]`; Payment RECEIVED + Consultation PAID.

**Tech Stack:** stripe npm, Prisma, Next.js App Router.

## Tasks

1. `npm install stripe` + schema migration (settings + consultation session id + payment stripe ids)
2. `src/server/payments/stripe.ts` + update consultation-gateway
3. Domain: startConsultationCheckout, startQuoteCheckout, handleStripeWebhook
4. Actions + UI consultas/cotizaciones + settings
5. Webhook route + public success/cancel pages
6. Smoke + docs + commit

## Global

- Contact form never charges
- FEATURE_CONSULTATION_PAYMENTS=false blocks consultation checkout
- Idempotent webhook
