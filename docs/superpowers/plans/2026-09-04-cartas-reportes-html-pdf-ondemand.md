# Cartas/reportes HTML + PDF on-demand — Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Ver cartas y reportes en HTML; PDF solo al descargar, sin guardar en S3.

**Architecture:** Snapshot en BD (`DisputeLetter` existente + `ClientProgressReport` nuevo). Vistas HTML en CRM. APIs GET que streaman jsPDF sin `putObject`.

**Tech Stack:** Next.js App Router, Prisma/MySQL, jsPDF, server actions existentes.

## Global Constraints

- Solo cartas + reportes de progreso (no cotizaciones/recibos).
- Migraciones aditivas; no `db push` destructivo.
- Permisos: `letters.view` / `letters.manage`.
- Responder en español en UI.

---

### Task 1: Modelo `ClientProgressReport` + migración

- [ ] Añadir model en `prisma/schema.prisma` + relations en Organization, CreditCase, CreditRound, User
- [ ] Migración `20260904220000_client_progress_reports`
- [ ] `prisma migrate` / generate; actualizar `src/lib/db.ts` si hay check de delegates

### Task 2: Servicio progress-reports (sin S3)

- [ ] Reescribir `generateAndStoreClientProgressReport` → `createClientProgressReport` (INSERT snapshot, activity)
- [ ] `listProgressReportsForCase`, `listProgressReportsForRound`, `getProgressReport`, `buildProgressReportPdf`
- [ ] Actualizar action `generateClientProgressReport` para devolver `reportId`

### Task 3: finalizeLetter sin S3

- [ ] Quitar putObject/Document de `finalizeLetter`; solo FINAL + activity
- [ ] Añadir `buildLetterPdf(ctx, letterId)` para download on-demand
- [ ] Actualizar smoke letters

### Task 4: APIs PDF

- [ ] `GET /api/letters/[letterId]/pdf`
- [ ] `GET /api/progress-reports/[reportId]/pdf`

### Task 5: Vistas HTML + UI

- [ ] Página carta + componente tipográfico
- [ ] Página reporte + historial en ronda/crédito
- [ ] Actualizar LetterActions, GenerateProgressReportButton, enlaces

### Task 6: Verificar

- [ ] tsc, migrate, smoke letters (+ progress si aplica)
