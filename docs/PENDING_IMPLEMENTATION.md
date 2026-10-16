# Pendientes de implementación

Actualizado 2026-10-16 (ops audit + AU-006 gate).

## Checklist UX Fondify / Huthy

Ver **[UX_FONDIFY_HUTHY_CHECKLIST.md](./UX_FONDIFY_HUTHY_CHECKLIST.md)** y **[UX_STATE_INTELLIGENCE.md](./UX_STATE_INTELLIGENCE.md)**.

## Checklist UX (2026-09-17)

Completado — ver **[UX_IMPROVEMENTS_2026-09-17.md](./UX_IMPROVEMENTS_2026-09-17.md)** (8 pasos).

## Pendientes confirmados

- **AU-003:** SMS a clientes (aplazado).
- **AU-006:** APIs automáticas de buró — **gate fail-closed** (`BUREAU_PROVIDER=none` por defecto; `src/lib/bureau/provider.ts`). Sin proveedor de pago + compliance **no hay pull real**. Camino diario: **CR-PDF-001**. Smoke: `smoke:au-006-bureau-gate`.
- **AU-007:** afiliados/comisiones (P3).

## Funcionalidades ya existentes

- **CL-004:** Reportes / evolución de crédito en hub cliente (`/crm/clientes/:id/reportes`) + agency `/crm/reportes`.
- **CR-PDF-001:** Analizar PDF → propuesta IA → confirm → CreditReport + cliente.
- **AU-005 Stripe** (Checkout + webhook; generar link, copiar/abrir sin salir del CRM, enviar por Whapi).
- **AU-004 Whapi**, Deploy 2, AI-005/006, DC-005, Fases 0–7.
- Agency T4: Equipo / Marca / Reportes (#34–#36).

## Ops (2026-10-16)

Smoke: `npm run smoke:ops-readiness` (y con `.env.local`: `OPS_REQUIRE_ENV=1`).

Hallazgos en el entorno local auditado (solo flags, sin secretos):

| Ítem | Estado |
|---|---|
| App env (DB, Auth, S3, OpenRouter, CRON, PUBLIC_ORG_ID) | SET |
| `MIGRATE_DATABASE_URL` | Opcional; MISSING (migrate usa `DATABASE_URL` si basta) |
| Org JH — Stripe + Whapi | Configurados |
| Org JH — SMTP | **No** configurado (falta si se necesita correo saliente) |
| Org JH — `logoUrl` (Mi Marca) | **Vacío** — poner URL en Configuración → Marca |
| Cliente walkthrough `CL-0007` | En org JH; reportes con scores presentes |
| Org `TEST JH-CRM*` / `PRUEBA` dedicada | No existe en esta DB (PRUEBA es nombre de cliente) |

Acciones manuales del propietario:

1. Configurar **SMTP** en Configuración → Notificaciones si hace falta correo.
2. Subir **logo** (URL pública PNG/JPEG) para PDFs.
3. Probar link cotización → Copiar / Abrir / WhatsApp en DEV.
4. AU-006: elegir agregador + compliance antes de setear `BUREAU_PROVIDER`.

## Riesgos técnicos reales

- Import PDF: job en segundo plano + bloqueo de navegación; requiere `OPENROUTER_API_KEY` + S3; siempre revisión humana.
- Stripe: webhook URL por org y whsec; en localhost usar Stripe CLI.
- Whapi: sesión vinculada / ritmo; el cliente debe tener teléfono en la ficha.
