# BACKLOG — JH CRM

> Decisiones de dominio: [`ARCHITECTURE_V1.md`](ARCHITECTURE_V1.md).
> No crear tabla `Lead`. Leads en UI = `Opportunity`. Credit Repair se envuelve, no se reescribe.

## Convenciones

Prioridad:

- **P0**: imprescindible para MVP.
- **P1**: importante después del núcleo.
- **P2**: automatización/mejora.
- **P3**: futuro.

Estado sugerido:

```text
TODO
READY
IN_PROGRESS
QA
DONE
BLOCKED
```

---

# EPIC 0 — Auditoría y refactor estructural

## ARC-001 — Auditar repositorio actual
**Prioridad:** P0

Analizar:

- autenticación;
- usuarios;
- layout;
- schema;
- leads;
- clientes;
- servicios;
- tareas;
- documentos;
- pagos;
- recordatorios;
- calendario.

**Entregables:**

- `CURRENT_STATE.md`
- `GAP_ANALYSIS.md`
- `MIGRATION_PLAN.md`

**Estado:** DONE (2026-09-08). No se modificó producción.

---

## ARC-002 — Congelar modelo de dominio v1
**Prioridad:** P0

Validar contra `ARCHITECTURE_V1.md`:

```text
Client
Opportunity          (UI: Leads; no tabla Lead)
Service
WorkflowStage        (por Service; única fuente de stage)
ServiceCase          (stageId, nextActionAt, status)
ServiceCaseStageHistory
Note
Task
ActivityLog
Document
Quote
Payment
CreditCase           (1:1 wrap; no rename)
CreditRound
CreditReport
CreditItem
DisputeItem
AuditLog
```

**Done cuando:**

- `ARCHITECTURE_V1.md` aprobado (2026-09-08);
- docs de dominio/DB/migración alineados;
- no existe tabla Lead;
- no existe `ServiceCase.stage` string;
- no se reescribe el módulo de crédito.

**Estado:** DONE (documentación). Implementación = ARC-003+.

---

## ARC-003 — Crear ServiceCase y envolver CreditCase
**Prioridad:** P0

Crear entidad y relaciones base. Migración aditiva, dos deploys (`MIGRATION_PLAN.md`).

**Acceptance Criteria:**

- Client puede tener múltiples ServiceCase.
- Cada ServiceCase pertenece a Service (`serviceId` + `code`).
- `status` y `stageId` separados; stage solo vía WorkflowStage.
- `nextActionAt` en ServiceCase.
- `CreditCase.serviceCaseId` 1:1 para CREDIT_REPAIR (backfill 1:1).
- StageHistory para cambios **nuevos**.
- No rename de CreditCase / CreditRound.
- No DROP.

**Estado:** DONE (2026-09-10; Deploy 2 lectura 2026-09-16). Schema + backfill DEV + wrap create/move/markWon. Contract de lectura: operación vía `ServiceCase.nextActionAt` (cron, listCases, atención IA). Workspace crédito permanece en `/crm/casos/[caseId]` (CreditCase id); ficha genérica enlaza a reparación si hay `creditCase`.

---

## ARC-004 — WorkflowStage por Service
**Prioridad:** P0

Asociar etapas al catálogo de servicios.

**Acceptance Criteria:**

- `WorkflowStage.serviceId` obligatorio tras backfill.
- Unique `(organizationId, serviceId, key)` y `(…, order)`.
- Etapas actuales de crédito ligadas a `Service.code = CREDIT_REPAIR`.
- `ServiceCase.stageId` debe ser de ese Service.

**Estado:** DONE (2026-09-10). Stages scoped en config/bootstrap; uniques migrados en DEV.
# EPIC 1 — Leads (Opportunity)

La UI dice “Leads”. El modelo es `Client` + `Opportunity`. **No crear tabla Lead.**

## LD-001 — Alta de prospecto
**Prioridad:** P0

Alta de `Client` (persona) + `Opportunity` (deal) con:

- nombre / contacto;
- idioma;
- fuente;
- servicio interesado (catálogo o `serviceRequested` hasta existir `code`);
- etapa comercial;
- responsable;
- `nextFollowUpAt`.

**Acceptance Criteria:**

- se crea Client + Opportunity;
- aparece en listado de Leads (Opportunity);
- registra Activity;
- valida datos obligatorios;
- no se crea tabla Lead.

