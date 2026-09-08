# MIGRATION PLAN — Plan de migración v1

> Alineado a [`ARCHITECTURE_V1.md`](ARCHITECTURE_V1.md). **No ejecutar sobre producción.**
> Este plan sustituye la propuesta de extraer tabla `Lead` y el dual-write prolongado de la auditoría ARC-001.
> Inventario: `CURRENT_STATE.md`. Gaps: `GAP_ANALYSIS.md` (histórico; donde choque, gana ARCHITECTURE_V1).

## 1. Objetivo

Introducir `ServiceCase` como expediente genérico y envolver el crédito existente:

```text
Client
→ Opportunity          (UI Leads; no tabla Lead)
→ ServiceCase
    → CreditCase 1:1   si CREDIT_REPAIR (tabla actual, no rename)
```

Sin perder datos. Sin DROP. Sin rename de `CreditCase` ni `CreditRound`. Sin borrar `Opportunity`.

**Estrategia: aditiva, dos deploys principales, sin dual-write prolongado.**

El código viejo ignora columnas nuevas nullable. El deploy 1 aplica schema + backfill + el corte de **escrituras nuevas** (crear caso = ServiceCase + CreditCase). El deploy 2 corta la **lectura** al modelo v1 y deja de escribir campos legado. No hay semanas de escribir en dos sitios.

## 2. Precondiciones

- backup Hostinger;
- staging separado de prod;
- conteos: Client por status, Opportunity por stage, CreditCase, CreditRound, DisputeItem, Payment, Document, Task, ActivityLog;
- pooling/SSL revisados (sección 10) **antes** de backfill;
- rollback ensayado;
- aprobación humana. No migrate desde Vercel Preview contra prod.

## 3. Qué se crea y qué no

### Crear

| Cambio | Notas |
|---|---|
| `services.code` | Unique por org. Sembrar `CREDIT_REPAIR` (y códigos futuros). |
| `workflow_stages.serviceId` | Etapa pertenece a un Service. Backfill: etapas actuales → CREDIT_REPAIR. Unique `(organizationId, serviceId, key)` y `(…, order)`. |
| `service_cases` | `stageId` FK WorkflowStage. **No** columna `stage` string. `nextActionAt`. |
| `service_case_stage_history` | `fromStageId` / `toStageId`. Vacía al nacer (sin backfill histórico). |
| `notes` | Vacía al nacer. Sin backfill de `ActivityLog.NOTE`. |
| `credit_cases.serviceCaseId` | Unique, nullable en expand, NOT NULL tras backfill del deploy 1. |
| `opportunities.wonServiceCaseId` | Nullable. Backfill desde `wonCaseId` → CreditCase.serviceCaseId. Conservar `wonCaseId`. |
| `tasks/documents/payments/quotes/activity_logs.serviceCaseId` | Additive. Conservar `caseId` → CreditCase. |

### No crear

- tabla `leads` / `lead_activities`;
- `Client.leadId`;
- `ServiceCase.stage` string.

### No hacer en v1

- DROP de ninguna tabla/columna;
- rename `CreditCase`, `CreditRound`, `DisputeItem`;
- borrar u ocultar en schema `Opportunity`;
- rewrite de Letters / Comparisons / ProgressReports / CreditReport / CreditItem;
- reconstruir StageHistory o Notes desde ActivityLog;
- dual-write largo de `nextActionAt` ↔ `nextReviewAt` (solo el puente del backfill + un corte).

## 4. Backfill (dentro del deploy 1, en staging primero)

Orden:

