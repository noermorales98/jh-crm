# AU-005 — Pagos online con Stripe Checkout

Fecha: 2026-09-16  
Proyecto: J&H CRM (`jh-crm`)  
Estado: diseño aprobado en chat (enfoque A); pendiente de tu revisión de este archivo

## Problema

Las consultas ($1) y las cotizaciones no tienen cobro con tarjeta. El formulario de contacto no debe cobrar; el staff cobra la consulta cuando corresponda. Las cotizaciones enviadas necesitan un link de pago online además del registro manual (Zelle, etc.).

## Decisiones cerradas

- Proveedor: **Stripe Checkout** (página hospedada) + webhooks.
- Claves en **OrganizationSettings** (cifradas), no solo env.
- **Consulta diferida:** contacto → `REQUESTED` sin cobro; staff dispara Checkout desde `/crm/consultas`.
- **Cotización:** staff genera Checkout por el **saldo pendiente** de una quote `SENT`.
- Webhook por org: `POST /api/webhooks/stripe/[organizationId]` (verifica firma con el webhook secret de esa org).
- Metadata de sesión: `organizationId`, `kind` (`consultation` | `quote`), `consultationId` o `quoteId`, `clientId`.
- Dedupe: no crear dos `Payment` para el mismo `stripeCheckoutSessionId` / `payment_intent`.
- Marcar consulta `PAID` a mano sigue **bloqueado** si Stripe no está configurado (comportamiento actual endurecido con gateway real).
- Kill-switch global opcional: `FEATURE_CONSULTATION_PAYMENTS=true` **no** es obligatorio si `stripeEnabled` + keys en org; el flag env, si está en `"false"`, puede desactivar cobros de consulta en todos lados (default: respetar solo settings de org; documentar env como override de emergencia).

**Default locked:** `isStripeConfigured(org)` = `stripeEnabled && stripeSecretKeyEncrypted`. El env `FEATURE_CONSULTATION_PAYMENTS` solo bloquea si está explícitamente `"false"` (opt-out de emergencia). Si ausente o `"true"`, manda la org.

## Fuera de alcance

- Hotmart / Skool / Stripe Connect.
- Payment Element embebido.
- Reembolsos desde UI.
- Cobro automático al enviar el formulario de contacto.
- Suscripciones / planes recurrentes vía Stripe.
- Portal del cliente iniciando el pago sin acción del staff (el link Checkout puede abrirse por el cliente una vez generado).

## Modelo de datos (aditivo)

### OrganizationSettings

| Campo | Tipo | Notas |
| --- | --- | --- |
| `stripeEnabled` | Boolean default false | Master switch |
| `stripeSecretKeyEncrypted` | String? Text | sk_… |
| `stripeWebhookSecretEncrypted` | String? Text | whsec_… |
| `stripePublishableKey` | String? | pk_… (no secreto) |

### Consultation

| Campo | Tipo | Notas |
| --- | --- | --- |
| `stripeCheckoutSessionId` | String? @unique | Sesión abierta / cobrada |

### Payment (o tabla auxiliar)

Opción elegida: columnas opcionales en `Payment`:

| Campo | Tipo | Notas |
| --- | --- | --- |
| `stripeCheckoutSessionId` | String? @unique | |
| `stripePaymentIntentId` | String? | |

`Consultation.paymentId` ya existe: al completar cobro se crea `Payment` RECEIVED method STRIPE y se liga.

## Flujos

```text
Consulta:
  REQUESTED --[staff Cobrar Stripe]--> PAYMENT_PENDING + Checkout URL
  PAYMENT_PENDING --[webhook completed]--> PAID + Payment RECEIVED

Cotización:
  SENT + balance>0 --[staff Link Stripe]--> Checkout URL
  webhook completed --> Payment RECEIVED (quoteId, clientId, caseId?)
```

Success/cancel URLs: `{APP_URL}/crm/consultas?stripe=…` y `{APP_URL}/crm/cotizaciones/{id}?stripe=…` (o páginas públicas mínimas de “pago recibido / cancelado” si el pagador no es staff — **default:** URLs públicas `/pay/success` y `/pay/cancel` genéricas + query, sin login).

## Módulos

| Archivo | Rol |
| --- | --- |
| `src/server/payments/stripe.ts` | Cliente Stripe, crear Checkout, verificar webhook |
| `src/lib/payments/consultation-gateway.ts` | `isConfigured` real vía settings org |
| `src/server/consultations/…` | Acción `startConsultationCheckout` |
| `src/server/quotes/…` o `payments/…` | Acción `startQuoteCheckout` |
| `app/api/webhooks/stripe/[organizationId]/route.ts` | Webhook |
| Settings UI | Keys + URL webhook a copiar |
| `scripts/smoke/au-005-stripe-smoke.ts` | Sin keys → skip; con mock/firma → paths |

## Seguridad

- No loguear secret keys ni payloads completos con PII innecesaria.
- Webhook: verificar firma Stripe; rechazar sin org / sin secret.
- Idempotencia estricta en webhook.
- Roles: solo OWNER/ADMIN configuran Stripe; SPECIALIST+ puede disparar cobro de consulta/quote según permisos de pagos existentes.

## Criterios de done

1. Migración aditiva + generate.
2. Settings guardan keys; webhook URL visible.
3. Consulta: REQUESTED → Checkout → (simulable) webhook → PAID + Payment.
4. Quote: link Checkout → webhook → Payment RECEIVED; balance baja.
5. Formulario de contacto **no** cobra.
6. Smoke + docs AU-005 DONE; PENDING apunta a AU-003 / P3.
7. Commit; push solo si se pide.

## Dependencia

AU-004 (Whapi) ya mergeado en local; este ticket es independiente en código.
