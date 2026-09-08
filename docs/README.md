# JH CRM — Documentación del proyecto

Esta carpeta contiene la especificación funcional y técnica base para desarrollar el CRM de JH Financial.

## Stack actual

- Next.js
- Vercel
- MySQL en Hostinger
- OpenRouter para funciones de IA
- Cursor para desarrollo
- Grok Bot para QA
- ChatGPT como apoyo de producto/arquitectura
- Kimi como auditor técnico y de casos límite

## Modelo central

```text
Lead
  ↓
Client
  ↓
ServiceCase
  ↓
Workflow
  ↓
Tasks / Documents / Notes / Payments
  ↓
Completion
  ↓
Testimonial
```

Para reparación de crédito:

```text
CreditCase
  ↓
CreditReport
  ↓
CreditItems
  ↓
DisputeRounds
  ↓
Review
  ↓
Next Action
```

## Orden recomendado de trabajo

1. Auditar el repositorio actual.
2. Congelar modelo de dominio y base de datos v1.
3. Implementar Lead → Client → ServiceCase.
4. Implementar Tasks / Activity / Notes / Documents.
5. Implementar Credit Repair.
6. Implementar Quotes / Payments / Contracts.
7. Implementar servicios secundarios.
8. Implementar testimonios.
9. Implementar automatizaciones.
10. Implementar IA dentro del CRM.

## Archivos

- `00-PRODUCT.md`: objetivo y alcance.
- `01-DOMAIN.md`: entidades y relaciones.
- `02-BUSINESS_RULES.md`: reglas de negocio.
- `03-DATABASE.md`: diseño objetivo de datos.
- `04-BACKLOG.md`: backlog priorizado.
- `05-ROADMAP.md`: orden de entregas.
- `06-DEFINITION_OF_DONE.md`: criterios de terminado.
- `07-SECURITY.md`: reglas de seguridad y datos sensibles.
- `08-AI_CONTEXT.md`: contexto corto para IAs.
- `09-QA_PLAN.md`: plan de pruebas para Grok Bot.
- `10-CURRENT_STATE_TEMPLATE.md`: auditoría del estado actual.
- `11-GAP_ANALYSIS_TEMPLATE.md`: diferencias entre actual y objetivo.
- `12-MIGRATION_PLAN_TEMPLATE.md`: plan de migración.
- `13-OPENROUTER_AI.md`: arquitectura recomendada para IA.
- `14-DEPLOYMENT.md`: entornos y despliegues.
- `99-SOURCE_REPORT.md`: reporte original de requerimientos.
