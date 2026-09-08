# CURRENT STATE — Auditoría del repositorio actual

> Completado en la auditoría ARC-001 (2026-09-08). Snapshot del repo; no implica el diseño objetivo. Objetivo v1: [`ARCHITECTURE_V1.md`](ARCHITECTURE_V1.md).
> No se modificó código, schema ni producción durante esta auditoría.
> Fuentes: `prisma/schema.prisma`, `src/`, `app/`, `package.json`, `.env.example`, `docs/00`–`14` y `docs/99-SOURCE_REPORT.md`.

## 1. Stack encontrado

- Framework: Next.js **16.3.4** (App Router, Server Actions, Route Handlers) + React **19.2.8** + TypeScript.
- ORM: Prisma **6.19** (`prisma` + `@prisma/client`). Datasource MySQL. **20** migraciones.
- Auth: NextAuth **v5** (`next-auth@5.0.0-beta.32`), Credentials (staff + portal cliente), sesión JWT, `bcryptjs`, MFA con `otpauth` (enrolamiento existe; enforcement en login incompleto).
- UI: Tailwind CSS **4**, componentes propios en `src/components/ui/`, Lucide + Hugeicons, TipTap 3 (contratos/plantillas), `cuelume` / `blobatar`.
- DB: MySQL remoto. Documentación de producto indica Hostinger. Prisma usa solo `env("DATABASE_URL")`.
- Storage: S3-compatible (`@aws-sdk/client-s3` + presigner). Variables `S3_*` (no `STORAGE_*`). Pensado para Cloudflare R2 u otro endpoint S3.
- Otros: OpenRouter (`ai` SDK + `@openrouter/ai-sdk-provider`) para chat CRM; jsPDF; IMAP (`imapflow`/`mailparser`) + nodemailer; Zod; cron externo (cron-job.org) contra `/api/cron/*`. No hay `vercel.json`.

Nombre del paquete: `jh-multiservices-crm` (`package.json`).

## 2. Estructura de carpetas

```text
app/
  (auth)/login/          login staff
  (marketing)/           landing + legales
  crm/                   shell del CRM (~49 páginas)
  portal/                portal cliente (feature flag)
  intake/[token]/        intake público
  api/                   auth, AI, cron, files/S3, PDFs, public (contact/intake/meta)
  mails/                 vacío (código muerto de ruta; mails reales en app/crm/mails/)

src/
  actions/               server actions por dominio
  components/            UI por dominio + ui/ + layout + ai
  lib/                   db.ts, storage/s3, ai, validation, pdf, security
  server/                lógica de dominio (clients, cases, rounds, payments, auth…)
  marketing/

prisma/
  schema.prisma          ~51 models, ~34 enums
  migrations/            20 migraciones MySQL (init 2026-08-31 → sprint7 meta 2026-09-05)

docs/                    especificación objetivo + esta auditoría
scripts/                 bootstrap, seed demo, smoke tests
auth.ts / auth.config.ts / proxy.ts
```

Navegación primaria CRM (`SidebarNav`): Inicio, Hoy (tareas), Clientes, Casos, Cobrar, Mensajes, Chats. No hay ítem **Leads**.

## 3. Schema actual

### Tablas existentes

**Org / auth:** `User`, `Organization`, `OrganizationSettings`, `OrganizationMember`, `WorkflowStage`.

**Persona / comercial:** `Client`, `ClientSensitiveProfile`, `Opportunity`, `MetaLeadEvent`. **No existe `Lead`.**

**Expediente (solo crédito):** `CreditCase`, `CreditRound`, `CreditReport`, `CreditBureauSnapshot`, `CreditItem`, `DisputeItem`, `ReportComparison`, `ReportComparisonItem`, `DisputeLetterTemplate`, `DisputeLetter`, `DisputeLetterItem`, `ClientProgressReport`, `CreditProcessor`, `ClientProcessorAccount`.

**Operación:** `Document`, `Task`, `ActivityLog`, `AuditLog`, `Notification`.