**Estado:** DONE (2026-09-10). `createLead` + UI “Nuevo lead” en `/crm/oportunidades`.

---

## LD-002 — Editar prospecto / deal
**Prioridad:** P0

**Acceptance Criteria:**

- editar datos de persona (Client) y de deal (Opportunity);
- editar fuente;
- editar servicio interesado;
- editar responsable;
- conservar historial (Activity); no borrar Opportunity.

**Estado:** DONE (2026-09-10). `updateLead` + `EditLeadButton` en kanban.

---

## LD-003 — Pipeline de Leads
**Prioridad:** P0

Usar `OpportunityStage` existente (o mapear labels de UI). Restaurar la pantalla de Leads sobre Opportunity (hoy `/crm/oportunidades` redirige al dashboard).

**Acceptance Criteria:**

- filtrar por etapa;
- cambiar etapa;
- registrar Activity;
- no perder fuente original del Client.

**Estado:** DONE (2026-09-10). Kanban restaurado; nav “Leads”; sin tabla Lead.

---

## LD-004 — Seguimiento comercial
**Prioridad:** P0

**Acceptance Criteria:**

- definir `Opportunity.nextFollowUpAt`;
- opcional: crear Task (`dueAt`) sin sustituir el follow-up del deal;
- mostrar en dashboard “leads por contactar”;
- marcar vencido si `nextFollowUpAt` < ahora.

**Estado:** DONE (2026-09-10). Follow-up en cards + widget/attention dashboard; vencidos en rojo.

## LD-005 — Marcar Opportunity WON
**Prioridad:** P0

**Estado:** DONE (2026-09-10). `markWon` transaccional (BR-012): ServiceCase+CreditCase, `wonServiceCaseId`/`wonCaseId`, LEAD→ACTIVE, Activity, sin tocar source. UI confirmación + smoke `scripts/smoke/mark-won-br012.ts`.

**Actualización Fase 4 (2026-09-15):** `wonServiceCaseId` es el único enlace WON nuevo; `markWon` ya no escribe `wonCaseId` (solo lectura legacy; UI y actions resuelven el CreditCase vía `wonServiceCase.creditCase`).

Transacción (BR-012):

1. Client ya existe (no duplicar persona);
2. crear ServiceCase;
3. si CREDIT_REPAIR: crear CreditCase 1:1;
4. Opportunity → WON + `wonServiceCaseId` (`wonCaseId` temporal);
5. Client.status → ACTIVE si aplicaba;
6. Activity.

**Acceptance Criteria:**

- no duplica cliente;
- no elimina Opportunity ni Client;
- conserva source;
- rollback completo si una operación falla;
- no deja CreditCase huérfano.

---

# EPIC 2 — Clientes

## CL-001 — Listado de Clientes
**Prioridad:** P0

**Estado:** DONE (2026-09-10). `listClients` enriquece origen (`source`/`leadChannel`), servicios activos (ServiceCase OPEN/ON_HOLD + fallback CreditCase) y próxima acción (`nextActionAt` / follow-up / review). UI `/crm/clientes` con columnas CL-001.

Mostrar:

- nombre;
- contacto;
- origen;
- responsable;
- servicios activos;
- próxima acción.

---

## CL-002 — Ficha de Cliente
**Prioridad:** P0

**Estado:** DONE (2026-09-10). Tabs: Resumen · Servicios · Actividad · Tareas · Documentos · Pagos · Notas · Testimonios. `/casos` redirige a `/servicios`. Expediente (datos/perfil) queda como enlace secundario. Testimonios implementados en Fase 6 (2026-09-15): captura, consentimiento y revisión/publicación manual.

Tabs:

```text
Resumen
Servicios
Actividad
Tareas
Documentos
Pagos
Notas
Testimonios
```

---

## CL-003 — Múltiples servicios
**Prioridad:** P0

**Estado:** DONE (2026-09-10). Cliente con ≥2 ServiceCase; `stageId` independiente; pagos/tareas dual-write `serviceCaseId` + listados/overview scoped por `?caseId=`. Smoke: `scripts/smoke/multi-service-cl003.ts`.

**Acceptance Criteria:**

- cliente puede tener dos o más ServiceCase;
- cada uno mantiene `stageId` independiente (WorkflowStage de su Service);
- cada uno mantiene pagos y tareas independientes.

---

# EPIC 3 — Service Cases

## SC-001 — Crear expediente
**Prioridad:** P0

