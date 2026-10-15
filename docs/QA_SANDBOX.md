# QA / Sandbox — política de build y migraciones (JH-001)

**Ticket:** JH-001 / TEST-007  
**Objetivo:** lint, typecheck y build verificables **sin** migrar bases productivas ni usar secretos reales.

## Comandos

| Script | Qué hace | ¿Migra? |
|---|---|---|
| `npm run lint` | ESLint | No |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` (genera `LayoutProps` / route types) | No |
| `npm run build:qa` | `next build` directo | **No** |
| `npm run ci:qa` | lint + typecheck + smoke TEST-007 + build:qa | **No** |
| `npm run smoke:qa-baseline` | Verifica skip de `migrate-on-deploy` | No |
| `npm run build` | `migrate-on-deploy.mjs` + `next build` | Solo si Vercel Production o force |

## Cuándo migra `scripts/migrate-on-deploy.mjs`

Migra **solo** si:

1. `VERCEL_ENV=production`, **o**
2. `RUN_PRISMA_MIGRATE=true` **y** no está bloqueado por QA.

**Nunca** migra cuando:

- `QA_SANDBOX=1` (salvo override dual `RUN_PRISMA_MIGRATE=true` **y** `ALLOW_QA_MIGRATE=true`)
- `CI=true` y no es Vercel Production (salvo `RUN_PRISMA_MIGRATE=true`)
- Preview / local / `NODE_ENV=production` sin `VERCEL_ENV=production`

## CI

Workflow: `.github/workflows/qa.yml`  
Variables: `QA_SANDBOX=1`, placeholders de `DATABASE_URL`/`AUTH_SECRET` (no productivos).  
Envíos reales, Stripe cobros y portal quedan en flags `false` en CI.

## Sandbox local

1. Copia `.env.example` → `.env.local` con DB **descartable**.
2. Exporta `QA_SANDBOX=1` al correr builds de verificación.
3. No apuntes `DATABASE_URL` a producción.
4. Migraciones de desarrollo: `npm run db:migrate` / `db:deploy` **explícitos**, nunca vía `build:qa`.

## Evidencia

Al cerrar un PR P0, registrar en el Project store `internal/p0-evidence/` el comando, fecha, exit code y resumen (sin secretos).
