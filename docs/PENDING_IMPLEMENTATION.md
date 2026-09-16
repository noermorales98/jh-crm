# Pendientes de implementación

Resumen operativo tras FD-002 (UI + smoke), endurecimiento de tareas ops con `serviceCaseId`, y corrección del filtro DC-005 (2026-09-16).

## Pendientes confirmados

- **Fase 7 / AU-001…007:** email automático, webhook de leads, SMS, WhatsApp, pagos online, integraciones de crédito, afiliados.
- **DC-005 categorías nuevas:** `CONTRACT`, `INVOICE`, `RECEIPT`, `BANK_DOCUMENT`, etc. (requieren migración del enum `DocumentCategory`).
- **SC-004** completar expediente y cierres de backlog sin `Estado: DONE`.
- **AI post–sanitize:** resumen de expediente, siguiente acción sugerida, extracción de tareas, búsqueda asistida.
- **ARC-003 Deploy 2:** lecturas UI que aún pasan por `CreditCase` en lugar de `ServiceCase` canónico.
- **Upload de documentos:** `createDocument` aún no dual-escribe siempre `serviceCaseId` (el checklist ya lo contempla cuando está presente).

## Funcionalidades ya existentes

- **FD-001 / FD-002:** `FundingCase` + `FundingApplication` con create/update, concurrencia optimista, auditoría, UI en `/crm/expedientes/[serviceCaseId]`, smoke `scripts/smoke/funding-applications.ts`.
- **Verticales Fase 5:** HomeBuyer / Funding / PersonalLoan / ProjectCase + ficha genérica.
- **Ops tasks con `serviceCaseId`:** `onRoundSent`, `onCreditReportCreated`, `ensureDocsPendingTask`, intake follow-up; smoke `scripts/smoke/operations-pending.ts`.
- **DC-005 checklist:** por `Service.code`; cuenta caso legacy, docs del `ServiceCase` y generales del cliente (`caseId` + `serviceCaseId` null); no cuenta docs de otro expediente.
- **Fases 4 y 6:** balance/notas WON; testimonios con consentimiento/aprobación/publicación.
- **AI-002:** `sanitizeForAI` + MFA en login.

## Prioridades siguientes

1. Dual-write `serviceCaseId` en upload de documentos (cierra el hueco del checklist multi-expediente).
2. Completar SC-004 / cierres de expediente si el MVP lo necesita antes de Fase 7.
3. Fase 7 automatizaciones de salida (email/webhook) cuando el MVP esté estable.
4. Extender enum de categorías DC-005 solo con migración explícita.

## Riesgos técnicos reales

- **`scanIncompleteIntakeFollowUps` en cron** sigue siendo global (sin `organizationId`); el filtro opcional existe para smokes/llamadas acotadas.
- **Checklist depende del dual FK** `caseId` / `serviceCaseId`; uploads antiguos o sin `serviceCaseId` pueden clasificarse solo como “generales” si ambos son null.
- **`ensureDocsPendingTask` / intake** crean tareas en cualquier caso/link elegible del alcance; smokes deben usar org temporal o `organizationId` acotado.
- No hacer migración Prisma ni bump de Next solo por avisos stale tras regenerar el client.