**Estado:** DONE (2026-09-10). `createCreditCase` = ServiceCase OPEN + CreditCase 1:1 + `caseNumber` + `stageId` inicial + StageHistory de apertura + Activity. UI «Nuevo expediente». Smoke: `scripts/smoke/sc-001-create.ts`.

**Acceptance Criteria:**

- asociado a cliente;
- asociado a servicio (`serviceId`);
- genera caseNumber;
- status OPEN;
- `stageId` inicial del WorkflowStage de ese Service;
- si CREDIT_REPAIR: crea CreditCase 1:1 (wrap, no rewrite);
- Activity automática.

---

## SC-002 — Cambiar etapa
**Prioridad:** P0

**Estado:** DONE (2026-09-10). `moveCaseToStage` dual-write `stageId`, StageHistory (from/to/actor/fecha), Activity; bloquea cerrados y etapas de otro Service; historial en ficha del caso. Smoke: `scripts/smoke/sc-002-change-stage.ts`.

**Acceptance Criteria:**

- cambia `stageId` (WorkflowStage del mismo Service);
- guarda fromStageId / toStageId / actor / fecha en `ServiceCaseStageHistory`;
- crea Activity;
- no escribe un string `stage` en ServiceCase;
- no reconstruye historial anterior.

---

## SC-003 — Próxima acción
**Prioridad:** P0

**Acceptance Criteria:**

- guardar `nextActionAt`;
- mostrar en ficha;
- mostrar en dashboard;
- permitir actualizarla.

**Estado:** DONE (2026-09-10). `ServiceCase.nextActionAt` es la fuente canónica (ficha, dashboard, `setNextActionAt`, `markRoundSent`). `CreditCase.nextReviewAt` queda en solo lectura legacy; smoke `scripts/smoke/sc-003-next-action.ts` verde.

---

## SC-004 — Completar expediente
**Prioridad:** P0 — **Estado:** DONE (2026-09-16). `transitionServiceCase` → COMPLETED + `completedAt` + Activity; UI «Solicitar testimonio» tras completar (`ServiceCaseStateActions` → `/crm/clientes/[id]/testimonios`).

**Acceptance Criteria:**

- status COMPLETED;
- completedAt;
- Activity;
- posibilidad de solicitar testimonio.

---

# EPIC 4 — Operación diaria

## TS-001 — Crear tarea
**Prioridad:** P0

## TS-002 — Completar tarea
**Prioridad:** P0

## TS-003 — Tareas vencidas
**Prioridad:** P0

## TS-004 — Dashboard de tareas
**Prioridad:** P0

Debe responder:

- qué hacer hoy;
- qué está vencido;
- qué clientes esperan seguimiento.

---

## NT-001 — Notas
**Prioridad:** P0

Tabla `Note` para notas humanas nuevas, separadas de Activity.

**Acceptance Criteria:**

- crear/listar notas en cliente y/o ServiceCase;
- no backfill automático desde `ActivityLog.NOTE`.

**Estado:** DONE (2026-09-15). Notas en lead/Client (modal Leads) y en ServiceCase (`createServiceCaseNote` + card «Notas» en ficha del caso). Smoke: `scripts/smoke/fase4-balance-notes.ts`.

---

## AC-001 — Timeline
**Prioridad:** P0

Eventos automáticos:

- creación;
- cambio de etapa;
- tarea;
- documento;
- ronda;
- pago;
- cierre.

---

# EPIC 5 — Documentos

## DC-001 — Metadata de documentos
**Prioridad:** P0

## DC-002 — Storage privado
**Prioridad:** P0

## DC-003 — Upload
**Prioridad:** P0

## DC-004 — Descarga segura
**Prioridad:** P0

## DC-005 — Checklist por servicio
**Prioridad:** P1

Categorías iniciales:

```text
ID
PROOF_OF_ADDRESS
CREDIT_REPORT
DISPUTE_LETTER
BUREAU_RESPONSE
CONTRACT
INVOICE
RECEIPT
BANK_DOCUMENT
BUSINESS_DOCUMENT
OTHER
```

**Estado:** DONE (2026-09-16). Checklist por servicio + enum aditivo: `CONTRACT`, `INVOICE`, `RECEIPT`, `BANK_DOCUMENT`, `BUSINESS_DOCUMENT` en `DocumentCategory` (migración `20260916160000_dc005_document_categories`). Labels + optional en CREDIT_REPAIR. Portal upload whitelist sin cambios. Smoke: `scripts/smoke/dc-005-checklist.ts`.

