# J&H Multiservices LLC — CRM interno

CRM operativo interno para **J&H Multiservices LLC**: gestión de clientes, casos
de crédito con pipeline de etapas, rondas de disputa, tareas con recordatorios,
catálogo de servicios y paquetes, cotizaciones con PDF, pagos y recibos con
folio, usuarios/roles, auditoría de eventos sensibles y configuración de la
organización.

## Stack

- **Next.js 16.3.4** (App Router, route handlers, server actions) + **React 19**
- **TypeScript strict** + **Tailwind CSS 4**
- **Prisma 6.19** sobre **MySQL** remoto
- **NextAuth v5** (Credentials, sesión JWT, bcryptjs)
- PDFs con jsPDF; subida de archivos a S3 (pendiente de configurar, ver abajo)

## Setup rápido

```bash
npm install                      # postinstall ejecuta prisma generate
cp .env.example .env.local       # rellenar valores (ver abajo)
npm run db:deploy                # aplica migraciones a la base MySQL
npx tsx --env-file=.env.local scripts/bootstrap.ts
                                 # crea organización, etapas, settings y usuario OWNER
npm run dev                      # http://localhost:3000
```

Login con `BOOTSTRAP_OWNER_EMAIL` / `BOOTSTRAP_OWNER_PASSWORD` definidos en
`.env.local` (el script de bootstrap crea ese usuario OWNER).

### Variables de entorno

`.env.example` documenta todas las variables. Las imprescindibles:

