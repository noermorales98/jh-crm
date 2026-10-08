# 08 — Configuración pendiente

Solo nombres. Los valores viven en el gestor del despliegue o en `.env.local`, nunca en git ni en este documento.

Commit de referencia: `9445bff96631083fc875a6dfdbedf5426814ee52`.

No se leyó `.env.local` ni el proyecto de Vercel. “Falta confirmar” significa que el código lo usa y esta auditoría no vio el valor del entorno.

## Obligatorias para arrancar

| Nombre | Si falta | Dónde se lee |
| --- | --- | --- |
| `DATABASE_URL` | No hay datos | `prisma/schema.prisma` |
| `AUTH_SECRET` | Auth.js y HMAC de avance/reto no tienen secreto propio | `auth.ts`, `src/server/avance/share.ts` |
| `AUTH_URL` | URLs de Auth.js incorrectas | `.env.example` |
| `NEXT_PUBLIC_APP_URL` | Enlaces absolutos de correo, WhatsApp y retorno | notificaciones y Stripe |

`FIELD_ENCRYPTION_KEY` es obligatoria en cuanto se guarda SSN, secretos de Stripe o SMTP cifrado. Sin ella esas escrituras fallan.

## Cron y correo entrante

| Nombre | Si falta |
| --- | --- |
| `CRON_SECRET` | `/api/cron/reminders`, `/digest`, `/mails-sync`, `/retention` y `/api/mails/inbound` responden 401 |

Tarea del propietario: confirmar que el scheduler externo llama esas cuatro rutas con `Authorization: Bearer` y que el secreto del scheduler es el mismo del entorno. No pegar el secreto aquí.

## Flags de producto

| Nombre | Semántica en código | Default del example | Efecto |
| --- | --- | --- | --- |
| `FEATURE_PUBLIC_INTAKE` | Opt-in, solo `"true"` | `false` | `/intake/[token]` y alta de enlaces |
| `FEATURE_CLIENT_PORTAL` | Opt-in, solo `"true"` | `false` | `/portal/*` e invitaciones |
| `FEATURE_CONSULTATION_PAYMENTS` | Opt-out: bloquea solo si el valor es `"false"` | `false` | Cierra el cobro de consultas. El comentario del example dice “si true y hay pasarela”; el código no exige `"true"`. Alinear el comentario en PR-DOCS-README |
| `FEATURE_META_LEAD_ADS` | Lo consulta el dominio, pero el HTTP responde 410 | No está en `.env.example` | No reactivar. Quitar la expectativa del README |

## Captación web (PR-SEC-02 aplicado)

| Nombre | Si falta |
| --- | --- |
| `PUBLIC_ORG_ID` | `POST /api/public/contact` no escribe (DomainError). Documentado en `.env.example` |

Ya no hay fallback a la organización más antigua. Poner el cuid de `Organization` del tenant operado en cada entorno (sandbox y producción) **antes** de esperar leads del sitio. Confirmar cuántas orgs hay; si hay más de una, elegir la correcta con cuidado.

## OpenRouter

| Nombre | Si falta |
| --- | --- |
| `OPENROUTER_API_KEY` | Chat y extracción de PDF lanzan error de configuración |
| `OPENROUTER_API_KEY_SECONDARY` | Opcional, respaldo |
| `OPENROUTER_MODEL` | Opcional. El example documenta `openrouter/free` |

Tarea: no usar este canal para PDF completos después de PR-SEC-PII. Confirmar con el proveedor retención y si el plan acepta datos de buró aunque vayan redactados. Esta auditoría no verificó el contrato.

## Almacenamiento

| Nombre | Si falta |
| --- | --- |
| `S3_ENDPOINT` | No hay upload ni download |
| `S3_REGION` | El example usa `auto` |
| `S3_BUCKET` | Igual |
| `S3_ACCESS_KEY_ID` | Igual |
| `S3_SECRET_ACCESS_KEY` | Igual |
| `S3_FORCE_PATH_STYLE` | Example `true` (compatible con R2/MinIO) |
| `UPLOAD_MAX_MB` | Default 15 en código si no está |

Tarea: bucket privado, sin listado público. La app aún no impone `ContentLength`; la política del bucket debe limitar tamaño hasta PR-DC-CONFIRM.

## Stripe, correo y WhatsApp (por organización, no en `.env` de la app)

Se guardan cifrados en `OrganizationSettings` (y destinatarios WhatsApp). Nombres de campos, no valores:

- Stripe: habilitado, secreto, secreto de webhook, clave publicable.
- SMTP: host, puerto, usuario, contraseña cifrada.
- IMAP: host y credenciales de la org para la bandeja.
- CallMeBot: flag y API key por destinatario interno.
- Whapi: flag, token cifrado, base URL.

Tareas del propietario:

- URL de webhook `https://<host>/api/webhooks/stripe/<organizationId>` en el modo test, solo después de PR-SEC-01. Si se configura antes, los eventos pueden no entrar.
- Secreto de webhook distinto por entorno.
- No marcar pagado a mano para “probar” un Checkout real.
- SMTP e IMAP de un buzón de prueba.
- Whapi solo con un número de sandbox.

`BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_PASSWORD` y `BOOTSTRAP_OWNER_NAME` sirven al script de alta inicial, no al runtime diario. No reutilizar la contraseña de producción en el example.

## Deploy

El build corre `scripts/migrate-on-deploy.mjs` antes de `next build`. Variables que el script entiende y que no están todas en `.env.example`: `RUN_PRISMA_MIGRATE`, `MIGRATE_DATABASE_URL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`.

Tarea: la migración de producción solo con una base confirmada y backup. Esta auditoría no ejecutó migraciones.

No hay workflow de GitHub. El despliegue vigente no se inspeccionó.

## Permisos que el propietario debe seguir teniendo

- `OWNER` o `ADMIN` para usuarios, ajustes, anular recibos, portal y auditoría.
- `SPECIALIST` para SSN y documentos sensibles.
- El cron no es un usuario: es el bearer.

## Checklist del propietario (sin pegar secretos)

- [ ] Una o varias organizaciones en producción.
- [ ] `PUBLIC_ORG_ID` configurada en sandbox y producción (cuid de la org operadora).
- [ ] Scheduler de las cuatro rutas cron.
- [ ] Bucket S3/R2 privado de producción y otro de sandbox.
- [ ] Stripe en modo test hasta cerrar SEC-01 y la idempotencia.
- [ ] Portal e intake siguen en `false` hasta pasar el checklist de QA de la pasada 2.
- [ ] OpenRouter: decidir si la extracción de texto redactado es aceptable para el negocio.
- [ ] Rotar cualquier clave que haya estado en un chat, log o captura.
