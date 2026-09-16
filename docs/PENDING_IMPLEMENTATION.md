# Pendientes de implementación

Actualizado 2026-09-16 tras cerrar Fases 2–3, AU-001/002, AI-003…005 y SC-004.

## Pendientes confirmados

- **AU-003…005:** SMS, WhatsApp a clientes, pagos online (aplazados a petición).
- **AU-006/007:** integraciones buró y afiliados/comisiones (P3).
- **DC-005 categorías nuevas:** `CONTRACT`, `INVOICE`, etc. (migración enum).
- **ARC-003 Deploy 2:** UI crédito aún CreditCase-first en `/crm/casos/[caseId]`.
- **Fase 8 polish:** búsqueda asistida dedicada (parcialmente cubierta por `searchCrm`); UI de confirmación para aplicar propuestas de AI-005.

## Funcionalidades ya existentes

- **Fases 0–6** (con dual-write Document/Quote, FD-002 UI, testimonios).
- **Fase 3:** wrap + `DisputeItem.action` + tarea de revisión única.
- **Fase 7 AU-001/002:** correos cliente + contacto público.
- **Fase 8 AI-001…005:** wrapper, sanitize, resumen, sugerencia, extracción (tools).
- **SC-004:** completar + CTA testimonio.
- **Ops `serviceCaseId`** + checklist DC-005 aislado.

## Prioridades siguientes

1. ARC-003 Deploy 2 (si se quiere UI canónica ServiceCase).
2. Confirm-UI para aplicar propuestas AI-005.
3. Enum DC-005 con migrate.
4. AU-003…005 solo si el negocio los pide.

## Riesgos técnicos reales

- Cron `scanIncompleteIntakeFollowUps` sigue global por defecto.
- Checklist depende de dual FK; uploads antiguos pueden quedar solo como generales.
- Correos cliente requieren SMTP + toggles; sin SMTP el cron no falla.
- AI tools llaman OpenRouter: sin API key fallan con DomainError limpio.
