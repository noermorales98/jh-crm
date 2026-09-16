# Pendientes de implementación

Actualizado 2026-09-16 (AI-006 búsqueda asistida cerrada).

## Pendientes confirmados

- **AU-003…005:** SMS, WhatsApp a clientes, pagos online (aplazados).
- **AU-006/007:** integraciones buró y afiliados (P3).

## Funcionalidades ya existentes

- **ARC-003 Deploy 2:** contract de lectura `ServiceCase.nextActionAt` (cron, listCases, IA); CTA crédito desde expedientes.
- **AI-005 confirm UI:** cards Confirmar/Descartar + `applyAiProposalAction`.
- **AI-006 búsqueda asistida:** spotlight «Asistida» + `POST /api/crm/search/assist`.
- **DC-005 enum:** categorías aditivas + checklist optional.
- Fases 0–7 (AU-001/002), AI-001…006, SC-004, dual-write docs/quotes, FD-002.

## Prioridades siguientes

1. AU-003…005 solo si el negocio los pide.

## Riesgos técnicos reales

- Cron intake sigue global por defecto.
- Checklist depende de dual FK.
- AI tools / búsqueda asistida requieren OPENROUTER_API_KEY.