---

# EPIC 6 — Reparación de crédito

## CR-001 — Envolver CreditCase
**Prioridad:** P0

Se crea solamente junto a un ServiceCase CREDIT_REPAIR (1:1).

**Regla:** conservar y envolver el módulo existente. No reescribir CreditCase, CreditRound, CreditReport, CreditItem, DisputeItem, Letters, Comparisons ni ProgressReports.

---

## CR-001b — Deprecar nextReviewAt
**Prioridad:** P0 — **Estado:** DONE (2026-09-16). Escritura canónica solo en `ServiceCase.nextActionAt`; cron/listados/IA leen `nextActionAt`. `CreditCase.nextReviewAt` legado de solo lectura. No DROP.

---

## CR-002 — Vista principal Credit Repair
**Prioridad:** P0

Mostrar:

- scores iniciales/actuales;
- última actividad;
- próxima revisión;
- items;
- rondas;
- tareas.

---

## CR-003 — Registrar CreditReport
**Prioridad:** P1

**Acceptance Criteria:**

- fecha;
- proveedor;
- scores opcionales;
- documento asociado;
- notas.

Los tres scores deben aceptar `null`.

---

## CR-004 — CreditItems CRUD
**Prioridad:** P0

Campos:

- creditorName;
- accountReference;
- bureau;
- category;
- status;
- balance;
- disputeStatus;
- notes.

---

## CR-005 — Crear ronda
**Prioridad:** P0

Usar `CreditRound` existente (concepto DisputeRound). No crear tabla nueva ni rename.

Estados: los de `RoundStatus` actual (`DRAFT`, `PREPARING`, `SENT`, `WAITING_UPDATE`, `REVIEWING`, `COMPLETED`, `CANCELLED`).

---

## CR-006 — Agregar items a ronda
**Prioridad:** P0 — **Estado:** DONE (2026-09-16). `DisputeItem.action` (motivo + acción); UI de alta con selector; smoke `disputes-comparisons-smoke.ts`.

**Acceptance Criteria:**

- seleccionar CreditItems;
- definir bureau;
- reason obligatorio;
- action;
- evitar asociaciones inconsistentes.

---

## CR-007 — Marcar ronda enviada
**Prioridad:** P0

Debe:

- establecer sentAt;
- solicitar expectedReviewAt;
- crear Activity;
- crear Task de revisión (`dueAt`);
- actualizar `ServiceCase.nextActionAt`.

---

## CR-008 — Revisar resultado
**Prioridad:** P0

Debe permitir registrar:

- reviewedAt;
- outcome por item;
- cambio de estado;
- notas.

---

## CR-009 — Nueva ronda
**Prioridad:** P0

**Acceptance Criteria:**

- nueva ronda solo por decisión humana;
- roundNumber incremental;
- puede reutilizar items todavía abiertos;
- conserva historial anterior.

---

## CR-010 — Completar CreditCase
**Prioridad:** P0

**Acceptance Criteria:**

- cerrar expediente;
- registrar reporte final opcional;
- Activity;
- habilitar solicitud de testimonio.

---

# EPIC 7 — Cotizaciones y pagos

## QT-001 — Crear Quote
**Prioridad:** P1

Estados:

```text
DRAFT
SENT
ACCEPTED
REJECTED
EXPIRED
```

---

## PY-001 — Registrar Payment
**Prioridad:** P1

Métodos iniciales:

```text
CARD
ZELLE
CASH
BANK_TRANSFER
OTHER
```

---

## PY-002 — Balance
**Prioridad:** P1

Calcular:

```text
agreedAmount
- sum(payments)
= balance
```

**Estado:** DONE (2026-09-15). Balance canónico a nivel expediente: `ServiceCase.agreedAmount/quotedAmount` editables (card «Dinero del expediente»), `serviceCaseBalance()` = agreed − Σ pagos RECEIVED del serviceCase; visible en ficha y en `/pagos` del caso. Smoke: `scripts/smoke/fase4-balance-notes.ts`.

---

## CT-001 — Contrato
**Prioridad:** P1

Campos:

- versión;
- sentAt;
- signedAt;
- cancellationDeadline;
- canceledAt;
- status.

No automatizar cobros contractuales sin validación legal/compliance.

---

# EPIC 8 — Servicios secundarios

