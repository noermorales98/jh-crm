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

**Estado:** DONE (2026-09-15; dual-write Document/Quote 2026-09-16). Tabla `Note` (cliente + ServiceCase), `ServiceCaseStageHistory`, `ServiceCase.nextActionAt` canónico, Task/Document/Payment/Quote ligados a `serviceCaseId` en create (upload CRM/portal/intake y `createQuote` resuelven desde `CreditCase`). Smoke: `multi-service-cl003.ts` + `domain-smoke.ts`.

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

**Estado:** DONE (2026-09-16). Wrap CreditCase 1:1 (ARC-003 Deploy 1+2 contract de lectura); balance a nivel ServiceCase (Fase 4); tarea de revisión canónica única; `DisputeItem.action` (CR-006). Workspace crédito en `/crm/casos/[caseId]`; `nextActionAt` canónico en cron/listados/IA.

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

**Estado:** DONE (2026-09-15; FD-002 UI + smoke 2026-09-16). Migración aplicada con `migrate deploy` + `prisma generate`; ficha genérica en `/crm/expedientes/[serviceCaseId]`; alta desde la ficha del cliente con selector de servicio; aplicaciones a prestamistas (create/edit) en el expediente de financiamiento. Smoke: `scripts/smoke/fase5-verticals.ts` + `scripts/smoke/funding-applications.ts` + regresiones Fase 4 / SC-003 / CL-003 / BR-012.

Nuevos `WorkflowStage` por Service + extensión 1:1:

- HomeBuyerCase
- FundingCase / FundingApplication
- PersonalLoanCase
- ProjectCase

---

## Fase 6 — Testimonios

**Estado:** DONE (2026-09-15). TM-001…TM-004: modelo `Testimonial` + migración aditiva aplicada en DEV (Hostinger); CRUD en ficha de cliente, cola `/crm/testimonios` y captura/consentimiento en `/portal/testimonios`. Consentimiento versionado con evidencia y huella del contenido; aprobación y publicación humanas separadas. Editar o retirar consentimiento despublica; control de versión impide revisar contenido obsoleto. Endpoint `GET /api/public/testimonials` con proyección pública y `no-store`, aislado a la organización del sitio. Smoke: `scripts/smoke/fase6-testimonials.ts` (39/39).

---

## Fase 7 — Automatizaciones

**Estado:** DONE (2026-09-16). **AU-001** correos; **AU-002** contacto; **AU-004** Whapi clientes; **AU-005** Stripe Checkout (consulta diferida + cotización). **CR-PDF-001** (2026-09-17) import asistido de PDFs de crédito/progress. Aplazado: SMS (AU-003); AU-006 API burós / AU-007 P3.

Después del MVP estable: email, webhook, SMS, WhatsApp, pagos online.

---

## Fase 8 — IA

**Estado:** DONE (2026-09-16). AI-001 wrapper + AI-002 sanitize; AI-003 resumen, AI-004 siguiente acción, AI-005 extracción de nota + confirm UI; AI-006 búsqueda asistida en spotlight (`assistSearch` + `POST /api/crm/search/assist`). Smokes: `ai-fase8-tasks.ts`, `ai-006-assist-search.ts`.

Después de `sanitizeForAI()`: resumen de expediente, siguiente acción sugerida, extracción de tareas, búsqueda asistida.
