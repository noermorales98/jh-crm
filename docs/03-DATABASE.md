# DATABASE — Modelo objetivo v1

## Tablas principales

```text
users
roles

leads
lead_activities

clients
services
service_cases
service_case_stage_history

tasks
notes
activities
documents

quotes
quote_items
payments
contracts

credit_cases
credit_reports
credit_items
dispute_rounds
dispute_round_items

home_buyer_cases

funding_cases
funding_applications

personal_loan_cases

project_cases

testimonials

audit_logs
```

## Relaciones críticas

```text
Lead 0..1 ───── 1 Client

Client 1 ───── * ServiceCase

Service 1 ───── * ServiceCase

ServiceCase 1 ───── * Task
ServiceCase 1 ───── * Note
ServiceCase 1 ───── * Activity
ServiceCase 1 ───── * Document
ServiceCase 1 ───── * Quote
ServiceCase 1 ───── * Payment

ServiceCase 1 ───── 0..1 CreditCase

CreditCase 1 ───── * CreditReport
CreditCase 1 ───── * CreditItem
CreditCase 1 ───── * DisputeRound

DisputeRound 1 ───── * DisputeRoundItem
CreditItem 1 ───── * DisputeRoundItem
```

## ServiceCase

```text
id
clientId
serviceId
caseNumber
status
stage
assignedTo
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

## ServiceCaseStageHistory

```text
id
serviceCaseId
fromStage
toStage
changedBy
changedAt
```

## Task

```text
id
clientId?
serviceCaseId?
assignedTo
title
description
priority
status
dueAt
reminderAt
completedAt
createdBy
createdAt
updatedAt
```

## Document

```text
id
clientId
serviceCaseId?
category
fileName
storageKey
mimeType
size
uploadedBy
uploadedAt
```

## Activity

```text
id
type
entityType
entityId
metadata
actorId
createdAt
```

## CreditCase

```text
id
serviceCaseId
initialReportDate
nextReviewAt
status
goals
```

## CreditReport

```text
id
creditCaseId
reportDate
provider
experianScore?
equifaxScore?
transunionScore?
documentId?
notes
```

## CreditItem

```text
id
creditCaseId
creditorName
accountReference
bureau
category
status
balance?
reportedDate?
disputeStatus
notes
```

## DisputeRound

```text
id
creditCaseId
roundNumber
preparedAt?
sentAt?
expectedReviewAt?
reviewedAt?
status
notes
```

## DisputeRoundItem

```text
id
disputeRoundId
creditItemId
bureau
reason
action
outcome?
```

## Payment

```text
id
serviceCaseId
amount
method
reference
paymentDate
status
notes
createdAt
updatedAt
```

## Contract

```text
id
serviceCaseId
contractVersion
sentAt?
signedAt?
cancellationDeadline?
canceledAt?
status
```

## AuditLog

```text
id
userId
action
entityType
entityId
metadata
ipAddress?
createdAt
```

## Pendiente de validar con repositorio

Este archivo describe el objetivo funcional.

Antes de migrar:

1. auditar schema actual;
2. identificar tablas reutilizables;
3. definir estrategia de migración;
4. revisar índices y claves únicas;
5. revisar política de borrado;
6. probar migraciones en entorno no productivo.