1. Sembrar `Service.code = CREDIT_REPAIR` (reutilizar fila de catálogo si ya existe por nombre; no duplicar quotes).
2. `UPDATE workflow_stages SET serviceId = CREDIT_REPAIR` (todas las etapas org actuales de crédito). Ajustar uniques.
3. **Por cada `CreditCase`:** INSERT `ServiceCase`:
   - `clientId`, `serviceId=CREDIT_REPAIR`;
   - `caseNumber` = `caseCode`;
   - `status` mapeado: OPEN→OPEN, PAUSED→ON_HOLD, COMPLETED→COMPLETED, CANCELLED→CANCELED;
   - `stageId` = `CreditCase.stageId` (mismo WorkflowStage, ya ligado al Service);
   - `assignedToId`, `startedAt=openedAt`, `completedAt=closedAt`;
   - `nextActionAt` = `nextReviewAt` (copia única; no bucle de sync).
4. `CreditCase.serviceCaseId` = el ServiceCase insertado.
5. Hijas con `caseId`: copiar a `serviceCaseId` vía el CreditCase.
6. Opportunity con `wonCaseId`: `wonServiceCaseId` = CreditCase.serviceCaseId.
7. Clients sin CreditCase: **no** crear ServiceCase fantasma.
8. No tocar filas Opportunity salvo `wonServiceCaseId`. No crear Leads.

Validar inmediatamente (sección 6) **antes** de desplegar la app del deploy 1 que ya escribe ServiceCase.

## 5. Rondas

No hay columnas `round1Date` / `round2Date`. Cero movimiento de filas.

```text
CreditRound  ≈ DisputeRound     (nombre persistido)
DisputeItem  ≈ DisputeRoundItem
```

`onRoundSent` (+30 días en `expectedReviewAt` si falta) no crea rondas. Conservar. Tras deploy 2, al enviar ronda se actualiza `ServiceCase.nextActionAt` además de crear Task.

## 6. Validaciones post-backfill

```text
[ ] count(Client) invariante
[ ] count(Opportunity) invariante
[ ] count(ServiceCase CREDIT_REPAIR) = count(CreditCase)
[ ] cada CreditCase.serviceCaseId unique y not null
[ ] cada ServiceCase.stageId pertenece al Service CREDIT_REPAIR
[ ] count(CreditRound), (caseId, roundNumber) invariantes
[ ] count(DisputeItem) invariante
[ ] count(Note) = 0 tras crear la tabla
[ ] count(ServiceCaseStageHistory) = 0 tras crear la tabla
[ ] payments / documents / tasks / quotes: serviceCaseId poblado si había caseId
[ ] Opportunity.wonCaseId resuelve al mismo caso que wonServiceCaseId
[ ] ActivityLog / AuditLog no truncados
[ ] S3 / storageKey intactos
[ ] sample: ficha cliente, caso crédito, ronda SENT, pago, documento, listado Leads (Opportunity)
[ ] markOpportunityWon en transacción: rollback si se fuerza error
[ ] ningún SSN en logs
```

## 7. Los dos deploys

### Deploy 1 — expand + backfill + escrituras nuevas

1. Prisma migrate **solo additive** (tablas/columnas nuevas; uniques de WorkflowStage).
2. Script de backfill (sección 4) desde job de una conexión, no desde lambda Preview.
3. App:
   - `createCreditCase` / pantallas de caso crean `ServiceCase` + `CreditCase` juntos;
   - `markWon` escribe `wonServiceCaseId` y crea ServiceCase (transacción BR-012);
   - UI de Leads = Opportunity (restaurar, no tabla nueva);
   - cambios de etapa en expediente nuevo: `ServiceCase.stageId` + StageHistory + Activity;
   - notas nuevas → tabla `Note`.
4. No se exige que toda la UI lea ya `ServiceCase` (las pantallas de crédito actuales siguen por `CreditCase.id`).
5. No se escribe en bucle `nextReviewAt` ↔ `nextActionAt`. Backfill copió una vez; escrituras nuevas de “próxima acción” van a `ServiceCase.nextActionAt`. Rutas viejas que aún setean `nextReviewAt` se tocan en el mismo deploy o se listan para el deploy 2 — no dejar dos fuentes vivas semanas.

