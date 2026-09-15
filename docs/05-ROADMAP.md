# ROADMAP — Orden de implementación

> Fuente canónica: [`ARCHITECTURE_V1.md`](ARCHITECTURE_V1.md).

## Fase 0 — Auditoría

**Estado:** DONE (2026-09-08).

Entregables: `CURRENT_STATE.md`, `GAP_ANALYSIS.md`, `MIGRATION_PLAN.md`.

Dominio v1 congelado en `ARCHITECTURE_V1.md`.

---

## Fase 1 — ServiceCase + Leads UI

Dos deploys aditivos (`MIGRATION_PLAN.md`). Sin tabla Lead. Sin rewrite de crédito.

Construir:

```text
WorkflowStage por Service
→ ServiceCase (envuelve CreditCase)
→ Opportunity como Leads en UI
→ markOpportunityWon transaccional
→ nextActionAt / nextFollowUpAt / Task.dueAt
→ Dashboard (leads por contactar + próxima acción)
```

### Demo de aceptación

Un prospecto llega desde Instagram: se registra como Client + Opportunity, se programa `nextFollowUpAt`, se contacta, se marca WON y queda un ServiceCase CREDIT_REPAIR con CreditCase 1:1.

---

## Fase 2 — Operación diaria

**Estado:** DONE (2026-09-15). Tabla `Note` (cliente + ServiceCase), `ServiceCaseStageHistory`, `ServiceCase.nextActionAt` canónico, Task/Document/Payment/Quote ligados a `serviceCaseId`.

Ya existe Tasks / Documents / Activity / dashboard. Completar:

- tabla `Note` (sin backfill de ActivityLog.NOTE);
- `ServiceCaseStageHistory` (solo cambios nuevos);
- `ServiceCase.nextActionAt` como fuente operativa (deprecar escritura de `nextReviewAt`);
- ligar Task/Document/Payment/Quote a `serviceCaseId`.

### Meta

Al abrir un expediente, Hugo debe saber en pocos segundos:

- qué ocurrió;
- qué toca hacer (`nextActionAt`);
- cuándo toca hacerlo (`Task.dueAt` si hay tarea).

---

## Fase 3 — Reparación de crédito

**El módulo ya existe.** No reconstruir.

Trabajo de esta fase = envolver + huecos de producto (action en DisputeItem, balance de expediente, dual tarea de revisión), no un segundo CreditCase.

### Demo de aceptación (flujo ya implementado, debe seguir funcionando tras el wrap)

```text
Cliente
↓
ServiceCase + CreditCase
↓
Reporte inicial
↓
Items
↓
Ronda #1 (CreditRound)
↓
Items (DisputeItem)
↓
Marcar enviada
↓
expectedReviewAt + Task + nextActionAt
↓
Revisar resultado
↓
Nueva ronda si corresponde
↓
Finalizar
```

---

## Fase 4 — Ventas y cobranza

**Estado:** DONE (2026-09-15). `agreedAmount`/`quotedAmount` editables + balance a nivel ServiceCase (`serviceCaseBalance`, card «Dinero del expediente», resumen en pagos del caso); `wonServiceCaseId` como único enlace WON (`wonCaseId` sin escritura, lectura legacy). Smoke: `scripts/smoke/fase4-balance-notes.ts` + `mark-won-br012.ts` actualizado.

Ya hay Quotes / Payments / Receipts / Plans / Contracts.

Completar:

- `agreedAmount` y balance a nivel ServiceCase;
- `wonServiceCaseId` como único enlace WON (wonCaseId sin escritura).

---

## Fase 5 — Servicios secundarios

Nuevos `WorkflowStage` por Service + extensión 1:1:

- HomeBuyerCase
- FundingCase / FundingApplication
- PersonalLoanCase
- ProjectCase

---

## Fase 6 — Testimonios

CRUD, consentimiento, aprobación, publicación, endpoint público.

---

## Fase 7 — Automatizaciones

Después del MVP estable: email, webhook, SMS, WhatsApp, pagos online.

---

## Fase 8 — IA

Después de `sanitizeForAI()`: resumen de expediente, siguiente acción sugerida, extracción de tareas, búsqueda asistida.