**Comercial / cobros:** `Service`, `ServicePackage`, `ServicePackageItem`, `Quote`, `QuoteItem`, `QuoteEvent`, `Payment`, `Receipt`, `PaymentPlan`, `PaymentInstallment`, `Consultation`, `ContractTemplate`, `ClientContract`, `ClientPortalAccess`.

**Intake / mail / AI / misc:** `IntakeLink`, `IntakeSubmission`, `ConsentRecord`, `ExternalReference`, `MailMessage`, `AiChat`, `RateLimitBucket`, `WhatsappRecipient`, `EmailNotificationRecipient`.

**Ausentes vs objetivo (`docs/03-DATABASE.md`):** `leads`, `lead_activities`, `service_cases`, `service_case_stage_history`, `notes`, `credit_cases` como extensión 1:1 de ServiceCase (hoy `CreditCase` **es** el caso), `dispute_rounds` / `dispute_round_items` (equivalen a `CreditRound` / `DisputeItem`), `home_buyer_cases`, `funding_cases`, `funding_applications`, `personal_loan_cases`, `project_cases`, `testimonials`. `Role` es enum, no tabla.

### Relaciones

```text
User ← OrganizationMember.role (enum)
Client (status incluye LEAD) ← Opportunity[] , MetaLeadEvent?
Client 1 ───── * CreditCase          ← “casos”; no hay ServiceCase
CreditCase 1 ───── * CreditRound     (roundNumber único por caso)
CreditRound 1 ───── * DisputeItem    (join ronda ↔ CreditItem)
CreditCase 1 ───── * CreditReport → CreditBureauSnapshot, CreditItem
Client / CreditCase ───── Task, Document, ActivityLog, Quote, Payment (FKs opcionales al caso)
Service / ServicePackage ───── QuoteItem   (catálogo de precios, no de expedientes)
```

Soft-delete / archivo: `Client.archivedAt`, `Document.deletedAt` (+ `purgeAfter`, `hardDeletedAt`), `MailMessage.archivedAt`. **No** hay `archivedAt`/`deletedAt` en `CreditCase`, `CreditRound`, `Task`, `Payment`, `Opportunity`.

SSN: solo en `ClientSensitiveProfile` (`ssnLast4` en claro, `ssnEncrypted`). No hay campo ITIN.

## 4. Auth y usuarios

- Implementación: NextAuth v5. Staff: `User.passwordHash`. Portal: `ClientPortalAccess`. JWT; invalidación por `User.sessionVersion` / `isActive`. Guards en `src/server/auth/guards.ts`. Matriz en `src/server/auth/permissions.ts`. El primer `OrganizationMember` (por `createdAt`) define el rol de sesión.
- Roles: `OWNER`, `ADMIN`, `SPECIALIST`, `STAFF`, `VIEWER`. **No existe `AGENT`.** VIEWER = lectura; STAFF = operación sin sensibles; SPECIALIST = + SSN/docs; ADMIN/OWNER = usuarios, auditoría, settings, anular recibos, portal.
- MFA: campos en `User` + `src/server/mfa/index.ts` + UI en configuración. El `authorize` de `auth.ts` **no valida MFA** ni emite `mfa_required`. Enrolamiento sin enforcement de login.
- Riesgos: sesión JWT con `SESSION_MAX_AGE_SECONDS` muy largo (~10 años); un usuario en varias orgs solo ve la primera membresía; MFA incompleto; `ssnLast4` en plaintext; chat IA puede enviar dirección/teléfono/`ssnMasked` (no hay `sanitizeForAI()`).

## 5. Leads

