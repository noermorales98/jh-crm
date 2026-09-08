# GAP ANALYSIS — Estado actual vs objetivo

> Auditoría ARC-001 (2026-09-08). **Documento histórico.** Las decisiones posteriores están en [`ARCHITECTURE_V1.md`](ARCHITECTURE_V1.md): no hay tabla Lead; Opportunity = Leads UI; ServiceCase envuelve CreditCase; dos deploys aditivos.
> Inventario: `CURRENT_STATE.md`. Plan vigente: `MIGRATION_PLAN.md`.

## Objetivo

Comparar la implementación actual contra:

```text
Lead
→ Client
→ ServiceCase
```

y:

```text
ServiceCase
→ CreditCase
→ CreditReport
→ CreditItem
→ DisputeRound
```

**Veredicto:** el CRM es un producto operativo de **reparación de crédito** (Client + CreditCase + CreditRound). El modelo multi-servicio `Lead → Client → ServiceCase` **no está materializado**. No conviene reescribir desde cero: hay que envolver y extraer.

## Tabla

| Área | Actual | Objetivo | Gap | Prioridad |
|---|---|---|---|---|
| Leads | No hay tabla `Lead`. Prospecto = `Client.status=LEAD`. Inbound web/Meta. `Opportunity` con UI retirada (`/crm/oportunidades` → dashboard). No hay `/crm/leads`. | Entidad Lead, pipeline NEW→…→CONVERTED/LOST, fuente, seguimiento, Activity | Extraer Lead; restaurar pipeline; `convertLeadToClient()` | P0 |
| Client | Persona + `status` de ciclo (LEAD/ACTIVE/PAUSED/COMPLETED/CANCELLED/ARCHIVED) + `serviceRequested` texto. Tabs Resumen/Expediente/Casos/Actividad. | Persona convertida; **sin** estado de todos sus servicios; tabs Resumen/Servicios/Actividad/Tareas/Documentos/Pagos/Notas/Testimonios | Separar status de persona vs expediente; quitar leakage de servicio; completar ficha | P0 |
| ServiceCase | **No existe.** `CreditCase` es el único expediente (`state` + `stageId`). Catálogo `Service` solo para quotes, sin `serviceId` en el caso. | Expediente central: clientId, serviceId, caseNumber, status, stage, nextActionAt, quoted/agreed amount, StageHistory | Crear ServiceCase; envolver cada CreditCase 1:1; sembrar CREDIT_REPAIR | P0 |
| Tasks | `Task` rico (client/case/round, due, assignee obligatorio). Dashboard hoy/vencidas. | Task → client y/o ServiceCase; next action en dashboard | Reapuntar `caseId` → ServiceCase; añadir `nextActionAt` en expediente (hoy `nextReviewAt`) | P0 |
| Activity | `ActivityLog` relacional; eventos BR-020 mayormente cubiertos. `NOTE` = catch-all. | Timeline confiable; Activity polimórfica; **Note separada** (BR-021) | Crear `notes`; dejar de usar NOTE como nota humana; StageHistory tabular | P0 |
| Documents | S3 privado + metadata MySQL + URL firmada 5 min + auth. FK a CreditCase. | Storage privado, metadata, ServiceCase opcional, checklist por servicio | Casi alineado. Reapuntar FK; ampliar categorías; checklist P1 | P0 |
| CreditCase | Existe y es el caso. Reports + snapshots + items + letters + comparisons + progress reports. | Vertical 1:1 bajo ServiceCase; initialReportDate, goals, nextReviewAt | Introducir padre ServiceCase; mapear campos; no reescribir el módulo | P0 |
| DisputeRounds | `CreditRound` N filas (`roundNumber`). `DisputeItem` join. `sentAt` + `expectedReviewAt` + Activity + Task. No round1/2/3. | `DisputeRound[]` ilimitadas; item con bureau/reason/action/outcome; no auto-ronda 30/40 d | Estructura OK. Naming distinto. Falta `action` en item. Alias, no migración de columnas fijas | P0 |
| Payments | Múltiples pagos, métodos Zelle/Cash/Bank/Stripe/Other, sin `isPaid`. Balance = Quote.total − pagado. Planes/recibos/consultas extra. | Payment → ServiceCase; agreedAmount − sum(paid) = balance | Falta monto acordado a nivel expediente; balance de quote ≠ balance de caso | P1 |
| Audit | `AuditLog` existe. SSN last4 en claro + cifrado. IA sin `sanitizeForAI`. MFA enrolado, login no lo fuerza. Soft-delete incompleto (no en cases/payments/rounds). | AuditLog, enmascarar SSN, auditar VIEW_SENSITIVE_ID, soft delete, sanitizar IA | Completar enmascarado/auditoría de visualización; sanitizar IA; MFA; archive en expedientes | P0 |
| Roles | OWNER/ADMIN/SPECIALIST/STAFF/VIEWER | ADMIN/AGENT/VIEWER | Mapear (AGENT ≈ STAFF/SPECIALIST); no colapsar roles sin diseño de permisos | P0 |
| StageHistory | Solo `ActivityLog.STAGE_CHANGE` | `service_case_stage_history` (from/to/actor/fecha) | Nueva tabla + backfill opcional desde ActivityLog | P0 |
| Quotes / Contracts | Quote + ClientContract maduros | Quote/Contract ligados a ServiceCase | Reapuntar FKs; alinear sentAt/canceledAt | P1 |
| Dashboard | Operativo crédito-céntrico; “nuevos leads” = Client LEAD 7d; no pipeline leads | Hoy / vencido / esperando seguimiento; KPIs leads + atención | Reapuntar a Lead + ServiceCase.nextActionAt | P0 |
| Verticales | Ausentes | HomeBuyerCase, FundingCase, PersonalLoanCase, ProjectCase | No migrar datos (no hay). Crear después del núcleo (roadmap Fase 5) | P1 |
| Testimonials | Ausente | CRUD + consentimiento + aprobación + endpoint público | No hay datos que migrar | P1 |
| Hostinger/Vercel | Prisma singleton, sin pooler/SSL en código | Conexión serverless segura, pooling, backups, envs separados | Riesgo operativo P0 antes de migraciones largas | P0 |

