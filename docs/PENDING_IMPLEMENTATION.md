# Pendientes de implementación

Actualizado 2026-09-16 (AU-004 Whapi cerrado).

## Pendientes confirmados

- **AU-003:** SMS a clientes (aplazado).
- **AU-005:** pagos online (siguiente).
- **AU-006/007:** integraciones buró y afiliados (P3).

## Funcionalidades ya existentes

- **AU-004 Whapi:** WhatsApp a clientes (paridad eventos email); CallMeBot solo equipo.
- **ARC-003 Deploy 2**, AI-005/006, DC-005, Fases 0–7 (AU-001/002), SC-004, FD-002.

## Prioridades siguientes

1. AU-005 pagos online.
2. AU-003 SMS solo si el negocio lo pide.

## Riesgos técnicos reales

- Whapi usa sesión vinculada (no Cloud API oficial): cuidar ritmo y re-vincular QR.
- Cron intake sigue global por defecto.
- AI / Whapi requieren keys en env/settings.
