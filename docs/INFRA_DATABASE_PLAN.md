# INFRA DATABASE PLAN — Separación DEV / STAGING / PRODUCTION

> Alineado a [`ARCHITECTURE_V1.md`](ARCHITECTURE_V1.md), [`14-DEPLOYMENT.md`](14-DEPLOYMENT.md) y [`MIGRATION_PLAN.md`](MIGRATION_PLAN.md) §10.
> Infra DB es **bloqueante** antes de migrate/backfill del plan v1.
>
> Este documento **no** ejecuta migrations, **no** modifica producción, **no** cambia `schema.prisma`.

## 1. Objetivo

Separar correctamente tres entornos de base de datos para Next.js / Vercel + Prisma + MySQL (Hostinger), de modo que:

- el desarrollo local no toque datos reales;
- Preview Deployments no escriban en producción;
- staging sea el único sitio donde se prueban migrations y backfill antes de prod.

## 2. Estado actual (auditoría)

```text
Local (.env.local) ──► Hostinger MySQL  u627288392_jh  (srv1915.hstgr.io:3306)
Vercel Production  ···►  ¿misma URL?  (verificar en dashboard)
Vercel Preview     ···►  ¿misma URL?  (riesgo si hereda Production)
```

| Área | Hallazgo |
|---|---|
| `DATABASE_URL` local | Host `srv1915.hstgr.io`, puerto `3306`, database `u627288392_jh`. Query string **vacío**: sin SSL, sin `connection_limit`, sin timeouts. |
| Prisma datasource | [`prisma/schema.prisma`](../prisma/schema.prisma): `url = env("DATABASE_URL")` únicamente. Sin `directUrl`, sin Prisma Accelerate, sin adapter mysql2/PlanetScale. |
| Cliente app | [`src/lib/db.ts`](../src/lib/db.ts): singleton + Proxy HMR (`PRISMA_CLIENT_GENERATION`). Logs `error` fuera de development. No configura pool ni SSL en código (todo va en el connection string). |
| Scripts | `scripts/bootstrap.ts` y muchos `scripts/smoke/*` crean `new PrismaClient()` propios (no reutilizan el singleton) → más conexiones si apuntan a la misma DB. |
| Vercel en repo | Proyecto `jh-crm` (`.vercel/project.json`). **Sin** `vercel.json`. Cron es externo (`CRON_SECRET`), no Cron Jobs de Vercel. Scopes de env: auditar en el dashboard (API no verificada desde esta auditoría). |
| Nombres de DB | Docs ideales: `jh_crm_dev` / `jh_crm_staging` / `jh_crm_prod` ([`14-DEPLOYMENT.md`](14-DEPLOYMENT.md)). En Hostinger el nombre real lleva prefijo de cuenta (`u627288392_*`). Hoy solo se observa una DB en uso local. |
| Inventario previo | Confirmado en [`CURRENT_STATE.md`](CURRENT_STATE.md) §14 y gap P0 en [`GAP_ANALYSIS.md`](GAP_ANALYSIS.md): singleton, sin pooler/SSL en código, riesgo serverless. |

**Supuesto operativo:** tratar `u627288392_jh` como la DB viva compartida (probable producción, o prod+dev mezclados) hasta confirmar en el panel de Hostinger y en Vercel Environment Variables.

## 3. Configuración recomendada

### 3.1 Tres bases en Hostinger

Crear (o documentar) tres databases con prefijo de cuenta, por ejemplo:

| Entorno | Nombre sugerido | Uso |
|---|---|---|
| DEV | `u627288392_jh_dev` | Local + Vercel Development |
| STAGING | `u627288392_jh_staging` | Preview Deployments + QA + migrate/backfill de prueba |
| PRODUCTION | `u627288392_jh` o `u627288392_jh_prod` | Solo Production (`main`) |

Si la actual `u627288392_jh` ya tiene datos reales: **declararla Production** y crear `*_dev` / `*_staging` nuevas. No reutilizar prod para smoke ni para Preview.

Usuarios MySQL: preferible un usuario por DB (o al menos credenciales distintas staging vs prod). Remoto (acceso externo) habilitado solo donde haga falta (Vercel + máquina de migrate).