## Riesgos de refactor

1. **Radio de explosión de `CreditCase`.** Casi toda la UI (`/crm/casos/...`), FKs de tasks/docs/payments/rounds/letters/comparisons y queries de dashboard/IA apuntan a `CreditCase`. Un rename in-place rompe producción. Estrategia: **envolver**, no renombrar (ver `MIGRATION_PLAN.md`).
2. **Client es a la vez Lead y persona.** Split a tabla `leads` puede duplicar identidad (mismo teléfono/email en Lead y Client) o dejar Clients LEAD huérfanos si se borra. **Nunca borrar** filas Client en el backfill.
3. **`markWon` no es atómico.** Ya puede haber `CreditCase` sin Opportunity WON / Client ACTIVE. El backfill debe tolerar inconsistencias.
4. **Opportunity vs Lead.** Meta y contact siguen escribiendo Opportunity; la UI está muerta. Dual-write o se pierde atribución comercial (`wonCaseId`, etapas, campañas).
5. **ActivityLog.NOTE mezclada.** Extraer a `notes` sin clasificar contaminará notas humanas con “cliente editado”.
6. **CreditItem anclado a CreditReport.** El objetivo los cuelga de CreditCase. Mover FKs puede romper comparaciones y cartas.
7. **Doble tarea de revisión** (`CREDIT_UPDATE` al enviar + `REVIEW_RESULT` en automation).
8. **Conexión Vercel → Hostinger** sin pooler: migraciones y dual-write aumentan conexiones. Riesgo de timeout / `Too many connections` y migración a medias.
9. **Permisos.** Cinco roles reales vs tres del doc. Colapsar SPECIALIST/STAFF a AGENT sin matriz nueva abre o cierra SSN/docs por error.
10. **IA.** Briefs de cliente envían dirección/teléfono/`ssnMasked` a OpenRouter. Refactor de dominio no debe ampliar el payload.

## Datos que necesitan migración

