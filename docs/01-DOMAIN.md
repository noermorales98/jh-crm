# DOMAIN — Modelo de dominio

> Fuente canónica de decisiones: [`ARCHITECTURE_V1.md`](ARCHITECTURE_V1.md).

## Modelo principal

```text
User
Role

Client                         persona / contacto
  ├── Opportunity[]            pipeline comercial (UI: Leads)
  └── ServiceCase[]
        ├── Task
        ├── Document
        ├── Note
        ├── Activity
        ├── Quote
        └── Payment
```

No existe entidad `Lead`. El prospecto es un `Client`; el deal es una `Opportunity`.

## Reparación de crédito

```text
ServiceCase                    (service = CREDIT_REPAIR)
    1
    │
    1
CreditCase                     (tabla persistida; no rename)
    │
    ├── * CreditReport
    ├── * CreditItem
    └── * CreditRound          (concepto: DisputeRound)
             │
             └── * DisputeItem (concepto: DisputeRoundItem)
```

El módulo de crédito existente se envuelve, no se reescribe.

## Otros verticales

P1. Misma forma: extensión 1:1 de `ServiceCase`.

```text
ServiceCase
├── HomeBuyerCase
├── FundingCase
│      └── FundingApplication
├── PersonalLoanCase
└── ProjectCase
```

## Entidades

### Client

Persona/contacto. Existe desde el primer registro (formulario, Meta, alta manual), también si aún no contrató.

No debe contener el estado operativo de todos sus servicios.

Campos funcionales clave de identidad: nombre, teléfono, email, idioma, dirección, fuente (`source` / `leadChannel`), atribución, responsable, `status` de ciclo de la persona (p.ej. LEAD vs ACTIVE), `archivedAt`.

### Opportunity

Pipeline comercial de un Client. En la UI se presenta como **Leads**.

Campos funcionales clave:

- clientId
- stage (OpportunityStage)
- ownerId
- source / campaign
- estimatedValue
- nextFollowUpAt        seguimiento comercial pre-venta
- wonServiceCaseId      al ganar (v1)
- wonCaseId             temporal, compatibilidad con CreditCase
- lostReason

Nunca se elimina al marcar WON o LOST.

### Service

Catálogo de servicios. Debe tener `code` estable (`CREDIT_REPAIR`, `HOME_BUYER`, …) además de nombre comercial.

Cada Service tiene su propio conjunto de `WorkflowStage`.

### WorkflowStage

Única fuente de verdad de la etapa operativa.

- Pertenece a un `Service` (y a la organización).
- `ServiceCase.stageId` apunta aquí.
- **Prohibido** duplicar un string `stage` en `ServiceCase`.

### ServiceCase

Expediente de un servicio específico contratado por un cliente.

Debe contener:

- clientId
- serviceId
- caseNumber
- status                 OPEN | ON_HOLD | COMPLETED | CANCELED
- stageId                → WorkflowStage del mismo Service
- assignedTo
- startedAt
- targetDate
- nextActionAt           siguiente acción operacional
- completedAt
- quotedAmount
- agreedAmount
- notes
- archivedAt?

### ServiceCaseStageHistory

Historial de cambios de `stageId` **nuevos** (no se reconstruye el pasado desde ActivityLog).

- serviceCaseId
- fromStageId?
- toStageId
- changedBy
- changedAt

### Task

Trabajo pendiente o recordatorio vinculado a cliente y/o expediente.

`dueAt` es el vencimiento de esa tarea concreta. No sustituye a `Opportunity.nextFollowUpAt` ni a `ServiceCase.nextActionAt`.

### Note

Nota humana **nueva**. Entidad separada de Activity.

No se rellenan notas históricas desde `ActivityLog.NOTE`.

### Activity

Evento generado por el sistema o una acción relevante del usuario. En el schema actual: `ActivityLog`.

### Document

Metadata de documentos. El archivo real vive fuera de MySQL en almacenamiento privado.

### Quote

Cotización de un servicio, ligada a Client y preferentemente a ServiceCase.

### Payment

Registro de pagos relacionados con un `ServiceCase`.

### CreditCase

Extensión especializada 1:1 de un `ServiceCase` CREDIT_REPAIR.

Tabla y código existentes se conservan. `nextReviewAt` queda temporal; la operación lee/escribe `ServiceCase.nextActionAt`.

### CreditReport

Snapshot/reporte de crédito asociado al `CreditCase` (scores por buró en snapshots existentes).

### CreditItem

Elemento o cuenta del reporte que requiere seguimiento.

### CreditRound (DisputeRound)

Ronda de disputa. Tabla persistida: `CreditRound`.

Nunca debe modelarse como `round1Date`, `round2Date`, etc.

### DisputeItem (DisputeRoundItem)

Relación entre una ronda y los elementos incluidos. Tabla persistida: `DisputeItem`.

### Testimonial

P1. Testimonio del cliente con estado de aprobación y consentimiento.
