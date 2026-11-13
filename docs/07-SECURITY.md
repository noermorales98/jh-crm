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

## Conector MCP de Claude

- OAuth 2.1 propio (`src/server/mcp/oauth/`): PKCE `S256` obligatorio, `redirect_uri` solo
  `https://claude.ai|claude.com` o loopback con puerto, en forma canónica. Códigos de 10 min y un uso;
  access token de 1 h; refresh sin caducidad, rotado en cada uso, y su reuso revoca la conexión.
- Solo se guardan hashes SHA-256 de códigos y tokens. Nada de tokens, códigos ni argumentos en logs.
- Cada petición vuelve a comprobar: conexión no revocada, `FEATURE_MCP_CONNECTOR`, `mcpEnabled` de la
  organización, usuario activo y miembro, misma `sessionVersion`. El rol se lee en cada llamada.
- Las herramientas usan los mismos servicios, esquemas y permisos que las actions; toda salida pasa por
  `redactForClaude` (sanitizeForAI + series largas de dígitos y SSN en cualquier formato).
- Límites: registro dinámico 10/h por IP y 100/h global (solo registros válidos); token 60/min por IP;
  herramientas 120/min por conexión; llaves inventadas 60/min por IP.
- La pantalla de consentimiento no se puede incrustar (`frame-ancestors 'none'`, `X-Frame-Options: DENY`).
- Guía de uso: `02-DOCS/wiki/guias/conectar-claude.md`.

## Producción

Nunca permitir a agentes de IA:

- resetear DB;
- ejecutar migraciones destructivas;
- borrar tablas;
- editar datos reales masivamente;

sin revisión humana.
