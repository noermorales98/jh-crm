# J&H Multiservices LLC — CRM interno

CRM operativo interno para **J&H Multiservices LLC**: gestión de clientes, casos
de crédito con pipeline de etapas, rondas de disputa, tareas con recordatorios,
catálogo de servicios y paquetes, cotizaciones con PDF, pagos y recibos con
folio, usuarios/roles, auditoría de eventos sensibles y configuración de la
organización.

## Stack

- **Next.js 16.3.4** (App Router, route handlers, server actions) + **React 19**
- **TypeScript strict** + **Tailwind CSS 4**
- **Prisma 6.19** sobre **MySQL** remoto
- **NextAuth v5** (Credentials, sesión JWT, bcryptjs)
- PDFs con jsPDF; subida de archivos a S3 (pendiente de configurar, ver abajo)

## Setup rápido

```bash
npm install                      # postinstall ejecuta prisma generate
cp .env.example .env.local       # rellenar valores (ver abajo)
npm run db:deploy                # aplica migraciones a la base MySQL
npx tsx --env-file=.env.local scripts/bootstrap.ts
                                 # crea organización, etapas, settings y usuario OWNER
npm run dev                      # http://localhost:3000
```

Login con `BOOTSTRAP_OWNER_EMAIL` / `BOOTSTRAP_OWNER_PASSWORD` definidos en
`.env.local` (el script de bootstrap crea ese usuario OWNER).

### Variables de entorno

`.env.example` documenta todas las variables. Las imprescindibles:

- `DATABASE_URL` — MySQL remoto.
- `AUTH_SECRET` — secreto de sesión NextAuth.
- `CRON_SECRET` — Bearer token para `GET /api/cron/reminders` y `GET /api/cron/digest`.
- `BOOTSTRAP_OWNER_EMAIL` / `BOOTSTRAP_OWNER_PASSWORD` / `BOOTSTRAP_OWNER_NAME`.
- `OPENROUTER_API_KEY` — chat de IA en el CRM (modelos gratuitos). Opcional: `OPENROUTER_API_KEY_SECONDARY`.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm run start` | Build y arranque de producción |
| `npm run lint` | ESLint |
| `npm run db:generate` | Regenerar Prisma Client |
| `npm run db:migrate` | Migraciones en desarrollo |
| `npm run db:deploy` | Aplicar migraciones (producción) |
| `npm run db:studio` | Prisma Studio |

Scripts auxiliares en `scripts/`:

- `bootstrap.ts` — inicializa la organización y el usuario OWNER.
- `smoke/` — fixtures y verificaciones de humo (dominio, UI, finanzas, HTTP,
  E2E integral `e2e-flow.ts`, verificación en navegador `browser-verify.mjs`),
  cada uno con su cleanup correspondiente.

## Asistente de IA

El CRM incluye un chat flotante (esquina inferior derecha) que usa modelos
gratuitos de [OpenRouter](https://openrouter.ai/keys) (`openrouter/free`).
Responde con datos de la organización (clientes, casos, cotizaciones, pagos),
la configuración de la empresa y las rutas para guiar al usuario con enlaces
`/crm/...`. Requiere sesión; no expone SSN descifrado ni secretos.

`OPENROUTER_API_KEY_SECONDARY` se usa si la clave primaria responde 429/402/401.

## Cron (cron-job.org)

Crea **dos** jobs en [cron-job.org](https://cron-job.org/en/) contra la URL de producción.
Ambos usan el header `Authorization: Bearer $CRON_SECRET`.

### Recordatorios (tareas, revisiones, pagos)

- URL: `https://TU-DOMINIO/api/cron/reminders`
- Método: `GET`
- Cada **15 minutos**
- Idempotente: cada aviso lleva `dedupeKey` único (upsert), no se duplica.

### Resumen diario

- URL: `https://TU-DOMINIO/api/cron/digest`
- Método: `GET`
- Cada **hora** (el CRM solo envía si `digestEnabled` y la hora local de la organización coincide con la configurada en Notificaciones; default 08:00).
- Destinatarios: OWNER y ADMIN. El correo sale por el SMTP de Configuración → Notificaciones.

SMTP, hora del resumen y toggles de correo/WhatsApp: menú de usuario → **Notificaciones** (`/crm/configuracion/notificaciones`).

## Pendiente: almacenamiento S3

La subida/descarga de documentos (expediente de clientes, adjuntos de intake)
requiere un bucket S3-compatible. Hasta configurar `S3_ENDPOINT`, `S3_REGION`,
`S3_BUCKET`, `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY` en `.env.local`, esas
rutas (`/api/files/*`) responden con error controlado y el resto del CRM
funciona con normalidad. El intake público además está desactivado por defecto
(`FEATURE_PUBLIC_INTAKE=false`).