- Existe: **No** como entidad. Prospecto = `Client` con `ClientStatus.LEAD`. Overlay comercial = `Opportunity` (`OpportunityStage`: NEW_LEAD → … → WON | LOST). Captura Meta = `MetaLeadEvent`. Contacto web = `submitContactLead` → Client LEAD + `onNewLead`.
- Ruta: **no hay** `/crm/leads`. Listado vía `/crm/clientes?status=LEAD`. `/crm/oportunidades` **redirige al dashboard** (“Oportunidades retiradas”).
- Modelo: `Client.source`, `leadChannel`, `serviceRequested` (string libre, no FK a `Service`), `attribution` JSON. `Opportunity.nextFollowUpAt`, `wonCaseId`.
- Funcionalidad: crear cliente como LEAD; inbound web/Meta; automatización crea Task `FOLLOW_UP`; `markWon` crea `CreditCase` y pasa Client a ACTIVE. No hay pipeline Kanban vivo.
- Problemas: viola BR-010–012 (no hay Lead que conservar/marcar CONVERTED; no hay `convertLeadToClient()` transaccional). `markWon` llama `createCreditCase` **fuera** de la transacción que marca ACTIVE/WON → caso huérfano si falla el segundo paso. UI de oportunidades muerta pero el modelo y Meta siguen escribiendo. Fuente se conserva en Client, no en una entidad Lead.

## 6. Clients

- Existe: sí. Rutas: `/crm/clientes`, `/nuevo`, `/[clientId]` (Resumen), `/expediente`, `/casos`, `/actividad`.
- Modelo: persona + contacto + dirección + `source`/`leadChannel`/`serviceRequested` + **`status: ClientStatus`** (`LEAD | ACTIVE | PAUSED | COMPLETED | CANCELLED | ARCHIVED`) + `assignedToId` + `archivedAt`. Código único `clientCode`.
- Funcionalidad: CRUD, archivo, asignación, perfil sensible cifrado, múltiples `CreditCase` por cliente. Tabs: Resumen · Expediente · Casos · Actividad. **Faltan** tabs objetivo Pagos / Notas / Testimonios / Documentos a nivel ficha (documentos/pagos viven sobre todo en el caso).
- Problemas: `status` mezcla “¿es prospecto o cliente?” con “¿el trabajo está pausado/cerrado?” (BR-003). `serviceRequested` no es el catálogo ni un ServiceCase. Un cliente puede tener N `CreditCase` (crédito) pero no N verticales (casa, funding, web).

## 7. Services / ServiceCase

- Existe Service: **sí**, catálogo de precios (`Service` / `ServicePackage` / `ServicePackageItem`). UI: `/crm/servicios`, `/crm/servicios/paquetes`. **No** tiene `code` tipo `CREDIT_REPAIR`. No hay `serviceId` en `CreditCase`.
- Existe ServiceCase: **no**. El expediente operativo es `CreditCase` (`caseCode`, `state: CaseState`, `stageId` → `WorkflowStage`, `assignedToId`, `openedAt`, `nextReviewAt`, `closedAt`, `summary`). Rutas `/crm/casos/[caseId]` con tabs Resumen · Crédito · Rondas · Documentos · Tareas · Cotizaciones · Pagos.
- Cliente contiene service directamente: **parcialmente**. No hay `currentRound` ni `serviceId` en Client. Sí `serviceRequested` (texto) y `status` de ciclo de vida que debería vivir en el expediente (BR-003 / `docs/08-AI_CONTEXT.md`).
- Problemas: imposible modelar HOME_BUYER + CREDIT_REPAIR independientes. No hay `quotedAmount` / `agreedAmount` / `nextActionAt` / `caseNumber` genérico (sí `caseCode`). No hay `ServiceCaseStageHistory` (solo `ActivityLog` tipo `STAGE_CHANGE`). `CaseState` usa `PAUSED` en lugar de `ON_HOLD` del objetivo.

## 8. Tasks / reminders