**Estado:** DONE (2026-09-15). Migración `20260915180000_fase5_secondary_verticals` (migrate deploy); `createServiceCase` genérico (ServiceCase + extensión 1:1 por código, `createCreditCase` delega); `ensureVerticalService` idempotente con pipelines por defecto; Server Actions + `CreateCaseButton` multi-vertical; ficha genérica `/crm/expedientes/[serviceCaseId]` (etapa, estado, montos/balance, notas, historial). Smoke: `scripts/smoke/fase5-verticals.ts`.

## HB-001 — HomeBuyerCase
**Prioridad:** P1 — **Estado:** DONE (2026-09-15)

Pipeline:

```text
CONSULTA
EVALUACION_CREDITO
OBJETIVO
PLAN
SEGUIMIENTO
LISTO_REFERENCIA
REFERIDO
COMPLETADO
```

---

## FD-001 — FundingCase
**Prioridad:** P1 — **Estado:** DONE (2026-09-15)

## FD-002 — FundingApplication
**Prioridad:** P1 — **Estado:** DONE (2026-09-16). Modelo + lectura en ficha; alta/edición por UI (`FundingApplicationButton` en `/crm/expedientes/[serviceCaseId]`); server actions + dominio con concurrencia optimista, auditoría y activity log. Smoke: `scripts/smoke/funding-applications.ts`.

---

## PL-001 — PersonalLoanCase
**Prioridad:** P1 — **Estado:** DONE (2026-09-15)

---

## PJ-001 — ProjectCase
**Prioridad:** P1 — **Estado:** DONE (2026-09-15)

Para web/CRM.

---

# EPIC 9 — Testimonios

## TM-001 — Crear Testimonial
**Prioridad:** P1

**Estado:** DONE (2026-09-15). Modelo `Testimonial` ligado a Client y opcionalmente ServiceCase; CRUD con soft delete en ficha del cliente, cola `/crm/testimonios`, captura y edición propias en `/portal/testimonios`. Migración `20260915200000_fase6_testimonials` aplicada en DEV (Hostinger) con `migrate diff` + `migrate deploy` + `prisma generate`.

## TM-002 — Consentimiento
**Prioridad:** P1

**Estado:** DONE (2026-09-15). Consentimiento explícito versionado: fecha, firmante, texto, evidencia (manual o portal), actor y huella de contenido. Editar invalida consentimiento/aprobación y retira publicación; revocar desde CRM/portal retira inmediatamente. Auditoría y Activity transaccionales.

## TM-003 — Aprobar/Publicar
**Prioridad:** P1

**Estado:** DONE (2026-09-15). Aprobación/rechazo y publicación separados y manuales (BR-080). STAFF/SPECIALIST capturan; ADMIN/OWNER aprueban/publican; VIEWER solo lee. Publicación exige consentimiento vigente y aprobación humana. Bloqueo de fila + versión impiden operar sobre una revisión obsoleta.

## TM-004 — Endpoint público
**Prioridad:** P1

**Estado:** DONE (2026-09-15). `GET /api/public/testimonials` anónimo, `Cache-Control: no-store`; solo testimonios aprobados/publicados con consentimiento vigente, sin soft delete ni cliente/expediente archivado. Organización del sitio = primera creada (criterio existente en contacto); máximo 100 por fecha de publicación. Respuesta `{ ok, testimonials: [{ displayName, body, rating, publishedAt }] }`, sin IDs, contactos ni evidencia. Smoke: `scripts/smoke/fase6-testimonials.ts` (39/39).

Nunca publicar automáticamente.

---

# EPIC 10 — Seguridad y auditoría

> **MFA login (2026-09-15):** enforcement TOTP activo — `authorize` de `auth.ts` exige código cuando `mfaEnabled=true` (errores `mfa_required`/`mfa_invalid` que el LoginForm ya maneja; lockout 5 fallos → 15 min; recovery codes de un solo uso). Smoke: `scripts/smoke/mfa-login-enforcement.ts` (9/9).

## SEC-001 — Roles
**Prioridad:** P0

Inicialmente:

```text
ADMIN
AGENT
VIEWER
```

---

## SEC-002 — Enmascarar SSN/ITIN
**Prioridad:** P0

## SEC-003 — Auditar acceso sensible
**Prioridad:** P0

## SEC-004 — AuditLog
**Prioridad:** P0