Rollback deploy 1: revertir app; columnas nuevas nullable no rompen el binario anterior. Tablas nuevas se pueden vaciar con script inverso. **No DROP de Client/CreditCase/Opportunity.**

### Deploy 2 — contract de lectura (sin DROP)

1. UI/API de expediente leen `ServiceCase` (status, stageId, nextActionAt, agreedAmount cuando exista).
2. Dashboard: follow-up comercial = `Opportunity.nextFollowUpAt`; operación = `ServiceCase.nextActionAt`; tareas = `Task.dueAt`.
3. Dejar de **escribir** `CreditCase.nextReviewAt` y, en WON nuevo, tratar `wonServiceCaseId` como canónico (`wonCaseId` se rellena solo si hace falta compatibilidad interna puntual, no como API).
4. `CreditCase.serviceCaseId` ya NOT NULL.
5. Columnas legado se marcan deprecated en código/docs. **No DROP. No rename.**

Rollback deploy 2: revertir app al deploy 1. Los datos ServiceCase siguen ahí.

No hay deploy 3 de DROP en este plan.

## 8. Checklist producción

```text
[ ] Backup
[ ] Staging migrado (deploy 1 + backfill + QA)
[ ] Queries revisadas
[ ] Rollback deploy 1 probado
[ ] Ventana deploy 1
[ ] QA prod-like del wrap (crédito: reportes, rondas, cartas, comparaciones)
[ ] Ventana deploy 2
[ ] Rollback deploy 2 probado
[ ] Migración aprobada manualmente
```

Nada de esto está ejecutado.

## 9. Riesgos de pérdida de datos

| Riesgo | Mitigación |
|---|---|
| Extraer tabla Lead y borrar Clients | **No aplica.** No hay tabla Lead. |
| CreditCase huérfano (`markWon` actual) | Backfill por CreditCase, no por Opportunity WON. Arreglar markWon en deploy 1. |
| WorkflowStage unique al añadir serviceId | Backfill serviceId **antes** de crear etapas de otros verticales. Migrar uniques en la misma migrate. |
| stageId de ServiceCase apunta a etapa de otro Service | Check en backfill y en `changeStage`. |
| Dual-write nextReviewAt / nextActionAt divergente | Prohibido el bucle. Copia una vez + corte. |
| Backfill de NOTE sucio | No se hace. |
| Timeout / too many connections Hostinger | Batches; una conexión larga; no Preview→prod. |
| App vieja crea CreditCase sin ServiceCase entre migrate y app | Encadenar migrate + backfill + app del deploy 1 en la misma ventana; congelar altas de casos si hace falta minutos. |
| S3 | No se toca. |

## 10. Hostinger y Vercel

Sin cambios respecto al riesgo ya auditado: Prisma singleton, sin pooler, `DATABASE_URL` plano.

Antes de migrate/backfill:

1. SSL en el connection string;
2. envs separados (`dev` / `staging` / `prod`);
3. `connection_limit` bajo en serverless o job persistente para el backfill;
4. no Preview contra prod;
5. agentes no ejecutan esto en producción (`docs/07-SECURITY.md`).

## 11. Orden de tickets (no implementar aquí)

1. Infra DB (SSL/pool/envs) — bloqueante.
2. Migrate expand (ARC-003 + ARC-004).
3. Backfill staging + conteos.
4. Deploy 1 app: wrap create + markWon + Leads UI.
5. QA crédito (no regresión de rounds/letters/comparisons).
6. Deploy 2: lecturas ServiceCase, deprecar escritura nextReviewAt / wonCaseId.
7. Note + StageHistory en el flujo de cambio de etapa (puede ir en deploy 1 para escrituras nuevas).
8. P1: agreedAmount/balance de expediente; verticales.

## 12. Fuera de este plan

- Ejecutar SQL o `prisma migrate`.
- Cambiar `schema.prisma` ahora.
- Rename o DROP.
- Borrar Opportunity, MetaLeadEvent o documentos S3.
- Tabla Lead.