- Estado actual: modelo `Task` completo: `clientId?`, `caseId?` (CreditCase), `roundId?`, `type` (`FOLLOW_UP`, `REQUEST_DOCUMENT`, `CREDIT_UPDATE`, `REVIEW_RESULT`, …), `priority`, `status` (`PENDING`/`IN_PROGRESS`/`COMPLETED`/`CANCELLED`), `dueAt`, `reminderAt`, `completedAt`, `assignedToId` **obligatorio**. UI `/crm/tareas` con filtros hoy/vencidas. Dashboard consume overdue + today. Cron `/api/cron/reminders`. Al enviar ronda se puede crear Task de revisión (`CREDIT_UPDATE`); `onRoundSent` puede crear otra `REVIEW_RESULT` (riesgo de duplicado). No existe `nextActionAt` en el expediente; el equivalente es `CreditCase.nextReviewAt` + `Opportunity.nextFollowUpAt` + `Task.dueAt`.

## 9. Notes / Activity

- Estado actual: **no hay tabla `Note`.** `ActivityLog` es el timeline (`clientId` requerido, `caseId?`, `roundId?`, `type: ActivityType`, `description`, `metadata`). Las notas humanas son filas `type: NOTE`, también usadas como catch-all de ediciones. Escritura: `src/server/activity/index.ts` → `writeActivityLog`. Timeline en ficha de cliente y detalle de caso.
- Eventos automáticos (BR-020): cubiertos en gran parte — caso creado (`CREATED`), etapa (`STAGE_CHANGE`), documento (`DOCUMENT_UPLOAD`/`DELETE`), ronda (`ROUND_CREATED`/`SENT`/`REVIEWED`), pago (`PAYMENT_RECORDED`), tarea (`TASK_COMPLETED` si hay `clientId`). También quotes, cartas, contratos, portal, etc.
- Gap: BR-021 (Note ≠ Activity) no cumplido. No hay `lead_activities`. Activity no es polimórfica `entityType`/`entityId` como el doc objetivo (es relacional a client/case/round).

## 10. Documents

- Storage: S3-compatible privado (`src/lib/storage/s3.ts`). PUT/GET presignados **5 minutos**. Si faltan `S3_*`, `isStorageConfigured() === false`.
- Privado: sí. Download: `app/api/files/[documentId]/download/route.ts` → sesión org + permiso `documents.downloadSensitive` si no INTERNAL → 302 a URL firmada. No URLs públicas permanentes.
- Metadata: `Document` en MySQL (`originalName`, `displayName`, `mimeType`, `sizeBytes`, `storageKey` unique, `category`, `sensitivity`, `clientId`, `caseId?`, `roundId?`, `paymentId?`, checksum, soft/hard delete). **No hay binarios en MySQL** (BR-050).
- Problemas: FK a `CreditCase` no a `ServiceCase`. Categorías no cubren CONTRACT/INVOICE/RECEIPT/BANK_DOCUMENT del backlog (hay `PAYMENT_PROOF`, `SSN_DOCUMENT`, `UPDATE_REPORT`). Checklist por servicio (DC-005) no existe. Dependiente de que S3 esté configurado en el entorno.

## 11. Quotes / Payments

- Estado actual: `Quote` ligado a `clientId` + `caseId?`, folio, status DRAFT→PAID, items, `QuoteEvent`. `Payment`: `clientId` requerido, `caseId?`, `quoteId?`, `amount`, `method` (`ZELLE | STRIPE | CASH | BANK_TRANSFER | OTHER`), `status` (`PENDING | RECEIVED | CANCELLED | REFUNDED`), `reference`, `dueAt`, `receivedAt`. **No hay `isPaid`.** Balance = `Quote.total − sum(Payment RECEIVED)` (`quoteBalance` en `src/server/payments/index.ts`). Extras vs objetivo: `PaymentPlan`, `PaymentInstallment`, `Receipt`, `Consultation`. Contratos: `ClientContract` + `ContractTemplate` (status DRAFT/SENT/SIGNED/CANCELLED, `cancellationDeadline`, firma).
- Problemas: no hay `ServiceCase.agreedAmount` / `quotedAmount`; el saldo es de la cotización, no del expediente (BR-041). Un caso sin quote no tiene balance canónico. `Contract.sentAt`/`canceledAt` del doc objetivo son parciales (status + timestamps genéricos).

