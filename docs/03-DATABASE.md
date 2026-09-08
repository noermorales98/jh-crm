# DATABASE — Modelo objetivo v1

> Fuente canónica: [`ARCHITECTURE_V1.md`](ARCHITECTURE_V1.md).
> Este archivo describe el **objetivo v1** sobre el schema real (Prisma/MySQL). No está aplicado todavía.

## Tablas principales

Persistidas hoy y que **se conservan**:

```text
users
organization_members          (Role es enum, no tabla)
clients
opportunities                 (pipeline comercial = Leads UI)
services
service_packages
workflow_stages
tasks
activity_logs
documents
quotes / quote_items
payments / receipts
client_contracts
credit_cases
credit_rounds                 (concepto DisputeRound)
credit_reports
credit_items
dispute_items                 (concepto DisputeRoundItem)
audit_logs
```

**Crear (aditivo):**

```text
service_cases
service_case_stage_history
notes
```

**Alterar (aditivo, nullable primero):**

```text
services.code
workflow_stages.serviceId
credit_cases.serviceCaseId          unique 1:1
opportunities.wonServiceCaseId
tasks.serviceCaseId
documents.serviceCaseId
payments.serviceCaseId
quotes.serviceCaseId
activity_logs.serviceCaseId
```

**No crear:** `leads`, `lead_activities`.

**No rename / no DROP en v1:** `credit_cases`, `credit_rounds`, `opportunities`, `wonCaseId`, `credit_cases.nextReviewAt`.

Verticales P1 (no v1 inmediato): `home_buyer_cases`, `funding_cases`, `personal_loan_cases`, `project_cases`, `testimonials`.

## Relaciones críticas

```text
Client 1 ───── * Opportunity
Client 1 ───── * ServiceCase

Service 1 ───── * ServiceCase
Service 1 ───── * WorkflowStage

ServiceCase.stageId → WorkflowStage
  (mismo serviceId)

ServiceCase 1 ───── * Task
ServiceCase 1 ───── * Note
ServiceCase 1 ───── * ActivityLog
ServiceCase 1 ───── * Document
ServiceCase 1 ───── * Quote
ServiceCase 1 ───── * Payment

ServiceCase 1 ───── 0..1 CreditCase     (1:1 si CREDIT_REPAIR)

Opportunity.wonServiceCaseId → ServiceCase
Opportunity.wonCaseId        → CreditCase     (temporal)

CreditCase 1 ───── * CreditReport
CreditCase 1 ───── * CreditItem
CreditCase 1 ───── * CreditRound

CreditRound 1 ───── * DisputeItem
CreditItem 1 ───── * DisputeItem
```

## Service

Añadir `code` único por organización, p.ej. `CREDIT_REPAIR`.

## WorkflowStage

```text
id
organizationId
serviceId                 (NUEVO; etapa pertenece a un Service)
key
name
order
color
isTerminal
isActive
```

Unicidad:

```text
@@unique([organizationId, serviceId, key])
@@unique([organizationId, serviceId, order])
```

## ServiceCase

```text
id
organizationId
clientId
serviceId
caseNumber
status                    OPEN | ON_HOLD | COMPLETED | CANCELED
stageId                   FK WorkflowStage     — NO campo stage string
assignedToId
startedAt
targetDate
nextActionAt
completedAt
quotedAmount
agreedAmount
notes
createdAt
updatedAt
archivedAt?
```

Índices: `(organizationId, caseNumber)` unique; `(clientId, status)`; `(organizationId, nextActionAt)`; `(stageId)`.

## ServiceCaseStageHistory

Solo cambios **nuevos**. No backfill obligatorio desde ActivityLog.

```text
id
serviceCaseId
fromStageId?              FK WorkflowStage
toStageId                 FK WorkflowStage
changedBy
changedAt
```

## Note

Solo notas **nuevas**. No backfill desde `ActivityLog.NOTE`.

```text
id
organizationId
clientId?
serviceCaseId?
authorUserId
body
createdAt
updatedAt
```

## Task

Se conserva el modelo actual. Añadir `serviceCaseId?`.

`dueAt` = vencimiento de la tarea. No reutilizar para follow-up comercial ni next action del expediente.

## Document / Payment / Quote / ActivityLog

Añadir `serviceCaseId?` aditivo. Conservar `caseId` → CreditCase mientras dure la compatibilidad. No DROP.

## Opportunity

```text
id
organizationId
clientId
ownerId?
stage
estimatedValue?
source?
campaign?
lostReason?
nextFollowUpAt?           seguimiento comercial pre-venta
wonCaseId?                temporal → CreditCase
wonServiceCaseId?         v1 → ServiceCase
createdAt
updatedAt
```

## CreditCase

Tabla existente. Añadir:

```text
serviceCaseId?            unique; NOT NULL tras deploy 2
```

Conservar `clientId`, `caseCode`, `state`, `stageId`, `nextReviewAt` (este último **deprecated** tras deploy 2: la fuente operativa es `ServiceCase.nextActionAt`).

No rewrite del resto de campos ni de hijas (reports, items, rounds, letters, comparisons, progress reports).

## CreditRound / DisputeItem

Sin cambio de tabla ni rename.

`CreditRound`: `roundNumber`, `sentAt`, `expectedReviewAt`, `reviewedAt`, `status`.

`DisputeItem`: join ronda ↔ item; `action` puede añadirse nullable más adelante (CR-006), no es rename.

## Payment

Objetivo de lectura: `serviceCaseId` + amount/method/reference/status.

Balance v1 (P1): `ServiceCase.agreedAmount - sum(payments RECEIVED)`.

## Checklist previo a aplicar (aún no ejecutado)

1. backup y staging;
2. `MIGRATION_PLAN.md` — dos deploys;
3. índices y uniques de `WorkflowStage` por `serviceId`;
4. conteos CreditCase = ServiceCase CREDIT_REPAIR;
5. no DROP;
6. no correr migrate desde Vercel Preview contra prod.
