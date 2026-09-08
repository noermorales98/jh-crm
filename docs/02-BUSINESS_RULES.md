# BUSINESS RULES — Reglas del negocio

## Clientes y servicios

### BR-001
Un `Client` puede tener múltiples `ServiceCase`.

### BR-002
Cada `ServiceCase` pertenece a un único `Client`.

### BR-003
El estado del cliente y el estado del servicio son conceptos diferentes.

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
`ServiceCase.stage` responde en qué punto del proceso se encuentra.

## Leads

### BR-010
Un Lead nunca se elimina al convertirse.

### BR-011
La conversión debe conservar su fuente original.

### BR-012
`convertLeadToClient()` debe ser transaccional.

Debe:

1. crear Client;
2. enlazar Lead;
3. marcar Lead como CONVERTED;
4. crear ServiceCase inicial;
5. registrar Activity.

Si algo falla, no debe quedar una conversión parcial.

## Timeline

### BR-020
Los eventos importantes deben crear `Activity` automáticamente.

Ejemplos:

- creación de expediente;
- cambio de etapa;
- documento agregado;
- ronda enviada;
- pago registrado;
- tarea completada.

### BR-021
Las notas humanas y las actividades del sistema son entidades separadas.

## Reparación de crédito

### BR-030
Una reparación puede tener cero o muchas rondas.

### BR-031
No existe un número fijo de rondas.

### BR-032
No se debe crear una nueva ronda automáticamente cada 30 o 40 días.

### BR-033
Al marcar una ronda como enviada:

- guardar `sentAt`;
- solicitar o guardar `expectedReviewAt`;
- crear Activity;
- crear Task de seguimiento.

### BR-034
La siguiente acción siempre debe depender de revisión humana del resultado real.

### BR-035
Cada elemento disputado debe conservar:

- elemento;
- buró;
- motivo;
- acción;
- resultado.

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
Pagos, contratos, rondas, actividades y logs no deben desaparecer silenciosamente.

## Testimonios

### BR-080
Un testimonio no se publica automáticamente.

Debe existir:

- consentimiento;
- aprobación;
- estado de publicación.
