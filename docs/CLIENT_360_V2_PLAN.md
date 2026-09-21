# Client 360 V2 — Plan de implementación

> Composición operativa del hub de cliente. No modifica `ARCHITECTURE_V1.md` ni el schema Prisma.

## Estado actual

El hub (`ClientDetailPanel` → `ClientOverviewPanel`) ya carga un overview denso vía `getClientOverview()`:

- servicios activos + switcher
- nextAction / etapa
- scores por buró + historial
- gráfica (`hasChartData`)
- ronda actual + strip de rondas
- items / pagos / actividad ×3

**Problema:** scores tipográficos, gráfica, timeline, ronda, items y pagos viven detrás de `<details>Más detalle de crédito</details>`. Los gauges del hero duplican scores sin historial. Hugo necesita decidir en ~5s sin ese click.

## Componentes reutilizados

| Componente | Uso V2 |
|---|---|
| `ClientServiceSwitcher` | Contexto multi-service |
| `ClientQuickAdd` | Alta rápida (+ nota en modal) |
| `BureauScoreInteractive` | Única franja de scores |
| `CreditScoreChart` / `ScoreEvolutionChart` | Gráfica above-the-fold |
| `RoundsSummaryStrip` + `RoundPeekModal` | Rondas compactas + peek |
| `PaymentsSummaryStrip` + `PaymentPeekModal` | Recientes / Stripe / peek |
| `getClientOverview()` | Fuente de datos ampliada |

## Componentes nuevos

| Archivo | Rol |
|---|---|
| `client-operational-rail.tsx` | Rail derecha: next action, etapa, ronda, tareas, docs, balance |
| `credit-timeline.tsx` | Timeline interactiva (reportes / rondas) |
| `report-peek-modal.tsx` | Peek de reporte al click del chart/timeline |
| `client-note-quick-modal.tsx` | Nota inline sin navegar a `/actividad` |

## Queries nuevas / cambios

1. **`priorityTasks`** (máx 3): `task.findMany` scoped al ServiceCase, select mínimo, order priority/dueAt.
2. **`documentsChecklistSummary`**: `document.groupBy` por category + checklist en código (`getChecklistForService`). Sin URLs S3.
3. **`getReportPeek` / `peekReportAction`**: carga slim al click (scores, counts, delta vs anterior, comparación si existe, eventos cercanos). No `getReportDetail` completo.

## Archivos afectados

- `docs/CLIENT_360_V2_PLAN.md` (este)
- `src/server/clients/overview.ts`
- `src/server/documents/checklist.ts` (summary helper)
- `src/server/credit-reports` (peek slim)
- `src/actions/client-overview.ts`
- `src/actions/notes.ts` + validation (serviceCaseId opcional)
- `src/components/clients/client-overview-panel.tsx`
- `src/components/clients/bureau-score-interactive.tsx`
- `src/components/clients/credit-score-chart.tsx`
- `src/components/clients/client-quick-add.tsx`
- `src/components/clients/client-detail-panel.tsx` (props QuickAdd)
- Nuevos componentes listados arriba
- Smoke: `scripts/smoke/multi-service-cl003.ts`

## Performance impact

| Cambio | Impacto |
|---|---|
| Reemplazar `document.count` por `groupBy` category | 1 query, mismos filtros |
| + `task.findMany` take 3 | 1 query ligera en Promise.all |
| Report peek | Solo al click; sin items completos |
| Hover chart/scores/timeline | Solo estado React |

No se cambia connection strategy. No se cargan PDFs ni URLs firmadas en overview.

## Wireframe desktop (12 cols)

```text
[ Header: cliente · ServiceSwitcher · QuickAdd ]

┌──────────── 8 ────────────┬────── 4 (rail) ──────┐
│ Scores EXP / EQX / TU     │ Próxima acción       │
│ Gráfica (si 2+ reportes)  │ Etapa                │
│ Timeline crédito          │ Ronda actual         │
│                           │ Tareas ≤3            │
│                           │ Docs checklist       │
│                           │ Balance              │
└───────────────────────────┴──────────────────────┘
Below: rondas · items · pagos strip · actividad
```

CREDIT_REPAIR only: scores/chart/timeline. Otras verticales: métricas + mismo rail.

## Criterios de aceptación

1. 1 click Clientes → Client 360.
2. 0 clicks: scores, gráfica (si `hasChartData`), próxima acción, ronda actual, balance.
3. Sin accordion que oculte scores/gráfica/ronda/balance.
4. Una sola franja de scores (sin gauges duplicados).
5. Click chart → ReportPeekModal; CTA a reporte completo; sin causalidad ronda→score.
6. Timeline clickable; sync visual con chart cuando hay reportId seleccionado.
7. Rail con tareas ≤3 y docs resumen.
8. Switcher actualiza contexto operativo.
9. Nota desde QuickAdd en modal.
10. Rutas detalladas intactas. Sin schema Prisma. Sin Recharts.
11. typecheck / lint / build / smokes relevantes OK (o fallos previos documentados).