### 3.2 Mapeo entorno → DB → Vercel

| Entorno | Git / runtime | Scope Vercel | Database |
|---|---|---|---|
| DEV | `next dev`, `.env.local` | Development | `*_jh_dev` |
| STAGING | branches / PRs → Preview | Preview | `*_jh_staging` |
| PRODUCTION | `main` | Production | `*_jh` / `*_jh_prod` |

```text
feature/* → GitHub → Vercel Preview → DB staging → QA
                                      ↓ PASS
                                   merge main
                                      ↓
                              Vercel Production → DB prod
```

**Regla dura:** Preview **nunca** hereda `DATABASE_URL` de Production.

### 3.3 Connection string (plantilla)

Sin secretos en el repo. Codificar caracteres especiales del password (`@`, `#`, `%`, etc.).

```text
mysql://USER:PASSWORD@HOST:3306/DB_NAME?sslaccept=strict&connection_limit=1&connect_timeout=10&pool_timeout=10
```

| Parámetro | Valor recomendado | Motivo |
|---|---|---|
| `sslaccept` | `strict` | Cifrado en tránsito; fallar si el cert no es válido. |
| `connection_limit` | `1` (máx. 1–2) | Cada instancia serverless de Vercel puede abrir su propio pool; el default de Prisma (`num_cpus * 2 + 1`) agota Hostinger. |
| `connect_timeout` | `10` | Host remoto / latencia. |
| `pool_timeout` | `10` | Evitar esperas infinitas bajo presión de conexiones. |

Si Hostinger no valida con `strict` (cert incompleto / hostname): documentar excepción temporal `sslaccept=accept_invalid_certs` como **deuda**, no como default permanente.

SSL y “Remote MySQL” se configuran en el panel Hostinger; el string solo declara cómo Prisma negocia.

### 3.4 PrismaClient y serverless

- Mantener el singleton de [`src/lib/db.ts`](../src/lib/db.ts) en la app (correcto para HMR y para reutilizar conexiones dentro de la misma instancia Fluid Compute).
- El límite real de conexiones se controla con `connection_limit` en `DATABASE_URL`, no con opciones del constructor actuales.
- **No** hace falta cambiar `schema.prisma` para esta separación de envs.
- Backfill / migrate: **una** conexión larga desde máquina o job dedicado (`prisma migrate deploy` / script), **nunca** desde una lambda de Preview ([`MIGRATION_PLAN.md`](MIGRATION_PLAN.md) §2, §10).
- Pooler externo (Prisma Accelerate, ProxySQL, etc.): **no** es paso inmediato. Solo si, tras `connection_limit=1` y DBs separadas, sigue `Too many connections`.

### 3.5 Flujo de migrations (proceso, no ejecución aquí)

1. Schema/migrate se desarrollan contra **DEV**.
2. `npm run db:deploy` (`prisma migrate deploy`) primero contra **STAGING**.
3. QA en Preview apuntando a staging.
4. Backup Hostinger de **PRODUCTION**.
5. `db:deploy` + backfill en prod solo con ventana y aprobación humana.
6. Agentes / Cursor: no migrate ni reset en producción ([`ARCHITECTURE_V1.md`](ARCHITECTURE_V1.md) §12, [`14-DEPLOYMENT.md`](14-DEPLOYMENT.md)).

## 4. Variables por entorno

### 4.1 Obligatoria y distinta por entorno

| Variable | Local | Vercel Development | Vercel Preview | Vercel Production |
|---|---|---|---|---|
| `DATABASE_URL` | `*_jh_dev` | `*_jh_dev` | `*_jh_staging` | `*_jh` / prod |

Cada valor incluye host, credenciales **y** query params (`sslaccept`, `connection_limit`, …).

### 4.2 Separar también (no compartir secretos prod ↔ staging)

Referencia [`14-DEPLOYMENT.md`](14-DEPLOYMENT.md) y [`.env.example`](../.env.example):