| Origen actual | Destino objetivo | Notas |
|---|---|---|
| `Client` con `status=LEAD` | Fila `Lead` + conservar `Client` | Mapear source, leadChannel, serviceRequested → interestedService, assignedTo, fechas. Enlace `lead.convertedClientId` / `client.leadId` nulo hasta convertir. |
| `Client` ACTIVE/otros | `Client` (persona) | Recortar semántica de PAUSED/COMPLETED/CANCELLED de **trabajo** hacia ServiceCase. |
| Cada `CreditCase` | Un `ServiceCase` (service=CREDIT_REPAIR) + `CreditCase.serviceCaseId` | `state`→status (`PAUSED`→`ON_HOLD` si se adopta el enum objetivo), `stageId`→stage, `nextReviewAt`→`nextActionAt`, `caseCode`→`caseNumber`. |
| `WorkflowStage` + `ActivityLog.STAGE_CHANGE` | `service_case_stage_history` | Backfill best-effort desde metadata; no es 1:1 perfecto. |
| `CreditRound` / `DisputeItem` | Conceptualmente DisputeRound / DisputeRoundItem | **Sin mover filas** en MVP. Rename de tablas opcional después. |
| `Task.caseId`, `Document.caseId`, `Payment.caseId`, `Quote.caseId`, `ActivityLog.caseId` | `serviceCaseId` (additive) | Dual-write luego cortar. No DROP de `caseId` hasta QA. |
| `Quote.total` + payments | `ServiceCase.quotedAmount` / `agreedAmount` | Heurística: quote ACCEPTED/PAID más reciente del caso; revisar a mano si hay varias. |
| `Opportunity` | Overlay o deprecado | No borrar. Mapear WON → conversión; LOST → Lead LOST si se extrae Lead. |
| `ActivityLog` type NOTE | Tabla `notes` (subconjunto) | Solo filas que sean notas humanas reales; el resto se queda como Activity. |
| Catálogo `Service` | Semilla códigos CREDIT_REPAIR, HOME_BUYER, … | Hoy `Service` no tiene `code`; añadir columna o mapear por nombre. |

**No hay datos que migrar** para: round1Date/round2Date (nunca existieron), testimonials, HomeBuyer/Funding/PersonalLoan/ProjectCase.

**Conteos a tomar en staging (no ejecutados en esta auditoría):** clients por `status`, opportunities por `stage`, credit_cases, credit_rounds, dispute_items, payments, documents, activity_logs, quotes.

## Código reutilizable

- `auth.ts`, `src/server/auth/*` (guards, permissions, session).
- Layout y design system (`app/crm/*` shell, `src/components/ui`).
- `src/server/clients`, sensitive profile, archivo.
- Todo el vertical crédito: `src/server/cases`, `rounds`, `disputes`, `letters`, `comparisons`, `credit-reports`, `progress-reports`.
- `src/server/tasks`, `documents`, `payments`, `quotes`, `receipts`, `contracts`.
- `src/server/activity`, `src/server/audit`.
- `src/lib/storage/s3.ts` + `app/api/files/*`.
- `src/server/dashboard` (reapuntar, no tirar).
- Folios, WorkflowStage UI (`/crm/configuracion/etapas`).
- Catálogo `src/server/services`.
- Portal, intake, mails, automations/cron, smoke scripts.

## Código que no debe conservarse

Como **modelo de dominio** (el código puede quedar temporalmente en dual-write):

- `Client.status` como estado del servicio / ronda.
- `Client.serviceRequested` como el servicio contratado.
- Opportunity como **única** representación del pipeline de leads (la UI ya está retirada; no reconstruir el Kanban sobre Opportunity si se introduce Lead).
- `ActivityLog.NOTE` como almacén de notas humanas.
- Cualquier diseño de “un cliente = un caso de crédito”.
- Ruta vacía `app/mails/`.

**No borrar** en esta fase: tablas Prisma, `CreditCase`, `CreditRound`, `Opportunity`, `MetaLeadEvent`, módulos de cartas/comparaciones. Eso es deprecación posterior al backfill validado, no de esta auditoría.
