# AU-004 Whapi Client WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or implement inline task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar WhatsApp automático a clientes vía Whapi.Cloud con paridad de los 6 eventos AU-001, sin tocar CallMeBot del equipo.

**Architecture:** Token cifrado + toggles en `OrganizationSettings`; cliente `whapi.ts` (POST `/messages/text`); orquestación `client-whatsapp.ts` espejo de `client-emails.ts`; cron + `markQuoteSent`; UI en settings.

**Tech Stack:** Next.js App Router, Prisma/MySQL, fetch Bearer a `gate.whapi.cloud`, encrypt existente.

**Spec:** [`docs/superpowers/specs/2026-09-16-au004-whapi-client-whatsapp-design.md`](../specs/2026-09-16-au004-whapi-client-whatsapp-design.md)

## Global Constraints

- CallMeBot solo equipo; Whapi solo clientes.
- `to` = dígitos internacionales sin `+`.
- Dedupe `wa:client:…`; delay ≥ 1.5 s entre envíos en batch.
- Migración aditiva; push solo si se pide.
- Sin webhooks inbound, medios, ni AU-005 en este plan.

## File map

| File | Responsibility |
| --- | --- |
| `prisma/schema.prisma` + migration | Campos Whapi + toggles |
| `src/server/notifications/whapi.ts` | HTTP client + normalización |
| `src/server/notifications/client-whatsapp.ts` | 6 eventos + dedupe + delay |
| `src/server/config/index.ts` + `src/actions/config.ts` | Persistencia settings + test send |
| `src/components/config/settings-form.tsx` | UI |
| `src/server/quotes/index.ts` + cron reminders | Wiring |
| `scripts/smoke/client-whatsapp-smoke.ts` | Smoke |
| Docs PENDING / backlog / roadmap | DONE |

---

### Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (`OrganizationSettings`)
- Create: `prisma/migrations/20260916200000_au004_whapi_client/migration.sql`

- [ ] **Step 1:** Añadir campos al schema:

```prisma
  whapiEnabled                 Boolean  @default(false)
  whapiTokenEncrypted          String?  @db.Text
  whapiBaseUrl                 String?
  whatsappClientPaymentDue     Boolean  @default(false)
  whatsappClientDocsPending    Boolean  @default(false)
  whatsappClientQuoteSent      Boolean  @default(false)
  whatsappClientQuoteExpiring  Boolean  @default(false)
  whatsappClientCaseReview     Boolean  @default(false)
  whatsappClientRoundReview    Boolean  @default(false)
```

- [ ] **Step 2:** SQL aditivo `ALTER TABLE OrganizationSettings ADD COLUMN ...` para cada campo.

- [ ] **Step 3:** `npx prisma migrate deploy && npx prisma generate`

- [ ] **Step 4:** Commit `Añade columnas Whapi AU-004 en OrganizationSettings.`

---

### Task 2: Whapi HTTP client

**Files:**
- Create: `src/server/notifications/whapi.ts`
- Test: unit via smoke later

**Produces:**
- `normalizeWhapiTo(raw: string): string`
- `assertWhapiTo(raw: string): string`
- `isWhapiConfigured(settings): boolean`
- `sendWhapiText({ token, baseUrl?, to, body }): Promise<{ ok: true; messageId?: string }>`

- [ ] **Step 1:** Implementar normalización: strip no-digits; require 8–15 dígitos; rechazar si vacío.

- [ ] **Step 2:** `isWhapiConfigured`: `whapiEnabled && Boolean(whapiTokenEncrypted)`.

- [ ] **Step 3:** `sendWhapiText`: decrypt no — recibe token plano; `POST ${base}/messages/text` con Bearer; timeout 15s; no loguear token; `DomainError` si status ≥ 400.

- [ ] **Step 4:** Commit `Añade cliente HTTP Whapi para mensajes de texto.`

---

### Task 3: client-whatsapp domain

**Files:**
- Create: `src/server/notifications/client-whatsapp.ts`
- Consumes: `whapi.ts`, `createNotification`, prisma, decrypt from settings

**Produces:**
- `notifyClientQuoteSentWhatsapp(orgId, quoteId): Promise<"sent"|"skipped">`
- `sendClientWhatsappForOrg(orgId, now): Promise<{sent,skipped}>`
- `sendClientWhatsappAllOrgs(now)`

- [ ] **Step 1:** Copiar estructura de `client-emails.ts` sustituyendo email→phone, SMTP→Whapi, dedupe `wa:client:…`, toggles `whatsappClient*`.

- [ ] **Step 2:** Entre envíos exitosos en el loop del cron, `await sleep(1500)`.

- [ ] **Step 3:** Decrypt token con `decrypt(settings.whapiTokenEncrypted)` al enviar.

- [ ] **Step 4:** Commit `Orquesta WhatsApp a clientes con dedupe y ritmo.`

---

### Task 4: Config + actions + UI

**Files:**
- Modify: `src/server/config/index.ts`, `src/actions/config.ts`, settings page props, `settings-form.tsx`

- [ ] **Step 1:** Extender `updateOrganizationSettings` para campos Whapi (token opcional: solo escribe si no vacío).

- [ ] **Step 2:** Action `testWhapiSend({ to: string })` → requireRole OWNER/ADMIN → sendWhapiText mensaje de prueba.

- [ ] **Step 3:** UI: sección «WhatsApp a clientes (Whapi)» con enable, token, base URL, 6 checkboxes, prueba.

- [ ] **Step 4:** Commit `Expone Whapi en configuración del CRM.`

---

### Task 5: Wiring cron + quote sent

**Files:**
- Modify: `app/api/cron/reminders/route.ts`
- Modify: `src/server/quotes/index.ts` (junto a `notifyClientQuoteSent`)

- [ ] **Step 1:** Tras `sendClientEmailsAllOrgs`, llamar `sendClientWhatsappAllOrgs`.

- [ ] **Step 2:** Tras `notifyClientQuoteSent`, fire-and-forget `notifyClientQuoteSentWhatsapp`.

- [ ] **Step 3:** Commit `Dispara WhatsApp cliente desde cron y cotización enviada.`

---

### Task 6: Smoke + docs

**Files:**
- Create: `scripts/smoke/client-whatsapp-smoke.ts`
- Modify: `package.json`, `docs/04-BACKLOG.md`, `docs/05-ROADMAP.md`, `docs/PENDING_IMPLEMENTATION.md`

- [ ] **Step 1:** Smoke: `normalizeWhapiTo`, sin config → skip, dedupe claim path (mock send o toggle off).

- [ ] **Step 2:** Docs AU-004 DONE; PENDING quita aplazamiento WA clientes.

- [ ] **Step 3:** `npx tsc --noEmit` + smoke + eslint tocados.

- [ ] **Step 4:** Commit final de docs/smoke si no van en commits previos.

---

## Spec coverage check

| Spec item | Task |
| --- | --- |
| Campos settings | 1 |
| whapi.ts | 2 |
| client-whatsapp + delay + dedupe | 3 |
| UI + test | 4 |
| cron + quote | 5 |
| smoke + docs | 6 |
| CallMeBot intacto | implícito (no tocar sendCallmebot salvo docs) |
| Sin webhooks | fuera de plan |
