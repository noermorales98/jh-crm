# SECURITY — Reglas mínimas del MVP

El CRM puede manejar:

- identificación personal;
- direcciones;
- reportes de crédito;
- SSN/ITIN;
- contratos;
- documentación financiera;
- pagos.

La seguridad forma parte del MVP.

## Roles iniciales

```text
ADMIN
AGENT
VIEWER
```

## Permisos base

| Acción | Admin | Agent | Viewer |
|---|:---:|:---:|:---:|
| Ver clientes | ✓ | ✓ | ✓ |
| Editar clientes | ✓ | ✓ | — |
| Ver SSN completo | Configurable | — | — |
| Ver documentos sensibles | ✓ | ✓ | Configurable |
| Registrar ronda | ✓ | ✓ | — |
| Registrar pago | ✓ | Configurable | — |
| Eliminar expediente | ✓ | — | — |
| Administrar usuarios | ✓ | — | — |
| Publicar testimonial | ✓ | — | — |

## SSN / ITIN

Mostrar por defecto:

```text
•••-••-1234
```

No usar como:

- username;
- slug;
- URL;
- log;
- analytics;
- identificador público.

## Auditoría

Registrar acciones sensibles:

- VIEW_SENSITIVE_ID
- PAYMENT_CREATED
- PAYMENT_UPDATED
- DOCUMENT_DOWNLOADED
- CASE_ARCHIVED
- USER_PERMISSION_CHANGED

## Documentos

Flujo:

```text
usuario autenticado
↓
validar permiso
↓
generar acceso temporal
↓
archivo privado
```

## Soft Delete

Preferir:

```text
archivedAt
deletedAt
```

No borrar silenciosamente:

- payments;
- dispute rounds;
- contracts;
- activities;
- audit logs.

## IA

Antes de enviar datos a OpenRouter:

- eliminar SSN/ITIN;
- eliminar identificadores innecesarios;
- minimizar información personal;
- enviar solo contexto necesario;
- registrar qué función IA fue utilizada.

## Producción

Nunca permitir a agentes de IA:

- resetear DB;
- ejecutar migraciones destructivas;
- borrar tablas;
- editar datos reales masivamente;

sin revisión humana.
