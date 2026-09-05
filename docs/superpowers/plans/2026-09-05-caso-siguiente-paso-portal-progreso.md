# Qué sigue (caso) + Progreso portal — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Card “Qué sigue” en resumen de caso + portal Progreso/Reportes/nav pulidos.

**Architecture:** Helpers server (`getCaseNextSteps`, `getLatestPortalProgressReport`) + UI cards; PDF API acepta staff o dueño portal.

**Tech Stack:** Next.js App Router, Prisma, componentes UI existentes.

## Global Constraints

- Sin módulos nuevos en navegación CRM.
- Español; sin enums crudos al cliente.
- Solo campos de snapshot seguros en portal.

---

### Task 1: `getCaseNextSteps` + card CRM

**Files:**
- Create: `src/server/cases/next-steps.ts`
- Create: `src/components/cases/case-next-steps-card.tsx`
- Modify: `src/components/cases/case-detail-panel.tsx`

- [ ] Implementar helper con reglas del spec (máx 3 ítems)
- [ ] Renderizar card arriba de “Estado del proceso”
- [ ] Verificar en un caso OPEN con ronda

### Task 2: Portal Progreso

**Files:**
- Modify: `src/server/portal/index.ts` (`getLatestPortalProgressReport`)
- Modify: `app/portal/(app)/progreso/page.tsx`

- [ ] Cargar último reporte + nextSteps/scores/results
- [ ] Empty state si no hay reporte
- [ ] Traducir outcomes

### Task 3: Portal Reportes Ver/PDF

**Files:**
- Create: `app/portal/(app)/reportes/[reportId]/page.tsx`
- Modify: `app/portal/(app)/reportes/page.tsx`
- Modify: `app/api/progress-reports/[reportId]/pdf/route.ts`
- Modify: `src/server/progress-reports/index.ts` (acceso portal)

- [ ] Links Ver + PDF
- [ ] Auth portal dueño del reporte

### Task 4: Nav portal + Inicio

**Files:**
- Modify: `app/portal/(app)/layout.tsx` (client nav o headers)
- Modify: `app/portal/(app)/page.tsx` (pill vencida)

- [ ] `aria-current` / estilo activo
- [ ] Próxima revisión vencida en Inicio
