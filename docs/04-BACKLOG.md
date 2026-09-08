# BACKLOG — JH CRM

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

**Regla:** no modificar producción durante esta tarea.

---

## ARC-002 — Congelar modelo de dominio v1
**Prioridad:** P0

Validar:

```text
Lead
Client
Service
ServiceCase
Task
Note
Activity
Document
Quote
Payment
CreditCase
CreditReport
CreditItem
DisputeRound
DisputeRoundItem
AuditLog
```

**Done cuando:**

- relaciones aprobadas;
- nombres consistentes;
- migración definida;
- no existe servicio/estado único dentro de Client.

---

## ARC-003 — Crear ServiceCase
**Prioridad:** P0

Crear entidad y relaciones base.

**Acceptance Criteria:**

- Client puede tener múltiples ServiceCase.
- Cada ServiceCase pertenece a Service.
- Tiene status y stage separados.
- Tiene `nextActionAt`.
- Tiene historial de etapas.

---

# EPIC 1 — Leads

## LD-001 — Crear Lead
**Prioridad:** P0

Campos mínimos:

- nombre;
- teléfono;
- email;
- idioma;
- fuente;
- servicio interesado;
- estado;
- responsable;
- seguimiento.

**Acceptance Criteria:**

- se crea correctamente;
- aparece en listado;
- registra Activity;
- valida datos obligatorios.

---

## LD-002 — Editar Lead
**Prioridad:** P0

**Acceptance Criteria:**

- editar datos;
- editar fuente;
- editar servicio interesado;
- editar responsable;
- conservar historial.

---

## LD-003 — Pipeline de Leads
**Prioridad:** P0

Estados base:

```text
NEW
CONTACT_PENDING
CONTACTED
QUALIFIED
FOLLOW_UP
QUOTE_SENT
LOST
CONVERTED
```

**Acceptance Criteria:**

- filtrar por estado;
- cambiar estado;
- registrar historial;
- no perder fuente original.

---

## LD-004 — Seguimiento de Lead
**Prioridad:** P0

**Acceptance Criteria:**

- definir próxima fecha;
- crear Task;
- mostrar en dashboard;
- marcar vencido si corresponde.

---

## LD-005 — Convertir Lead a Client
**Prioridad:** P0

Debe ejecutar transacción:

1. crear Client;
2. enlazar Lead;
3. cambiar Lead a CONVERTED;
4. crear ServiceCase;
5. crear Activity.

**Acceptance Criteria:**

- no duplica cliente;
- no elimina Lead;
- conserva source;
- rollback completo si una operación falla.

---

# EPIC 2 — Clientes

## CL-001 — Listado de Clientes
**Prioridad:** P0

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

**Acceptance Criteria:**

- cliente puede tener dos o más ServiceCase;
- cada uno mantiene stage independiente;
- cada uno mantiene pagos y tareas independientes.

---

# EPIC 3 — Service Cases

## SC-001 — Crear expediente
**Prioridad:** P0

**Acceptance Criteria:**

- asociado a cliente;
- asociado a servicio;
- genera caseNumber;
- status OPEN;
- stage inicial;
- Activity automática.

---

## SC-002 — Cambiar etapa
**Prioridad:** P0

**Acceptance Criteria:**

- guarda fromStage;
- guarda toStage;
- guarda actor;
- guarda fecha;
- crea Activity;
- conserva StageHistory.

---

## SC-003 — Próxima acción
**Prioridad:** P0

**Acceptance Criteria:**

- guardar `nextActionAt`;
- mostrar en ficha;
- mostrar en dashboard;
- permitir actualizarla.

---

## SC-004 — Completar expediente
**Prioridad:** P0

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

Notas humanas separadas de Activity.

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

---

# EPIC 6 — Reparación de crédito

## CR-001 — Crear CreditCase
**Prioridad:** P0

Se crea solamente para ServiceCase de reparación de crédito.

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

## CR-005 — Crear DisputeRound
**Prioridad:** P0

Estados sugeridos:

```text
DRAFT
PREPARED
SENT
WAITING_RESPONSE
REVIEWED
COMPLETED
```

---

## CR-006 — Agregar items a ronda
**Prioridad:** P0

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
- crear Task de revisión;
- actualizar próxima acción.

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

## HB-001 — HomeBuyerCase
**Prioridad:** P1

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
**Prioridad:** P1

## FD-002 — FundingApplication
**Prioridad:** P1

---

## PL-001 — PersonalLoanCase
**Prioridad:** P1

---

## PJ-001 — ProjectCase
**Prioridad:** P1

Para web/CRM.

---

# EPIC 9 — Testimonios

## TM-001 — Crear Testimonial
**Prioridad:** P1

## TM-002 — Consentimiento
**Prioridad:** P1

## TM-003 — Aprobar/Publicar
**Prioridad:** P1

## TM-004 — Endpoint público
**Prioridad:** P1

Nunca publicar automáticamente.

---

# EPIC 10 — Seguridad y auditoría

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
**Prioridad:** P2

## AI-002 — Sanitización de datos
**Prioridad:** P0 antes de activar IA

## AI-003 — Resumen de expediente
**Prioridad:** P2

## AI-004 — Siguiente acción sugerida
**Prioridad:** P2

## AI-005 — Extraer acciones desde nota
**Prioridad:** P2

Nunca enviar SSN/ITIN completos a modelos externos si no es imprescindible y aprobado.

---

# EPIC 14 — Automatizaciones futuras

## AU-001 — Email automático
**Prioridad:** P2

## AU-002 — Website Lead Webhook
**Prioridad:** P2

## AU-003 — SMS
**Prioridad:** P2

## AU-004 — WhatsApp
**Prioridad:** P2

## AU-005 — Online Payments
**Prioridad:** P2

## AU-006 — Integraciones de crédito
**Prioridad:** P3

## AU-007 — Afiliados/comisiones
**Prioridad:** P3