| Variable | Notas |
|---|---|
| `AUTH_SECRET` | Distinto por entorno. |
| `AUTH_URL` / `NEXT_PUBLIC_APP_URL` | URL del deployment (Preview tiene URL propia). |
| `FIELD_ENCRYPTION_KEY` | Si staging usa datos clonados cifrados, la clave debe coincidir con el origen del dump; si staging es seed limpio, clave propia. **Nunca** rotar prod desde staging. |
| `CRON_SECRET` | Cron externo no debe apuntar a Preview por error. |
| `S3_*` | Bucket (o prefijo) de staging separado del de prod. |
| `OPENROUTER_API_KEY` (+ secondary) | Preferible clave/proyecto aparte para no mezclar uso/coste. |
| `FEATURE_*` | Pueden diferir (p.ej. flags más abiertos en staging). |
| `BOOTSTRAP_OWNER_*` | Solo bootstrap controlado en dev/staging vacío; no re-bootstrap prod. |

En Vercel: marcar cada variable con los scopes correctos (Production / Preview / Development). Evitar “All Environments” para `DATABASE_URL`.

## 5. Staging

### 5.1 Cómo crear la DB

Opciones (de más segura a más sensible):

1. **Vacía + migrations + seed/demo** — preferida para la mayoría del QA.
2. **Dump estructural** (`mysqldump --no-data`) + seed.
3. **Clone sanitizado** de prod — solo si el QA exige volumen real; PII controlado; acceso restringido; no exponer en Previews públicos sin auth.

### 5.2 Qué corre contra staging

- `prisma migrate deploy` de prueba.
- Backfill del deploy 1 ([`MIGRATION_PLAN.md`](MIGRATION_PLAN.md) §4) y conteos de validación (§6).
- Todos los Vercel Preview Deployments.
- Smoke scripts (`scripts/smoke/*`) y bootstrap de prueba.

### 5.3 Qué no corre contra staging confundido con prod

- No apuntar `.env.local` de trabajo diario a staging si se están haciendo resets agresivos (mejor `*_dev`).
- No usar la URL de Production en el scope Preview “por comodidad”.

## 6. Producción

- DB dedicada; Remote MySQL / SSL revisados.
- Backups Hostinger **verificados** (restauración ensayada al menos una vez) antes de cualquier migrate del plan v1.
- Variables solo en scope Production.
- Escrituras de migrate/backfill: job de una conexión, ventana acordada, rollback app preparado ([`MIGRATION_PLAN.md`](MIGRATION_PLAN.md) §7–§8).
- Prohibido: migrate desde Preview; reset; DROP; agentes sin aprobación explícita.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `Too many connections` | App cae; migrate a medias | `connection_limit=1`; DBs separadas; backfill en un solo proceso |
| Preview / local → prod | Corrupción, datos de prueba en clientes reales | Scopes Vercel; `.env.local` → dev; checklist §9 |
| Sin SSL | Credenciales/PII en claro en tránsito | `sslaccept=strict` (+ SSL remoto Hostinger) |
| Allowlist / IPs efímeras Vercel | Conexiones fallidas intermitentes | Remote MySQL abierto a Vercel o rango documentado; no depender de IP fija de un laptop |
| Timeout / latencia en backfill | Migración incompleta | Batches; job largo; no Preview lambda ([`MIGRATION_PLAN.md`](MIGRATION_PLAN.md) §9) |
| Scripts con `PrismaClient` suelto | Multiplica conexiones | Apuntar solo a dev/staging; cerrar `$disconnect`; no lanzar en paralelo masivo contra Hostinger |
| Un solo `DATABASE_URL` plano | Gap P0 operativo | Este plan + variables por scope |
| `FIELD_ENCRYPTION_KEY` mal mapeada en clone | Datos ilegibles o re-cifrado incorrecto | Documentar origen del dump y clave usada |
| Migrate automático en build | Build Preview altera schema remoto | Build solo `prisma generate` (`postinstall`); `migrate deploy` manual/CI explícito |

## 8. Qué debe cambiar **antes** de ejecutar migrations del plan v1

Orden bloqueante (ticket “Infra DB” de [`MIGRATION_PLAN.md`](MIGRATION_PLAN.md) §11):

