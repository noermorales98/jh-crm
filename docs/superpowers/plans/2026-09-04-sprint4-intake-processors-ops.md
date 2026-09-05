# SPRINT 4 — Intake avanzado, procesadores, atribución, pipeline comercial

**Goal:** Completar FASE 7–10 del master: intake especializado, catálogo de procesadores, UTM/atribución + dashboard, Opportunity Kanban separado del crédito.

**Architecture:** Extender intake/tokens existentes; `CreditProcessor` + `ClientProcessorAccount` junto a `ExternalReference`; `Client.attribution` JSON + filtros tipados; modelo `Opportunity` con etapas comerciales y Kanban (WON → CreditCase + ACTIVE).

## Informe previo

1. **Reutilizar:** IntakeLink/Submission/Consent, Client (source/status), ExternalReference, contact form, WorkflowStage (solo operación; no mezclar), createCreditCase, notifications.
2. **Nuevos:** `CreditProcessor`, `ClientProcessorAccount`, `Opportunity` (+ enums), campos intake payload, `Client.attribution` / `serviceRequested` / preferencias.
3. **Rutas:** `/crm/oportunidades`, `/crm/procesadores`, `/crm/atribucion` (dashboard), intake form extendido, APIs contact con UTM.
4. **Archivos:** schema + migración, `src/server/{intake,processors,opportunities,attribution,contact}`, UI Kanban/procesadores/intake/contact, permisos, smoke.
5. **Migración:** aditiva `20260904230000_sprint4_intake_processors_ops`.
6. **Conflictos:** etapas `QUOTE_SENT`/`PAYMENT_PENDING` siguen en WorkflowStage de CreditCase (legacy); Opportunity es pipeline nuevo paralelo. ExternalReference se mantiene.
7. **Ya existe (no rehacer):** tokens intake, consent, upload, leads vía contact, Client.source string.

## Tasks

### T1 Schema + migración
### T2 Intake avanzado (payload + form + categorías)
### T3 Procesadores CRM
### T4 Attribution + contact + dashboard
### T5 Opportunity Kanban + WON→caso
### T6 Smoke + README + verify
