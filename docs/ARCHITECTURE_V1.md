# ARCHITECTURE V1 — Fuente canónica

> Aprobado 2026-09-08. Este archivo gobierna las decisiones arquitectónicas.
> Si otro documento de `/docs` contradice este, **prevalece ARCHITECTURE_V1**.
>
> No describe el schema Prisma actual. El inventario del repo está en `CURRENT_STATE.md`.
> La migración está en `MIGRATION_PLAN.md`.

## 1. Principio

Una persona no tiene un único servicio ni un único estado de trabajo.

```text
Client                 persona / contacto
  └── Opportunity[]    pipeline comercial (UI: “Leads”)
  └── ServiceCase[]    expediente de un servicio contratado
        └── CreditCase 1:1   solo si service = CREDIT_REPAIR
```

**No** modelar servicio, etapa de trabajo o ronda dentro de `Client`.

## 2. Decisiones congeladas

| # | Decisión |
|---|---|
| D1 | **No existe tabla `Lead`.** `Client` es la persona. `Opportunity` es el pipeline comercial y se muestra como Leads en la UI. |
| D2 | **`ServiceCase` es el expediente.** `Client` 1→N `ServiceCase`. `ServiceCase` 1→0..1 `CreditCase` (obligatorio 1:1 cuando el servicio es `CREDIT_REPAIR`). |
| D3 | **`WorkflowStage` es la única fuente de verdad de stage.** `ServiceCase.stageId` → `WorkflowStage`. **Prohibido** un campo `stage` string duplicado. `WorkflowStage` se asocia a `Service` (workflows distintos por vertical). |
| D4 | Tres relojes distintos: `Opportunity.nextFollowUpAt` (pre-venta), `ServiceCase.nextActionAt` (operación del servicio), `Task.dueAt` (tarea concreta). `CreditCase.nextReviewAt` queda **temporal** por compatibilidad y luego se depreca (sin DROP en v1). |
| D5 | Opportunity WON usa `wonServiceCaseId`. `wonCaseId` se mantiene temporalmente. |
| D6 | Tabla `Note` para notas **nuevas**. **No** backfill automático desde `ActivityLog.NOTE`. |
| D7 | `ServiceCaseStageHistory` para cambios de etapa **nuevos**. **No** reconstruir el historial anterior desde `ActivityLog`. |
| D8 | Migración **aditiva**, **dos deploys** principales. Sin dual-write prolongado. Sin DROP. Sin rename de `CreditCase` ni `CreditRound`. Sin borrar `Opportunity`. |
| D9 | El módulo Credit Repair existente se **conserva y envuelve**. No reescribir `CreditCase`, `CreditRound`, `CreditReport`, `CreditItem`, `DisputeItem`, Letters, Comparisons, ProgressReports. |

## 3. Modelo de dominio v1

```text
User / Role (enum en OrganizationMember)

Client                          persona / contacto (también prospecto)
  ├── Opportunity[]             pipeline comercial = “Leads” en UI
  ├── ServiceCase[]
  │     ├── status              OPEN | ON_HOLD | COMPLETED | CANCELED
  │     ├── stageId             → WorkflowStage (del Service del expediente)
  │     ├── nextActionAt
  │     ├── Task / Document / Note / Activity / Quote / Payment
  │     └── CreditCase?         1:1 si CREDIT_REPAIR
  │           ├── CreditReport[]
  │           ├── CreditItem[]
  │           └── CreditRound[]           (nombre persistido; concepto DisputeRound)
  │                 └── DisputeItem[]     (concepto DisputeRoundItem)
  ├── Note[]
  └── Task[]
```

Verticales futuros (P1, no bloquean v1): `HomeBuyerCase`, `FundingCase`, `PersonalLoanCase`, `ProjectCase` cuelgan de `ServiceCase` igual que `CreditCase`. Testimonios: P1.

### Alias de naming (crédito)

El código y Prisma **conservan** los nombres actuales. El dominio objetivo usa alias conceptuales:

| Concepto en docs de producto | Tabla / modelo persistido |
|---|---|
| DisputeRound | `CreditRound` |
| DisputeRoundItem | `DisputeItem` |
| Activity | `ActivityLog` |
| Contract | `ClientContract` |

No rename en v1.

## 4. Client vs Opportunity vs ServiceCase

### Client

Persona/contacto. Puede estar en ciclo comercial (`status` p.ej. LEAD) o ya haber contratado (`ACTIVE`, etc.).

- Guarda identidad, contacto, fuente, atribución.
- **No** guarda el estado operativo de cada servicio.
- **No** se duplica al “convertir”: la conversión comercial no crea otra persona.

### Opportunity (UI: Leads)

Deal / pipeline pre-venta sobre un `Client` existente.

- Etapas comerciales (`OpportunityStage`), `nextFollowUpAt`, `source`/`campaign`, owner.
- WON: crea `ServiceCase` (y `CreditCase` si CREDIT_REPAIR) en la **misma transacción**; escribe `wonServiceCaseId` (y `wonCaseId` mientras exista compatibilidad).
- LOST: no borra el Client ni la Opportunity.
- Nunca se elimina al ganar.

