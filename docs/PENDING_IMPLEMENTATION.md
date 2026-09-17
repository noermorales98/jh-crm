# Pendientes de implementación

Actualizado 2026-09-17 (CR-PDF-001 cerrado).

## Pendientes confirmados

- **AU-003:** SMS a clientes (aplazado).
- **AU-006:** APIs automáticas de buró (P3; import PDF CR-PDF-001 ya cubre carga asistida).
- **AU-007:** afiliados/comisiones (P3).

## Funcionalidades ya existentes

- **CR-PDF-001:** Analizar PDF → propuesta IA → confirm → CreditReport + cliente.
- **AU-005 Stripe**, **AU-004 Whapi**, Deploy 2, AI-005/006, DC-005, Fases 0–7.

## Prioridades siguientes

1. Configurar Stripe/Whapi/SMTP en la org y probar cobros/mensajes.
2. AU-003 SMS solo si el negocio lo pide.
3. AU-006/007 P3.

## Riesgos técnicos reales

- Import PDF: job en segundo plano + bloqueo de navegación; requiere `OPENROUTER_API_KEY` + S3; siempre revisión humana.
- Stripe: webhook URL por org y whsec.
- Whapi: sesión vinculada / ritmo.
