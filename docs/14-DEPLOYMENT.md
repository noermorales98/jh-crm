# DEPLOYMENT — Entornos y flujo

## Entornos recomendados

```text
DEV
STAGING
PRODUCTION
```

## Bases de datos

Ideal:

```text
jh_crm_dev
jh_crm_staging
jh_crm_prod
```

Nunca utilizar producción para QA automatizado.

## Flujo Git / Vercel

```text
feature/*
   ↓
GitHub
   ↓
Vercel Preview
   ↓
QA
   ↓
fixes
   ↓
PASS
   ↓
merge
   ↓
main
   ↓
production
```

## Reglas para IA/agentes

Cursor/Grok pueden:

- trabajar en dev;
- preparar migrations;
- probar;
- generar reportes.

No deben sin aprobación:

- resetear producción;
- ejecutar migraciones destructivas;
- borrar tablas;
- borrar registros reales;
- cambiar secretos.

## MySQL Hostinger

Revisar específicamente:

- conexiones externas;
- SSL;
- límite de conexiones;
- connection pooling;
- timeouts;
- estrategia serverless;
- backups.

Estos puntos deben validarse contra la configuración real de Hostinger y el código existente antes de producción.

## Variables

Separar al menos:

```text
DATABASE_URL
AUTH_*
STORAGE_*
OPENROUTER_API_KEY
```

por entorno.

## Storage

Los documentos privados no deben depender de URLs públicas permanentes.

## Checklist antes de producción

```text
[ ] QA staging
[ ] Migrations probadas
[ ] Backup DB
[ ] Variables correctas
[ ] Roles/permisos
[ ] Storage privado
[ ] OpenRouter sanitiza PII
[ ] Logs sin datos sensibles
[ ] AuditLog activo
[ ] Rollback disponible
```

## Migraciones Prisma en deploy (Vercel)

`git push` **no** aplica schema en MySQL por sí solo. El build de Production corre:

```text
node scripts/migrate-on-deploy.mjs && next build
```

- Solo si `VERCEL_ENV=production` (o `RUN_PRISMA_MIGRATE=true`).
- Preview **no** migra (evita tocar DB con un PR).
- Requiere `DATABASE_URL` de Production en Vercel apuntando a la DB de prod (distinta de DEV).

**Antes del primer deploy con muchas migraciones pendientes:** backup Hostinger, luego un deploy a Production (o `DATABASE_URL=prod npx prisma migrate deploy` local con aprobación).

Si Preview comparte la URL de Production, **corrígelo ya**: Preview debe usar staging/dev.