## SEC-005 — Soft delete/archive
**Prioridad:** P0

## SEC-006 — URLs temporales para documentos
**Prioridad:** P0

---

# EPIC 11 — Dashboard

## DB-001 — KPIs operativos
**Prioridad:** P0

Mostrar:

- nuevos leads;
- leads por contactar;
- clientes activos;
- tareas vencidas;
- seguimientos hoy;
- esperando documentos.

---

## DB-002 — Requiere atención
**Prioridad:** P0

Listado priorizado de expedientes con acciones vencidas o próximas.

---

## DB-003 — Pipeline leads
**Prioridad:** P0

---

# EPIC 12 — Búsqueda global

## SR-001 — Buscar clientes
**Prioridad:** P1

## SR-002 — Buscar expedientes
**Prioridad:** P1

## SR-003 — Buscar documentos por metadata
**Prioridad:** P1

---

# EPIC 13 — IA con OpenRouter

## AI-001 — Wrapper central de OpenRouter
**Prioridad:** P2 — **Estado:** DONE (2026-09-16). `src/lib/ai/openrouter.ts` (rotación de keys, modelo free router).

## AI-002 — Sanitización de datos
**Prioridad:** P0 antes de activar IA

**Estado:** DONE (2026-09-15). `sanitizeForAI()` en `src/lib/ai/sanitize.ts`: elimina SSN/ITIN (completo, last4, cifrado), *Encrypted, DOB, dirección, números de cuenta y enmascara patrones 123-45-6789 / 9 dígitos en texto libre. Aplicado en todas las tools del chat (`src/server/ai/tools.ts`), en los mensajes del staff (`app/api/ai/chat/route.ts`) y en la traducción de correos. Smoke: `scripts/smoke/ai-sanitize.ts` (22/22).

## AI-003 — Resumen de expediente
**Prioridad:** P2 — **Estado:** DONE (2026-09-16). `summarizeCase` + tool de chat; datos vía `getCaseBrief` + sanitize.

## AI-004 — Siguiente acción sugerida
**Prioridad:** P2 — **Estado:** DONE (2026-09-16). `suggestNextAction` etiquetada «Sugerencia de IA»; no se aplica sola.

## AI-005 — Extraer acciones desde nota
**Prioridad:** P2 — **Estado:** DONE (2026-09-16). `extractNoteActions` propone task/activity; UI Confirmar/Descartar (`AiProposalCards`) + `applyAiProposalAction`. Descartar no escribe.

## AI-006 — Búsqueda asistida dedicada
**Prioridad:** P2 — **Estado:** DONE (2026-09-16). `assistSearch` clasifica intent (`find`/`list`/`howto`) y ejecuta `searchCrm` / `listCrm` / `getRoutesAndHowTo` sin inventar filas. API `POST /api/crm/search/assist`; spotlight toggle «Asistida» + resumen. Smoke: `scripts/smoke/ai-006-assist-search.ts`.

---

# EPIC 14 — Automatizaciones futuras

## AU-001 — Email automático
**Prioridad:** P2 — **Estado:** DONE (2026-09-16). `src/server/notifications/client-emails.ts`: 6 toggles `emailClient*`, envío texto plano vía SMTP, dedupe `email:client:…` en Notification OWNER, wiring en cron reminders y `markQuoteSent`. Smoke: `scripts/smoke/client-emails-smoke.ts`. Sin WhatsApp/SMS a clientes.

## AU-002 — Website Lead Webhook
**Prioridad:** P2 — **Estado:** DONE (2026-09-16). Canal canónico: `POST /api/public/contact` → Client LEAD + Opportunity + notificación staff + `onNewLead`. Meta Lead Ads (`/api/public/meta/leads`) permanece retirado (410).

## AU-003 — SMS
**Prioridad:** P2 — aplazado.

## AU-004 — WhatsApp
**Prioridad:** P2 — **Estado:** DONE (2026-09-16). WhatsApp a **clientes** vía Whapi.Cloud (`whapi.ts` + `client-whatsapp.ts`, toggles `whatsappClient*`, token cifrado). CallMeBot sigue solo para el equipo. Smoke: `scripts/smoke/client-whatsapp-smoke.ts`.

## AU-005 — Online Payments
**Prioridad:** P2 — aplazado (siguiente).

## AU-006 — Integraciones de crédito
**Prioridad:** P3

## AU-007 — Afiliados/comisiones
**Prioridad:** P3
