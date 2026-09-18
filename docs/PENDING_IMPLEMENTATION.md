# Pendientes de implementación

Actualizado 2026-09-17 (checklist UX CRM).

## Checklist UX Fondify / Huthy

Ver **[UX_FONDIFY_HUTHY_CHECKLIST.md](./UX_FONDIFY_HUTHY_CHECKLIST.md)** y **[UX_STATE_INTELLIGENCE.md](./UX_STATE_INTELLIGENCE.md)**.

## Checklist UX (2026-09-17)

Completado — ver **[UX_IMPROVEMENTS_2026-09-17.md](./UX_IMPROVEMENTS_2026-09-17.md)** (8 pasos).

## Pendientes confirmados

- **AU-003:** SMS a clientes (aplazado).
- **AU-006:** APIs automáticas de buró — **aplazado a futuro** (requiere proveedor de pago + compliance; no hay opción gratis usable. Mientras tanto: CR-PDF-001).
- **AU-007:** afiliados/comisiones (P3).

## Funcionalidades ya existentes

- **CR-PDF-001:** Analizar PDF → propuesta IA → confirm → CreditReport + cliente.
- **AU-005 Stripe** (Checkout + webhook; generar link, copiar/abrir sin salir del CRM, enviar por Whapi).
- **AU-004 Whapi**, Deploy 2, AI-005/006, DC-005, Fases 0–7.

## Prioridades siguientes (ops)

1. Probar en DEV: generar link cotización/consulta → Copiar / Abrir / Enviar WhatsApp.
2. SMTP de la org (sigue sin configurar si hace falta correo).
3. Producción: `MIGRATE_DATABASE_URL` con credenciales válidas si aún falla auth MySQL.
4. AU-003 SMS solo si el negocio lo pide; AU-007 P3; AU-006 solo si hay presupuesto/proveedor.

## Riesgos técnicos reales

- Import PDF: job en segundo plano + bloqueo de navegación; requiere `OPENROUTER_API_KEY` + S3; siempre revisión humana.
- Stripe: webhook URL por org y whsec; en localhost usar Stripe CLI.
- Whapi: sesión vinculada / ritmo; el cliente debe tener teléfono en la ficha.