- `DATABASE_URL` — MySQL remoto.
- `AUTH_SECRET` — secreto de sesión NextAuth.
- `CRON_SECRET` — Bearer token para `GET /api/cron/reminders`, `GET /api/cron/digest`, `GET /api/cron/mails-sync` y `GET /api/cron/retention`.
- `BOOTSTRAP_OWNER_EMAIL` / `BOOTSTRAP_OWNER_PASSWORD` / `BOOTSTRAP_OWNER_NAME`.
- `OPENROUTER_API_KEY` — chat de IA en el CRM (modelos gratuitos). Opcional: `OPENROUTER_API_KEY_SECONDARY`.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm run start` | Build y arranque de producción |
| `npm run lint` | ESLint |
| `npm run db:generate` | Regenerar Prisma Client |
| `npm run db:migrate` | Migraciones en desarrollo |
| `npm run db:deploy` | Aplicar migraciones (producción) |
| `npm run db:studio` | Prisma Studio |
| `npm run smoke:credit-reports` | Smoke de reportes de crédito (SPRINT 1) |
| `npm run smoke:disputes-comparisons` | Smoke de disputas y comparaciones (SPRINT 2) |
| `npm run smoke:letters` | Smoke de cartas / reporte visual (SPRINT 3) |
| `npm run smoke:sprint4` | Smoke intake/procesadores/oportunidades/atribución (SPRINT 4) |
| `npm run smoke:sprint5` | Smoke planes de pago / consultas / automatizaciones (SPRINT 5) |
| `npm run smoke:sprint6` | Smoke MFA / retención / portal (SPRINT 6) |
| `npm run smoke:sprint8` | Smoke legales / privacidad en contacto (SPRINT 8) |
| `npm run seed:demo-credit` | Seed DEMO persistente (cliente + caso completo) |

Scripts auxiliares en `scripts/`:

- `bootstrap.ts` — inicializa la organización y el usuario OWNER.
- `smoke/` — fixtures y verificaciones de humo (dominio, UI, finanzas, HTTP,
  E2E integral `e2e-flow.ts`, verificación en navegador `browser-verify.mjs`),
  cada uno con su cleanup correspondiente.

## Asistente de IA

El CRM incluye un chat flotante (esquina inferior derecha) que usa modelos
gratuitos de [OpenRouter](https://openrouter.ai/keys) (`openrouter/free`).
Responde con datos de la organización (clientes, casos, cotizaciones, pagos),
la configuración de la empresa y las rutas para guiar al usuario con enlaces
`/crm/...`. Requiere sesión; no expone SSN descifrado ni secretos.

`OPENROUTER_API_KEY_SECONDARY` se usa si la clave primaria responde 429/402/401.

## Reportes de crédito (SPRINT 1)

Dominio operativo normalizado (sin parseo automático de PDF):

- `CreditReport` — metadata del reporte (tipo INITIAL/UPDATE/MANUAL, fecha, proveedor, documento opcional).
- `CreditBureauSnapshot` — scores y contadores por buró (Experian / Equifax / TransUnion).
- `CreditItem` — cuentas/elementos con número **enmascarado** (nunca SSN ni cuenta completa).

UI en el caso: `/crm/casos/[caseId]/credito` (evolución de scores + listado) y
`/crm/casos/[caseId]/credito/reportes/[reportId]` (detalle e ítems).

Migración: `prisma/migrations/20260904190000_credit_reports_sprint1`.

Smoke: `npx tsx --env-file=.env.local scripts/smoke/credit-reports-smoke.ts`.

Los contadores `CreditRound.disputedItemsCount` se sincronizan desde
`DisputeItem` (no CANCELLED). `lettersCount` sigue siendo manual hasta el
sprint de cartas.

## Disputas y comparación (SPRINT 2)

- `DisputeItem` — elementos exactos incluidos en una ronda (motivo, status, outcome).
- Detalle de ronda: `/crm/casos/[caseId]/rondas/[roundId]` con resumen de resultados.
- `ReportComparison` + `ReportComparisonItem` — comparación base vs actualizado con override manual.
- Pantalla: `/crm/casos/[caseId]/comparaciones/[comparisonId]`.

Migración: `prisma/migrations/20260904200000_dispute_items_and_comparisons`.

Smoke: `npm run smoke:disputes-comparisons`.

Datos DEMO (persistentes): `npm run seed:demo-credit`.

## Cartas y reporte visual (SPRINT 3)

- `DisputeLetterTemplate` — plantillas con variables `{{client.fullName}}`, `{{bureau}}`, etc.
- `DisputeLetter` — borrador → revisión humana → FINAL → SENT (sin PDF en S3).
- Vista HTML: `/crm/casos/[caseId]/rondas/[roundId]/cartas/[letterId]`
- PDF on-demand: `GET /api/letters/[letterId]/pdf` (attachment local, no se guarda en el bucket).
- `ClientProgressReport` — snapshot en BD; vista HTML `/crm/casos/[caseId]/reportes/[reportId]`;
  PDF `GET /api/progress-reports/[reportId]/pdf`. Historial en ronda y pestaña Crédito.
- UI: detalle de ronda (`Generar carta`, `Reporte visual`) y pestaña Crédito.

Migraciones: `20260904210000_dispute_letters_sprint3`, `20260904220000_client_progress_reports`.

Smoke: `npm run smoke:letters`.

## SPRINT 4 — Intake, procesadores, atribución, pipeline comercial

- **Intake avanzado:** payload especializado (`payloadJson`), objetivos/flags, categorías de documento (no todo OTHER).
- **Procesadores:** catálogo `CreditProcessor` + `ClientProcessorAccount` (`/crm/procesadores`); `ExternalReference` se mantiene.
- **Atribución:** `Client.attribution` JSON + `leadChannel`; formulario de contacto captura UTM; dashboard `/crm/atribucion`.
- **Pipeline comercial:** `Opportunity` con etapas NEW_LEAD…WON/LOST; Kanban `/crm/oportunidades`; WON → CreditCase + cliente ACTIVE.

Migración: `prisma/migrations/20260904230000_sprint4_intake_processors_ops`.

Smoke: `npm run smoke:sprint4`.

## SPRINT 5 — Planes de pago, consultas, automatizaciones

- **Planes de pago:** `PaymentPlan` + `PaymentInstallment`; UI `/crm/planes-pago`. Al crear un plan se generan N pagos PENDING. Al recibir un pago ligado, la cuota pasa a PAID y el plan a COMPLETED si aplica.
- **Consultas:** `Consultation` desde el formulario de contacto ($1, estado REQUESTED). CRM `/crm/consultas`. Nunca se marca PAID sin pasarela real (`FEATURE_CONSULTATION_PAYMENTS` + gateway).
- **Automatizaciones:** follow-up de lead, intake sin completar (>48 h), revisión de ronda, análisis de reporte UPDATE, documentos pendientes (cron).

Migración: ya aplicada (PaymentPlan / Consultation / enums de actividad y notificación).

Smoke: `npm run smoke:sprint5`.

## SPRINT 6 — Portal, contratos, MFA, retención

- **Portal del cliente:** `ClientPortalAccess` separado del staff; rutas `/portal/*` (login, progreso, documentos, reportes, pagos). Flag `FEATURE_CLIENT_PORTAL` (default off). Invitar desde ficha de cliente (ADMIN/OWNER).
- **Contratos:** `ContractTemplate` + `ClientContract`; CRM `/crm/contratos`; firma desde portal cuando status SENT.
- **MFA (TOTP):** OWNER/ADMIN/SPECIALIST en `/crm/configuracion/seguridad`. Si `mfaEnabled`, login en 2 pasos (TOTP o recovery). Rate limit `login:${email}`: 10 / 15 min.
- **Retención:** `documentSoftDeleteRetentionDays` / `documentMaxRetentionDays` en Configuración → Empresa. Soft-delete programa `purgeAfter`; cron hard-deletea S3 + `hardDeletedAt`.

Migración: `prisma/migrations/20260905120000_sprint6_portal_contracts_mfa_retention`.

### Cron retención

- URL: `https://TU-DOMINIO/api/cron/retention`
- Método: `GET`
- Cada **día** (o cada hora)
- Header: `Authorization` = `Bearer $CRON_SECRET`
- Idempotente: no reprocesa documentos con `hardDeletedAt`.

Smoke: `npm run smoke:sprint6`.

## SPRINT 7 — Meta Lead Ads, dashboard crédito, IA

- **Meta Lead Ads:** `processMetaLead` + webhook `GET/POST /api/public/meta/leads`. Flag `FEATURE_META_LEAD_ADS` (default off). Dedupe por `MetaLeadEvent` (`organizationId` + `externalLeadId`). Crea/actualiza Client (`source=META`, canal FACEBOOK/INSTAGRAM), Opportunity NEW_LEAD, follow-up y notificación `META_LEAD`. POST exige `META_APP_SECRET` (HMAC `X-Hub-Signature-256`); Graph API opcional con `META_PAGE_ACCESS_TOKEN`.
- **Dashboard crédito:** widgets de atención (docs pendientes, reportes UPDATE 14d, rondas por preparar / esperando update, revisiones y pagos vencidos, leads 7d, conversiones WON 30d, ítems disputados / eliminados / actualizados) en `/crm/dashboard`.
- **IA:** tools `getCreditCaseDetail`, `listCreditAttention`, `searchCreditProgress`; reglas anti-SSN / no inventar eliminaciones; rutas de crédito, oportunidades, portal y contratos en knowledge.

Migración: ya aplicada (`MetaLeadEvent`, `NotificationType.META_LEAD`).

Smoke: `npm run smoke:sprint7`.

## SPRINT 8 — Website, legales, QA

- **Páginas legales (plantillas / borrador):** `/privacy`, `/terms`, `/cancellation`, `/refunds`, `/disclosures`, `/sms-terms` — marcadas como «requiere revisión legal»; públicas en `auth.config.ts`.
- **Landing:** footer con enlaces legales; sección «Cómo funciona» en 4 pasos; servicios con énfasis crediticio (sin promesas de puntaje/eliminaciones); LLC y web se mantienen.
- **Contacto:** checkbox obligatorio de privacidad + checkbox opcional de SMS (independientes). `sms_consent` en `Client.attribution`. Mensaje de éxito: «Solicitud recibida» / sin cobro (el cobro real solo con `FEATURE_CONSULTATION_PAYMENTS`).

### QA checklist (SPRINT 8)

- [ ] Abrir `/privacy` … `/sms-terms` sin login.
- [ ] Footer del landing enlaza las 6 páginas.
- [ ] Enviar contacto sin privacidad → error de validación.
- [ ] Con privacidad (SMS opcional) → «Solicitud recibida» y texto de que no se cobró.
- [ ] `npm run smoke:sprint8`
- [ ] `npx tsc --noEmit`

Smoke: `npm run smoke:sprint8`.

## Cron (cron-job.org)

No hay cron de Vercel (`vercel.json` / Cron Jobs del dashboard). Todo se dispara desde [cron-job.org](https://cron-job.org/en/) contra la URL de producción.
Crea **cuatro** jobs. Todos usan el header `Authorization: Bearer $CRON_SECRET`.

### Correos (IMAP)

- URL: `https://TU-DOMINIO/api/cron/mails-sync`
- Método: `GET`
- Cada **1 minuto**
- Header: `Authorization` = `Bearer $CRON_SECRET`
- Importa correos nuevos y avisa en la campana y por WhatsApp (si está activo).
- Idempotente: el mismo mensaje no se importa ni notifica dos veces.

### Recordatorios (tareas, revisiones, pagos)

- URL: `https://TU-DOMINIO/api/cron/reminders`
- Método: `GET`
- Cada **15 minutos**
- Idempotente: cada aviso lleva `dedupeKey` único (upsert), no se duplica.

### Resumen diario

- URL: `https://TU-DOMINIO/api/cron/digest`
- Método: `GET`
- Cada **hora** (el CRM solo envía si `digestEnabled` y la hora local de la organización coincide con la configurada en Notificaciones; default 08:00).
- Destinatarios: OWNER y ADMIN. El correo sale por el SMTP de Configuración → Notificaciones.

### Retención de documentos

- URL: `https://TU-DOMINIO/api/cron/retention`
- Método: `GET`
- Cada **día** (recomendado)
- Hard-delete S3 de documentos con `purgeAfter` vencido o retención máxima superada.

SMTP, hora del resumen y toggles de correo/WhatsApp: menú de usuario → **Notificaciones** (`/crm/configuracion/notificaciones`).

## Pendiente: almacenamiento S3

La subida/descarga de documentos (expediente de clientes, adjuntos de intake)
requiere un bucket S3-compatible. Hasta configurar `S3_ENDPOINT`, `S3_REGION`,
`S3_BUCKET`, `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY` en `.env.local`, esas
rutas (`/api/files/*`) responden con error controlado y el resto del CRM
funciona con normalidad. El intake público además está desactivado por defecto
(`FEATURE_PUBLIC_INTAKE=false`).
