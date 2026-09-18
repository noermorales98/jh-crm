# Inteligencia de estado del caso

Actualizado 2026-09-17.

## Visibilidad de secciones (`getCaseSectionVisibility`)

Según `CaseState` y `WorkflowStage.key` se filtran las tabs del caso:

| Condición | Énfasis | Oculto / secundario |
|---|---|---|
| COMPLETED / CANCELLED | Resumen, crédito, documentos, pagos | Rondas, tareas, cotizaciones, cartas |
| key ~ intake/document/onboard | Documentos, cotización, crédito | Rondas, cartas, pagos |
| key ~ dispute/round/ronda | Crédito, rondas, cartas | Cotizaciones, pagos |
| key ~ pay/quote/cobro | Pagos, cotizaciones | Rondas, cartas |
| Default | Todas visibles | — |

Las URLs directas siguen funcionando; solo se ocultan del nav.

## Siguiente acción al cambiar etapa

Al `moveCaseToStage`:

1. Se crea una `Task` FOLLOW_UP asignada al usuario actual (o responsable del caso).
2. Título vía `suggestedTaskTitleForStage` (documentos / ronda / cobro / genérico).
3. La UI muestra alert “Siguiente paso sugerido” con link a `/crm/tareas/[id]`.

## Cola inteligente (Para hacer = Pendientes)

**Tasks son el sistema de registro.** Dashboard «Para hacer» y `/crm/tareas` leen las mismas Tasks abiertas.

### Catálogo (`TaskType` + `externalKey`)

| Señal | Tipo | `externalKey` | Título |
|---|---|---|---|
| Pago PENDING | `REQUEST_PAYMENT` | `payment:{id}` | `Cobrar · {cliente}` |
| Opportunity con `nextFollowUpAt` | `FOLLOW_UP` | `opportunity:{id}:followup` | `Contactar · {cliente}` |
| CreditCase etapa DOCUMENTS_PENDING | `REQUEST_DOCUMENT` | `case:{id}:docs` | `Documentos pendientes · {caso}` |
| ServiceCase.`nextActionAt` | `FOLLOW_UP` | `serviceCase:{id}:nextAction` | `Próxima acción · {caso}` |
| Cambio de etapa | `FOLLOW_UP` | (sin key / existente) | `suggestedTaskTitleForStage` |
| Ronda enviada / reporte UPDATE | `REVIEW_RESULT` / `FOLLOW_UP` | (existente) | — |

Idempotencia: una sola Task abierta por `externalKey` (único por org). Al resolver la señal (pago RECEIVED/CANCELLED, lead WON/LOST, nextAction limpiada, salida de DOCUMENTS_PENDING) se completa la Task.

### Ensure al escribir

- Pagos: `registerPayment` (PENDING), `updatePendingPayment`, `receivePendingPayment`, `cancelPayment` → `ensureTaskForPayment`
- Leads: `createOpportunity`, `updateLead`, `markWon`, `markLost` → `ensureTaskForOpportunityFollowUp`
- Próxima acción: `setNextActionAt`, `setServiceCaseNextActionAt` → `ensureTaskForServiceNextAction`

### Reconcile (cron)

`GET /api/cron/reminders` llama `reconcileWorkQueueTasks` (pagos / opportunities / nextAction + `ensureDocsPendingTask`).

### Superficies

- Dashboard: `listAttentionTasks` (badges Urgente / Hoy / Cobrar / Docs / Lead / Próxima).
- Pendientes: chips por tipo con conteos + badges en filas; completadas en desplegable.

## Archivos

- `src/lib/case-section-visibility.ts`
- `src/server/automations/index.ts` (`ensureTaskFor*`, `reconcileWorkQueueTasks`)
- `src/server/tasks/index.ts` (`listAttentionTasks`, `countOpenTasksByType`)
- `app/crm/dashboard/page.tsx`
- `app/crm/tareas/page.tsx`
- `app/api/cron/reminders/route.ts`
- `app/crm/casos/[caseId]/case-header.tsx`
- `src/server/cases/index.ts` (`moveCaseToStage`, `setNextActionAt`)
- `src/components/cases/case-stage-select.tsx`
