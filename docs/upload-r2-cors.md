# CORS del bucket R2 para subidas firmadas (CRM)

## Estado verificado

| Origin | OPTIONS PUT |
|--------|-------------|
| `http://localhost:3000` | OK (204 + ACAO) |
| `https://jh-crm.vercel.app` (producción / main) | OK |
| Host Preview de rama `*.vercel.app` | 403 si no está en la policy |

**Producción (main):** no hace falta variable de entorno nueva en Vercel. El PUT firmado usa el origen `https://jh-crm.vercel.app`, que ya está permitido en CORS del bucket. Las vars existentes `S3_*` y opcional `UPLOAD_MAX_MB` bastan.

**Preview:** solo si pruebas desde un host Preview, añade ese origen exacto a CORS en R2 (no es env de Vercel).

## Por qué hace falta

Archivos **≥ 4 MB** no pueden ir por `POST /api/files/upload` (límite de body de Vercel Functions ≈ 4.5 MB). El CRM usa entonces:

1. `POST /api/files/upload-url` (same-origin, JSON pequeño)
2. `PUT` del browser al URL firmado del bucket (cross-origin)
3. `POST /api/files/confirm` (HeadObject + fila `Document`)

El bucket debe permanecer **privado**. CORS solo autoriza orígenes de la app a hacer `PUT`/`GET`/`HEAD` con URLs firmadas; no hace el bucket público ni expone access keys.

## Síntoma si falta CORS

En Preview (`*.vercel.app`), tras “Preparando…”, el `PUT` falla con `TypeError` / `Failed to fetch`. El clasificador lo muestra como error de almacenamiento, no como sesión.

## Configuración Cloudflare R2

Dashboard → bucket → **Settings** → **CORS Policy**:

```json
[
  {
    "AllowedOrigins": [
      "https://jh-crm.vercel.app",
      "https://jh-multiservices.com",
      "https://www.jh-multiservices.com",
      "http://localhost:3000",
      "http://127.0.0.1:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 86400
  }
]
```

### Previews de Vercel

R2 suele exigir **orígenes exactos**. Añade el host del Preview que uses para QA, por ejemplo:

`https://jh-crm-git-fix-crm-upload-large-pdf-….vercel.app`

Si tu cuenta R2 acepta comodines, puedes probar `"https://*.vercel.app"`; si no, mantén la lista explícita y actualízala por Preview estable, o usa un Preview permanente de staging.

## Verificación

```bash
UPLOAD_CORS_ORIGIN="https://TU-PREVIEW.vercel.app" npm run smoke:upload-cors
npm run smoke:upload-hybrid
```

`smoke:upload-cors` hace `OPTIONS` (no escribe objetos).  
`smoke:upload-hybrid` sube PDFs sintéticos ~1 MB (servidor) y ~5 MB (PUT firmado) y los borra.

## Qué no hacer

- No poner el bucket en acceso público.
- No pegar `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` en el cliente ni en issues.
- No firmar `ContentLength` en el PUT sin re-probar (el tamaño se valida en `confirm` vía HeadObject).
