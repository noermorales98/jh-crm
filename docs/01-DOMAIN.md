# DOMAIN — Modelo de dominio

## Modelo principal

```text
User
Role

Lead
  ↓ converts to
Client
  ↓
ServiceCase
  ├── Task
  ├── Document
  ├── Note
  ├── Activity
  ├── Quote
  └── Payment
```

## Reparación de crédito

```text
ServiceCase
    1
    │
    1
CreditCase
    │
    ├── * CreditReport
    ├── * CreditItem
    └── * DisputeRound
             │
             └── * DisputeRoundItem
```

## Otros verticales

```text
ServiceCase
├── HomeBuyerCase
├── FundingCase
│      └── FundingApplication
├── PersonalLoanCase
└── ProjectCase
```

## Entidades

### Lead

Prospecto todavía no convertido en cliente.

Campos funcionales clave:

- firstName
- lastName
- phone
- email
- preferredLanguage
- source
- sourceDetail
- interestedServiceId
- status
- assignedTo
- nextFollowUpAt
- lastContactAt
- notes
- createdAt
- convertedAt

### Client

Persona que ya contrató o inició un servicio.

No debe contener directamente el estado de todos sus servicios.

### Service

Catálogo de servicios disponibles.

### ServiceCase

Expediente de un servicio específico contratado por un cliente.

Debe contener:

- clientId
- serviceId
- caseNumber
- status
- stage
- assignedTo
- startedAt
- targetDate
- nextActionAt
- completedAt
- quotedAmount
- agreedAmount
- notes

### Task

Trabajo pendiente o recordatorio vinculado a cliente y/o expediente.

### Note

Nota humana.

### Activity

Evento generado por el sistema o una acción relevante del usuario.

### Document

Metadata de documentos. El archivo real debe vivir fuera de MySQL en almacenamiento privado.

### Quote

Cotización de un servicio.

### Payment

Registro de pagos relacionados con un `ServiceCase`.

### CreditCase

Extensión especializada de un `ServiceCase` de reparación de crédito.

### CreditReport

Snapshot/reporte de crédito asociado al expediente.

### CreditItem

Elemento o cuenta del reporte que requiere seguimiento.

### DisputeRound

Ronda de disputa.

Nunca debe modelarse como `round1Date`, `round2Date`, etc.

### DisputeRoundItem

Relación entre una ronda y los elementos incluidos en dicha ronda.

### Testimonial

Testimonio del cliente con estado de aprobación y consentimiento.