## 12. Credit Repair

- CreditCase: **sí** — es el expediente. `state` + `stageId` (WorkflowStage configurable por org). Faltan vs doc: `serviceCaseId`, `initialReportDate`, `goals` (hay `summary`).
- CreditReport: **sí**, más `CreditBureauSnapshot` por buró (scores no son columnas experianScore/equifaxScore/transunionScore en el report; viven en snapshots, nullable).
- CreditItem: **sí**, anclado a **reporte + caso**. `lifecycleStatus`, `negativeType`, `isNegative`, `disputeEligible`. No hay `disputeStatus` ni `category` genéricos del doc; no hay campo `action` en el item de ronda.
- DisputeRound: **`CreditRound`**. `roundNumber`, `status` (`DRAFT | PREPARING | SENT | WAITING_UPDATE | REVIEWING | COMPLETED | CANCELLED`), `sentAt`, `expectedReviewAt`, `reviewedAt`. Join: **`DisputeItem`** (`bureau`, `disputeReason`, `outcome`).
- Rondas fijas: **no**. N filas, `@@unique([caseId, roundNumber])`. Cumple BR-030/031. No se crea ronda nueva cada 30/40 días (BR-032). Si al enviar falta `expectedReviewAt`, `onRoundSent` sugiere **+30 días** (fecha, no nueva ronda).
- Problemas: no hay capa `ServiceCase` 1:1; naming distinto al objetivo; `DisputeItem` sin `action`; items viven por reporte (el doc los cuelga de CreditCase); posible doble tarea de revisión; vertical 100 % crédito.

Módulo extra maduro (más rico que el MVP de docs): comparaciones de reportes, cartas HTML/PDF on-demand, progress reports, procesadores (SmartCredit), portal cliente.

## 13. Dashboard

- Datos actuales: `/crm/dashboard` + `src/server/dashboard/index.ts`. Widgets: clientes ACTIVE, casos OPEN, rondas activas, tareas hoy/vencidas, revisiones de caso/ronda, cotizaciones pendientes, pagos pendientes/vencidos/recibidos, mails no leídos, casos en etapa `DOCUMENTS_PENDING`, reportes a revisar, rondas a preparar/esperando, “nuevos leads” = Client LEAD creados en **7 días**, “conversiones” = Opportunity WON en 30 días, items disputados/deleted/updated. Lista operativa “Para hacer hoy” (tareas, pagos, revisiones, docs).
- Consultas: agregados Prisma en paralelo, timezone de `OrganizationSettings` (default `America/Chicago`).
- Problemas: no responde con claridad “leads por contactar” ni pipeline de leads (DB-003). Follow-ups hoy = cualquier Task con due hoy, no solo FOLLOW_UP. No hay menú Leads. KPIs de crédito dominan; el objetivo es mixto comercial + operación.

## 14. Deploy / DB

