# BUSINESS RULES — Reglas del negocio

> Alineado a [`ARCHITECTURE_V1.md`](ARCHITECTURE_V1.md).

## Clientes y servicios

### BR-001
Un `Client` puede tener múltiples `ServiceCase`.

### BR-002
Cada `ServiceCase` pertenece a un único `Client`.

### BR-003
El estado de la persona (`Client.status`) y el estado del servicio (`ServiceCase.status` / `stageId`) son conceptos diferentes.

No guardar etapa de trabajo ni ronda actual en `Client`.

### BR-004
`ServiceCase.status` responde si el expediente está abierto o cerrado.

Valores base:

```text
OPEN
ON_HOLD
COMPLETED
CANCELED
```

### BR-005
La etapa operativa es **solo** `ServiceCase.stageId` → `WorkflowStage`.

`WorkflowStage` pertenece a un `Service`. El stage de un expediente debe ser del mismo servicio.

No existe `ServiceCase.stage` como string paralelo.

## Comercial (Leads = Opportunity)

### BR-010
Una `Opportunity` nunca se elimina al marcarse WON o LOST. El `Client` tampoco.

### BR-011
La conversión debe conservar la fuente original del Client (`source` / `leadChannel` / atribución).

### BR-012
`markOpportunityWon()` (o equivalente) debe ser transaccional.

El Client **ya existe**. La operación debe:

1. crear `ServiceCase` inicial;
2. si el servicio es `CREDIT_REPAIR`, crear `CreditCase` 1:1 con `serviceCaseId`;
3. marcar Opportunity como WON;
4. escribir `wonServiceCaseId` (y `wonCaseId` mientras dure la compatibilidad);
5. pasar `Client.status` a ACTIVE si correspondía al ciclo de lead;
6. registrar Activity.

Si algo falla, no debe quedar una conversión parcial (ni caso de crédito huérfano).

### BR-013
Seguimientos — no mezclar relojes:

| Campo | Uso |
|---|---|
| `Opportunity.nextFollowUpAt` | pre-venta / deal |
| `ServiceCase.nextActionAt` | operación del expediente |
| `Task.dueAt` | vencimiento de una tarea |

`CreditCase.nextReviewAt` es legado: no usarlo como fuente de verdad en v1; deprecar después del segundo deploy.

## Timeline

### BR-020
Los eventos importantes deben crear `Activity` automáticamente.

Ejemplos:

- creación de expediente;
- cambio de etapa (`stageId`);
- documento agregado;
- ronda enviada;
- pago registrado;
- tarea completada;
- Opportunity WON / LOST.

### BR-021
Las notas humanas (`Note`) y las actividades del sistema (`ActivityLog`) son entidades separadas.

Las filas históricas `ActivityLog.NOTE` no se migran automáticamente a `Note`.

### BR-022
Cada cambio de `ServiceCase.stageId` posterior a v1 escribe `ServiceCaseStageHistory` (fromStageId, toStageId, actor, fecha) además de Activity.

No es obligatorio reconstruir el historial anterior.

## Reparación de crédito

### BR-030
Una reparación puede tener cero o muchas rondas (`CreditRound`).

### BR-031
No existe un número fijo de rondas.

### BR-032
No se debe crear una nueva ronda automáticamente cada 30 o 40 días.

### BR-033
Al marcar una ronda como enviada:

- guardar `sentAt`;
- solicitar o guardar `expectedReviewAt`;
- crear Activity;
- crear Task de seguimiento (`dueAt`);
- actualizar `ServiceCase.nextActionAt`.

### BR-034
La siguiente acción siempre debe depender de revisión humana del resultado real.

### BR-035
Cada elemento disputado debe conservar:

- elemento;
- buró;
- motivo;
- acción;
- resultado.

### BR-036
Un `ServiceCase` CREDIT_REPAIR tiene exactamente un `CreditCase`. El módulo de crédito existente se envuelve; no se reescribe ni se renombra.

## Pagos

### BR-040
Un expediente puede tener múltiples pagos.

### BR-041
No usar solamente `isPaid`.

El sistema debe calcular:

```text
Agreed Amount
- Total Paid
= Balance
```

a nivel `ServiceCase` (P1 si hoy el balance vive en Quote).

### BR-042
Zelle, Cash, Bank Transfer y otros métodos pueden registrarse manualmente en MVP.

## Documentos

### BR-050
Los archivos no se almacenan como binarios en MySQL.

### BR-051
MySQL almacena metadata y `storageKey`.

### BR-052
Los documentos sensibles deben ser privados.

### BR-053
El acceso debe validar sesión y permisos antes de generar una URL temporal.

## Datos sensibles

### BR-060
SSN/ITIN no deben mostrarse completos por defecto.

### BR-061
SSN/ITIN no deben usarse como:

- username;
- slug;
- parámetro público;
- analytics property;
- mensaje de log.

### BR-062
Toda visualización de identificadores sensibles debe ser auditable.

## Eliminación

### BR-070
Clientes y expedientes no deben eliminarse destructivamente mediante acciones comunes.

Preferir:

```text
archivedAt
deletedAt
```

### BR-071
Pagos, contratos, rondas, actividades, opportunities y logs no deben desaparecer silenciosamente.

No DROP de tablas v1 (`CreditCase`, `CreditRound`, `Opportunity`, …).

## Testimonios

### BR-080
Un testimonio no se publica automáticamente.

Debe existir:

- consentimiento;
- aprobación;
- estado de publicación.