### ServiceCase

Expediente de un servicio contratado.

- `serviceId` → catálogo `Service` (con `code`, p.ej. `CREDIT_REPAIR`).
- `status` = abierto/cerrado (BR-004).
- `stageId` = punto del proceso (BR-005), **solo** vía `WorkflowStage`.
- `nextActionAt` = siguiente acción operacional.
- `quotedAmount` / `agreedAmount` para balance del expediente (P1 si aún vive en Quote).

## 5. WorkflowStage

Única fuente de verdad de stage.

```text
Service 1 ───── * WorkflowStage
ServiceCase.stageId → WorkflowStage
  (el stage debe pertenecer al mismo Service que ServiceCase.serviceId)
```

Unicidad objetivo: `(organizationId, serviceId, key)` y `(organizationId, serviceId, order)`.

Las etapas actuales de crédito (org-global) se **asocian** al `Service` `CREDIT_REPAIR` en el backfill. No se duplica un string `stage` en `ServiceCase`.

`ServiceCaseStageHistory` registra `fromStageId` / `toStageId` (FKs a `WorkflowStage`), actor y fecha. Solo cambios **posteriores** a la tabla; el pasado sigue en `ActivityLog.STAGE_CHANGE`.

## 6. Tres relojes de seguimiento

| Campo | Capa | Significado |
|---|---|---|
| `Opportunity.nextFollowUpAt` | Comercial / pre-venta | Cuándo volver a contactar el deal. Alimenta “Leads por contactar”. |
| `ServiceCase.nextActionAt` | Operación del servicio | Qué toca hacer en el expediente. Alimenta dashboard de casos. |
| `Task.dueAt` | Tarea concreta | Vencimiento de un trabajo asignado. |
| `CreditCase.nextReviewAt` | Legacy crédito | Compatibilidad. Dejar de escribir en el segundo deploy. Deprecar sin DROP. |

Al enviar una ronda: `CreditRound.sentAt` + `expectedReviewAt` → Activity + Task (`dueAt`) + actualizar `ServiceCase.nextActionAt`. No crear otra ronda automáticamente.

## 7. Notes vs Activity

- `Note`: texto humano nuevo (`clientId?`, `serviceCaseId?`, author, body).
- `ActivityLog`: eventos de sistema (creación, stage, documento, ronda, pago, tarea).
- `ActivityLog.type=NOTE` histórico **se deja como está**. No se migra a `Note`.

## 8. Credit Repair (envolver, no reescribir)

Crear un `ServiceCase` CREDIT_REPAIR **siempre** crea (o enlaza) un `CreditCase` 1:1.

Se conserva el código y las tablas de:

- `CreditCase`, `CreditRound`, `CreditReport`, `CreditBureauSnapshot`, `CreditItem`
- `DisputeItem`, Letters, Comparisons, ProgressReports

Cambios permitidos en esas tablas: **FKs aditivas** (`serviceCaseId` en `CreditCase`) y campos nullable nuevos. Prohibido rewrite, rename o cambio de `roundNumber` a columnas fijas.

## 9. Conversión comercial (Opportunity WON)

Reemplaza el `markWon` no atómico actual. Una transacción:

1. Client ya existe (no se crea otra persona).
2. Crear `ServiceCase` (status OPEN, `stageId` inicial del `Service`).
3. Si CREDIT_REPAIR: crear `CreditCase` con `serviceCaseId`.
4. Opportunity → WON; `wonServiceCaseId` (y `wonCaseId` temporal).
5. Client `status` → ACTIVE si estaba en ciclo de lead.
6. Activity.

Rollback completo si falla cualquier paso. Conservar `source` / `leadChannel` en Client (BR-011).

## 10. Migración (resumen)

Estrategia aditiva, **dos deploys**. Detalle en `MIGRATION_PLAN.md`.

```text
Deploy 1 — expand + backfill + corte de escritura nueva
  schema nullable + ServiceCase por cada CreditCase
  app crea ServiceCase+CreditCase juntos
  no dual-write largo

Deploy 2 — contract de lectura
  UI/API leen ServiceCase / wonServiceCaseId / nextActionAt
  nextReviewAt y wonCaseId dejan de escribirse
  NO DROP, NO rename
```

## 11. Qué queda fuera de v1 de schema

- Tabla `leads` / `lead_activities`
- Campo `ServiceCase.stage` (string)
- Rename `CreditCase` / `CreditRound` / `DisputeItem`
- Borrar `Opportunity`
- Backfill de notas o stage history históricos
- Verticales secundarios y testimonios (backlog P1)
- Editor visual de pipelines

## 12. Lectura para agentes

Antes de tocar código:

1. Este archivo.
2. `02-BUSINESS_RULES.md`
3. `03-DATABASE.md`
4. `MIGRATION_PLAN.md`
5. Ticket del backlog, uno a la vez.
6. No schema/migrate/producción sin aprobación explícita.