1. Confirmar en Hostinger qué DB es prod y cuántas existen.
2. Crear `*_dev` y `*_staging` (o equivalentes).
3. Auditar y corregir scopes de `DATABASE_URL` (y secretos relacionados) en Vercel.
4. Añadir `sslaccept` + `connection_limit` (+ timeouts) a **cada** `DATABASE_URL`.
5. Probar conectividad desde local (dev) y desde un Preview (staging).
6. Backup de producción verificado.
7. Congelar regla operativa: **no** migrate Preview→prod; **no** Preview con URL de prod.

**No** en este paso:

- Editar `schema.prisma` / crear migrations nuevas del modelo ServiceCase.
- Ejecutar `prisma migrate` / backfill.
- Cambiar Hostinger/prod desde el agente.
- Implementar pooler o reescribir [`src/lib/db.ts`](../src/lib/db.ts).

**Follow-up opcional** (después de aprobar y aplicar envs; fuera del entregable mínimo de este doc):

- Actualizar [`.env.example`](../.env.example) con la plantilla de query params (sin secretos).
- Documentar en README el mapeo de scopes.
- Unificar scripts smoke al singleton o documentar `$disconnect` obligatorio.

## 9. Checklist

### Separación de entornos

```text
[ ] Confirmado en Hostinger: DBs existentes y cuál es producción
[ ] Creada DB DEV (prefijo u627288392_* o equivalente)
[ ] Creada DB STAGING
[ ] Production identificada y documentada (nombre actual o renombrado)
[ ] Usuarios/credenciales distintos al menos staging vs prod
[ ] Remote MySQL / SSL revisados en Hostinger
```

### Vercel y variables

```text
[ ] DATABASE_URL Production → solo prod
[ ] DATABASE_URL Preview → solo staging
[ ] DATABASE_URL Development / .env.local → solo dev
[ ] Preview no hereda DATABASE_URL de Production
[ ] AUTH_SECRET, FIELD_ENCRYPTION_KEY, CRON_SECRET, S3_*, OPENROUTER_* separados o justificados
[ ] AUTH_URL / NEXT_PUBLIC_APP_URL coherentes por entorno
[ ] Cada DATABASE_URL incluye sslaccept + connection_limit (+ timeouts)
```

### Conectividad y límites

```text
[ ] Conexión local → DEV OK (idealmente con sslaccept=strict)
[ ] Conexión Preview → STAGING OK
[ ] Production no usada en smoke/bootstrap diarios
[ ] Observado / anotado el max_connections de Hostinger
```

### Antes de migrate v1 (expand + backfill)

```text
[ ] Backup prod verificado
[ ] migrate deploy probado solo en staging
[ ] App Preview validada contra staging post-migrate
[ ] Regla congelada: no migrate desde Preview contra prod
[ ] Aprobación humana para ventana de prod
[ ] Solo entonces: tickets migrate expand (ARC) según MIGRATION_PLAN.md
```

### Checklist previo a producción (eco de 14-DEPLOYMENT)

```text
[ ] QA staging
[ ] Migrations probadas en staging
[ ] Backup DB
[ ] Variables correctas por scope
[ ] Rollback de app disponible
```

## 10. Fuera de alcance de este documento

- Ejecutar SQL o `prisma migrate` / `db:deploy`.
- Modificar producción, Hostinger o variables Vercel desde el agente.
- Editar `schema.prisma`.
- Implementar pooler o cambiar código de `src/lib/db.ts` en este paso.
- Dual-write / backfill de ServiceCase (eso vive en [`MIGRATION_PLAN.md`](MIGRATION_PLAN.md)).

## 11. Referencias

- [`ARCHITECTURE_V1.md`](ARCHITECTURE_V1.md) — decisiones de dominio; no migrate sin aprobación.
- [`14-DEPLOYMENT.md`](14-DEPLOYMENT.md) — envs, Hostinger, checklist prod.
- [`MIGRATION_PLAN.md`](MIGRATION_PLAN.md) — §2 precondiciones, §10 Hostinger/Vercel, §11 orden (infra primero).
- [`CURRENT_STATE.md`](CURRENT_STATE.md) §14 — snapshot de conexión.
- [`GAP_ANALYSIS.md`](GAP_ANALYSIS.md) — gap P0 Hostinger/Vercel.
- Prisma MySQL URL params: `connection_limit`, `sslaccept`, `connect_timeout`, `pool_timeout`.