- Vercel: el producto está pensado para Vercel (docs/14, stack Next). No hay `vercel.json` en el repo. Cron es **externo** (Bearer `CRON_SECRET`), no Cron Jobs de Vercel documentados en código.
- Hostinger: mencionado en `docs/README.md`, `docs/08-AI_CONTEXT.md`, `docs/14-DEPLOYMENT.md` como MySQL del producto. El código no nombra Hostinger; solo `DATABASE_URL`.
- Variables (`.env.example`): `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `FIELD_ENCRYPTION_KEY`, `BOOTSTRAP_OWNER_*`, `OPENROUTER_API_KEY` (+ secondary), `FEATURE_PUBLIC_INTAKE`, `FEATURE_CONSULTATION_PAYMENTS`, `FEATURE_CLIENT_PORTAL`, `S3_*`, `UPLOAD_MAX_MB`. Meta/SMTP/IMAP no están todos en `.env.example` (parte vive en settings de org).
- Connection strategy: `src/lib/db.ts` — `new PrismaClient()` singleton + Proxy para HMR. **Sin** `directUrl`, **sin** Prisma Accelerate, **sin** adapter PlanetScale/mysql2 pool, **sin** SSL en código (quedaría en el query string si se configura).
- Riesgos: cada instancia serverless puede abrir conexiones nuevas → límite de Hostinger (`Too many connections`); IPs efímeras vs allowlist; timeouts/latencia transatlántica; migraciones largas desde Preview contra la misma DB; no hay `jh_crm_dev` / `jh_crm_staging` / `jh_crm_prod` separados en código. Ver `docs/MIGRATION_PLAN.md`.

## 15. Qué se puede conservar

- Auth, guards, matriz de permisos, usuarios, bootstrap OWNER.
- Layout CRM (`CrmHeader`, `SidebarNav`, shell, design system `src/components/ui`).
- `Client` como persona + `ClientSensitiveProfile` (cifrado).
- `CreditCase` + `WorkflowStage` + rondas N + reportes + items + cartas + comparaciones + progress reports (núcleo de crédito; envolver, no reescribir).
- Tasks, Documents + S3 privado + download autenticado.
- Quotes, Payments (sin `isPaid`), Receipts, PaymentPlans, Consultations, Contracts.
- `ActivityLog` (timeline) y `AuditLog`.
- Folios (`caseCode`, `clientCode`, quote/receipt).
- Catálogo `Service`/`ServicePackage` (engancharlo a ServiceCase).
- Dashboard operativo (reapuntar queries cuando exista Lead/ServiceCase).
- Portal, intake, mail interno, IA chat (añadir sanitización).
- Scripts smoke / seed demo.

## 16. Qué debe refactorizarse

> Superado en parte por `ARCHITECTURE_V1.md`: **no** extraer tabla Lead; Opportunity permanece como pipeline (UI Leads); ServiceCase envuelve CreditCase.

- Introducir **ServiceCase** y envolver `CreditCase` 1:1 (CREDIT_REPAIR).
- Restaurar Leads UI sobre **Opportunity**; `markOpportunityWon()` transaccional (BR-012). No tabla Lead.
- Quitar de Client el significado de “estado del servicio” (`PAUSED`/`COMPLETED`/`CANCELLED` de trabajo).
- Ligar Task / Document / Payment / Activity / Quote a `serviceCaseId`.
- Separar **Note** de ActivityLog.
- Añadir `ServiceCaseStageHistory` y `nextActionAt` (mapear desde `nextReviewAt` en crédito).
- `agreedAmount` / balance a nivel expediente.
- Restaurar o reemplazar pipeline de leads (Opportunity UI muerta).
- Completar enforcement MFA en login.
- `sanitizeForAI()` antes de OpenRouter.
- Connection pooling / SSL para Vercel → Hostinger.
- Mapear roles docs (`ADMIN`/`AGENT`/`VIEWER`) a los cinco roles actuales sin romper la matriz.

## 17. Qué debe eliminarse o deprecarse

- **No eliminar ahora** tablas ni columnas (auditoría; ver plan de migración).
- Deprecar conceptualmente (después de backfill validado):
  - usar `Client.status` como estado de servicio;
  - `Client.serviceRequested` como “el servicio contratado”;
  - Opportunity como **único** pipeline de leads (el modelo puede quedar como overlay o deprecarse tras dual-write);
  - `ActivityLog.type=NOTE` como único almacén de notas humanas;
  - ruta vacía `app/mails/`;
  - rename in-place de `CreditRound`/`DisputeItem` (opcional y posterior; no es bloqueo: ya son N filas).
- **No aplica deprecar** columnas `round1Date`/`round2Date`/`round3Date`: **nunca existieron**.
- **No extraer tabla Lead** (decisión v1). Opportunity no se borra.
- Fuera del alcance actual (no hay código que borrar): LLC, testimonios, HomeBuyer/Funding/PersonalLoan/ProjectCase.
