# JH CRM — Documentación del proyecto

Esta carpeta contiene la especificación funcional y técnica del CRM de JH Financial.

**Fuente canónica de arquitectura:** [`ARCHITECTURE_V1.md`](ARCHITECTURE_V1.md). Si otro archivo contradice ese documento, prevalece v1.

## Stack actual

- Next.js
- Vercel
- MySQL en Hostinger
- OpenRouter para funciones de IA
- Cursor para desarrollo
- Grok Bot para QA
- ChatGPT como apoyo de producto/arquitectura
- Kimi como auditor técnico y de casos límite

## Modelo central (v1)

```text
Client                         persona / contacto
  ├── Opportunity              pipeline comercial (UI: Leads)
  └── ServiceCase
        ↓
      WorkflowStage            única fuente de stage (por Service)
        ↓
      Tasks / Documents / Notes / Payments
        ↓
      Completion
        ↓
      Testimonial              (P1)
```

No hay tabla `Lead`. El prospecto es un `Client`; el deal es una `Opportunity`.

Para reparación de crédito (módulo existente, se envuelve):

```text
ServiceCase (CREDIT_REPAIR)
  ↓
CreditCase                     1:1; no rename
  ↓
CreditReport / CreditItem
  ↓
CreditRound                    (concepto DisputeRound)
  ↓
DisputeItem
  ↓
Review + ServiceCase.nextActionAt
```

## Orden recomendado de trabajo

1. Auditoría del repo — DONE (`CURRENT_STATE`, `GAP_ANALYSIS`, `MIGRATION_PLAN`).
2. Congelar arquitectura v1 — DONE (`ARCHITECTURE_V1.md`).
3. ServiceCase + WorkflowStage por Service + wrap CreditCase (dos deploys aditivos).
4. Leads UI sobre Opportunity; `markOpportunityWon` transaccional.
5. Notes nuevas + StageHistory nueva (sin backfill histórico).
6. Completar Credit Repair existente (no reescribir).
7. Quotes / Payments / Contracts a nivel expediente.
8. Servicios secundarios.
9. Testimonios.
10. Automatizaciones.
11. IA dentro del CRM (`sanitizeForAI` antes).

## Archivos

- `ARCHITECTURE_V1.md`: **decisiones arquitectónicas canónicas**.
- `00-PRODUCT.md`: objetivo y alcance.
- `01-DOMAIN.md`: entidades y relaciones.
- `02-BUSINESS_RULES.md`: reglas de negocio.
- `03-DATABASE.md`: diseño objetivo de datos v1.
- `04-BACKLOG.md`: backlog priorizado.
- `05-ROADMAP.md`: orden de entregas.
- `06-DEFINITION_OF_DONE.md`: criterios de terminado.
- `07-SECURITY.md`: reglas de seguridad y datos sensibles.
- `08-AI_CONTEXT.md`: contexto corto para IAs.
- `09-QA_PLAN.md`: plan de pruebas para Grok Bot.
- `CURRENT_STATE.md`: auditoría del estado actual (ARC-001).
- `GAP_ANALYSIS.md`: diferencias auditadas vs el objetivo *previo* (histórico; gana v1).
- `MIGRATION_PLAN.md`: migración aditiva, dos deploys.
- `10-CURRENT_STATE_TEMPLATE.md` / `11-GAP_ANALYSIS_TEMPLATE.md` / `12-MIGRATION_PLAN_TEMPLATE.md`: plantillas.
- `13-OPENROUTER_AI.md`: arquitectura recomendada para IA.
- `14-DEPLOYMENT.md`: entornos y despliegues.
- `99-SOURCE_REPORT.md`: reporte original de requerimientos.
