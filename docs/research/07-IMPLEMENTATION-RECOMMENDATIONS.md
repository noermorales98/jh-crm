# 07 — Implementation recommendations

> **Fase A aprobada e implementada (2026-09-21).**  
> Decisiones de producto D1–D5 ancladas (ver `04-UX-GAPS.md`).

## Principio

Mejorar lo existente. Sin Prisma schema en Fase A. Sin Recharts. Sin copiar repos externos. Sin tocar ARCHITECTURE_V1 ni Credit Repair core.

---

## FASE A — Cliente nuevo entendible (prioridad)

**Beneficio UX:** Hugo ve respuestas del form, abre el servicio correcto, y la cola de leads es accionable.  
**Cambios DB:** no.  
**Riesgo:** bajo–medio.  
**Performance:** +1 query slim en overview; resto local/reuse.

### A1 — Intake summary en Resumen

| Campo | Detalle |
|-------|---------|
| Qué | Bloque compacto: fecha, objetivo, motivo (truncado), 2–4 flags, docs count; CTA “Ver documentos” |
| Quién ve | OWNER, SPECIALIST |
| Backend | `getLatestIntakeSubmission(ctx, clientId)` select `payloadJson, submittedAt, id` |
| Overview | Extender `getClientOverview` / panel; incluir en Promise.all |
| UI | Card en `client-overview-panel` (above o bajo rail según espacio desktop) |
| Archivos | `src/server/intake/*`, `overview.ts`, `client-overview-panel.tsx`, permisos |

### A2 — Empty state → ServiceCase directo

| Campo | Detalle |
|-------|---------|
| Qué | “Sin expediente” ofrece abrir expediente con selector de vertical |
| UI | Pasar `listVerticalServiceOptions` a CreateCaseButton desde Resumen (como `/servicios`) |
| Archivos | `client-overview-panel.tsx`, `client-detail-panel.tsx`, `create-case-button.tsx`, `verticals.ts` |

### A3 — markWon respeta vertical

| Campo | Detalle |
|-------|---------|
| Qué | WON recibe `serviceCode` (o serviceId) validado; crea ServiceCase de esa vertical; CREDIT_REPAIR solo si aplica |
| UI | Selector en flujo markWon / oportunidad |
| Archivos | `src/server/opportunities/index.ts`, `src/actions/opportunities.ts`, componentes mark-won/lead |

### A4 — Tareas lead

| Campo | Detalle |
|-------|---------|
| Título | Exacto: `Contactar a [nombre] nuevo lead` |
| createLead | Llamar misma automation que web/Meta |
| Detalle | Bloque “Qué necesita”: serviceRequested + intent + link cliente; si hay intake, una línea resumen |
| Archivos | `automations/index.ts`, `opportunities/index.ts`, `tasks/index.ts`, `task-detail-panel.tsx`, dashboard |

### Orden de implementación sugerido

```text
A1 Intake summary
A4 Tareas lead (título + createLead)
A2 Empty state ServiceCase
A3 markWon vertical
```

A1 y A4 son independientes y pueden ir en paralelo. A3 depende de UX de WON.

### Test plan Fase A

- Smoke: overview con submission muestra resumen; sin submission no rompe.
- OWNER/SPECIALIST ven bloque; otros roles no (o según matriz final).
- createLead CRM genera tarea con título D4.
- Empty state abre ServiceCase HOME_BUYER (u otra) sin CreditCase.
- markWon HOME_BUYER no crea CreditCase; CREDIT_REPAIR sí.
- typecheck / lint / build; smoke multi-service + intake si existe.

---

## FASE B — Client 360 polish (post-A)

- Sync timeline/chart residual.
- Progressive disclosure mobile del rail.
- Limpiar gauges no usados en hub.

**Reutiliza:** peeks, chart, rail. **DB:** no.

---

## FASE C — Dashboard atención

- Homogeneizar badges Lead/Urgente con nuevos títulos.
- Deep link tarea → cliente con contexto.

**DB:** no.

---

## FASE D — Balance a nivel ServiceCase (opcional, schema)

- Solo si producto exige agreedAmount fuera de Quote.
- Requiere aprobación schema explícita.

---

## Archivos probablemente tocados en Fase A

```text
src/server/intake/index.ts          (o nuevo getLatest*)
src/server/clients/overview.ts
src/components/clients/client-overview-panel.tsx
src/components/clients/client-detail-panel.tsx
src/components/cases/create-case-button.tsx
src/server/services/verticals.ts
src/server/opportunities/index.ts
src/actions/opportunities.ts
src/server/automations/index.ts
src/server/tasks/index.ts
src/components/tasks/task-detail-panel.tsx
app/crm/dashboard/page.tsx
src/server/auth/permissions.ts      (si hace falta permiso intake.view)
scripts/smoke/*                     (extender)
```

## Qué NO se toca en Fase A

- Prisma schema / migraciones
- ARCHITECTURE_V1
- Credit Repair core (reports/rounds/letters)
- Stripe rewrite
- Nuevas dependencias de charts
- Código de Frappe/ClientFlow/HisaabScore/CredGate

---

## Criterio de aceptación Fase A (producto)

1. Tras submit de intake, Resumen muestra resumen de respuestas (OWNER/SPECIALIST).
2. Cliente sin expediente puede abrir ServiceCase eligiendo servicio.
3. markWon crea el servicio elegido.
4. Tareas nuevas de lead: `Contactar a [nombre] nuevo lead` y detalle con necesidad clara.
5. createLead CRM genera esa tarea.
6. Sin peores queries MySQL; typecheck/lint/build OK.

---

## Estado de esta investigación

```text
Investigación: COMPLETA (docs/research/01–07)
Implementación Fase A: EN CURSO / APROBADA (2026-09-21)
```

Cuando apruebes: implementar solo Fase A en un ticket/PR dedicado.
