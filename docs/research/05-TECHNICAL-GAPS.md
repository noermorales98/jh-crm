# 05 — Technical gaps

> Separar **problema real encontrado** de **riesgo posible**. Sin inventar.

## Problemas reales encontrados

### T1 — Docs de estado desalineados con main

- `CURRENT_STATE.md` niega ServiceCase; el schema y el código lo tienen.
- `GAP_ANALYSIS.md` es histórico pero agentes lo leen como vigente.
- **Impacto:** planes que “crean” lo ya existente.
- **Acción:** marcar docs / actualizar en ticket de documentación (no bloquea Fase A).

### T2 — Intake write sin read path

- `submitIntake` persiste `IntakeSubmission.payloadJson`.
- Cero queries en `getClientOverview` / páginas CRM que lean el JSON.
- **Impacto:** datos huérfanos para UX.
- **Acción:** Fase A1 — query slim `findFirst` por clientId + select payload + submittedAt.

### T3 — Inconsistencia de automatización de leads

- Web/Meta → `onNewLead`.
- CRM `createLead` → no llama automation.
- **Impacto:** dashboard vacío para leads internos.
- **Acción:** Fase A4 — mismo hook; título unificado.

### T4 — markWon hardcode vertical

- `ensureCreditRepairService` / createCreditCase path fijo.
- Catálogo multi-vertical (`verticals.ts`) no participa en WON.
- **Impacto:** deuda de dominio multi-service.
- **Acción:** Fase A3 — parámetro `serviceCode` validado contra Service org.

### T5 — Duplicidad de FKs caseId vs serviceCaseId

- Tasks, docs, payments aceptan CreditCase y/o ServiceCase.
- Overview ya scopea con OR — correcto pero frágil si se olvida un lado.
- **Impacto:** bugs de scoping multi-service (mitigado en CL-003 smoke).
- **Acción:** no schema ahora; mantener disciplina en queries; tests smoke.

### T6 — Relojes múltiples

- `Opportunity.nextFollowUpAt`, `ServiceCase.nextActionAt`, `Task.dueAt`, `CreditCase.nextReviewAt` (legacy).
- **Impacto:** confusión de producto si UI mezcla fuentes.
- **Acción:** UI siempre etiquetar origen; no colapsar columnas (ARCHITECTURE_V1).

## Riesgos posibles (no bugs demostrados en esta auditoría)

| Riesgo | Evidencia | Severidad |
|--------|-----------|-----------|
| `getCaseCreditOverview` pesado bajo muchos reportes | `listReportsForCase` con includes | Media |
| Pool MySQL / timeouts serverless | Commits/docs INFRA; timeout Prisma reciente | Media–Alta ops |
| N+1 si se añade intake mal | Si se hace include profundo por submission | Baja si slim select |
| Permisos intake mal mapeados | Hoy create link = `clients.edit`; viewer no definido | Baja si D5 explícito |

## Performance: reglas para Fase A

```text
- Overview: 1 findFirst IntakeSubmission (select mínimo) en Promise.all existente
- No firmar URLs S3 en overview
- No cargar PDFs del intake
- Hover sin DB
- markWon: misma transacción; no queries extra en hot path UI
- Tareas: update title string; no nuevas tablas
```

## Accessibility / responsive

- Peeks y rail V2 ya usan botones + aria-label en scores/timeline.
- Gaps residuales: peeks round/payment con lint `setState in effect` preexistente — no bloqueante.
- Mobile: Fase A debe mantener 1 columna; resumen intake colapsable si largo.

## Permissions (Fase A)

| Recurso | Roles |
|---------|-------|
| Ver resumen intake en Resumen | OWNER, SPECIALIST (D5) |
| Crear/revocar IntakeLink | Mantener `clients.edit` (o alinear a mismos roles si producto lo pide después) |
| Abrir ServiceCase | `cases.manage` (existente) |

## Qué no es deuda técnica

- Nombres persistidos CreditRound / DisputeItem (alias documental OK).
- ActivityLog.NOTE histórico sin migrar a Note (BR-021 explícito).
- Dos deploys aditivos sin DROP (estrategia correcta).
