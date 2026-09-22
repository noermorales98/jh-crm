# 04 — UX Gaps (priorizados)

> Impacto para Hugo. Decisiones de producto **aprobadas 2026-09-21** incluidas.

## Decisiones de producto (cerradas)

| # | Decisión |
|---|----------|
| D1 | Respuestas intake: **resumen compacto en Resumen** (Client 360) |
| D2 | Empty “Sin expediente”: **permitir abrir ServiceCase directo** (selector vertical) |
| D3 | `markWon`: **respetar vertical elegida** (no hardcode CREDIT_REPAIR) |
| D4 | Título tarea lead: **`Contactar a [nombre] nuevo lead`** |
| D5 | Intake visible a **OWNER** y **SPECIALIST** |
| D6 | Investigación documentada en `docs/research/` antes de implementar |

---

## P0

### P0-1 — Respuestas del formulario de intake invisibles

| Campo | Valor |
|-------|--------|
| **Problema** | Tras generar link y que el cliente complete el form, Hugo no ve Q&A en el CRM |
| **Dónde** | Accesos e integraciones solo muestra useCount; `payloadJson` sin reader |
| **Impacto** | No sabe qué quiere el cliente; parece “roto” |
| **Clasificación** | **IMPLEMENTADO PERO POCO VISIBLE** (datos sí se guardan) |
| **Referencia** | Frappe Activities / side panel: datos del registro en ficha |
| **Solución conceptual** | Bloque compacto en Resumen: objetivo, motivo, flags clave, fecha submit, link a docs |
| **Complejidad** | Baja–media (query slim + UI; sin schema) |
| **Decisión** | D1 + D5 |

Archivos: `src/server/intake/index.ts`, `IntakeSubmission`, `client-overview-panel.tsx`, `client-detail-panel.tsx`.

---

### P0-2 — “Sin expediente” sin guía de servicio

| Campo | Valor |
|-------|--------|
| **Problema** | Alta de cliente → empty state; no pregunta qué servicio necesita |
| **Dónde** | `ClientOverviewPanel` cuando `activeService === null` |
| **Impacto** | Confusión: ¿falta algo? ¿qué hacer ahora? |
| **Clasificación** | **PARCIAL** (CreateCase existe; mal contextualizado en Resumen) |
| **Referencia** | Frappe Lead→Deal; ClientFlow add deal from customer |
| **Solución conceptual** | CTA primario: abrir ServiceCase con `listVerticalServiceOptions`; secundario: lead/oportunidad |
| **Complejidad** | Baja (reusar `CreateCaseButton` + verticals en Resumen) |
| **Decisión** | D2 |

Archivos: `client-overview-panel.tsx`, `create-case-button.tsx`, `src/server/services/verticals.ts`.

---

### P0-3 — Tareas de lead poco accionables

| Campo | Valor |
|-------|--------|
| **Problema** | Título genérico / ausente en CRM create; al abrir solo Completar/Cancelar |
| **Dónde** | Dashboard “Para hacer”; `task-detail-panel`; `createLead` sin `onNewLead` |
| **Impacto** | No identifica al cliente ni qué necesita en un vistazo |
| **Clasificación** | **PARCIAL** (automations existen; inconsistentes) |
| **Referencia** | ClientFlow RelatedTasks; títulos con nombre |
| **Solución conceptual** | Título D4; unificar createLead→tarea; detalle con intent/`serviceRequested`/intake summary |
| **Complejidad** | Media |
| **Decisión** | D4 |

Archivos: `src/server/automations/index.ts`, `src/server/opportunities/index.ts`, `src/server/tasks/index.ts`, `task-detail-panel.tsx`, `app/crm/dashboard/page.tsx`.

---

## P1

### P1-1 — markWon siempre CREDIT_REPAIR

| Campo | Valor |
|-------|--------|
| **Problema** | Conversión ignora vertical / `serviceRequested` |
| **Dónde** | `src/server/opportunities/index.ts` `markWon` |
| **Impacto** | Multi-servicio teórico; conversión mono-vertical |
| **Solución** | Pasar `serviceCode` / resolver desde selección UI (D3) |
| **Complejidad** | Media |
| **DB** | No (catálogo Service ya existe) |

### P1-2 — Accesos e integraciones escondidos

| Campo | Valor |
|-------|--------|
| **Problema** | Intake parece secundario; respuestas aún más escondidas |
| **Solución** | Tras D1, el valor está en Resumen; details puede quedar para links/portal/processors |
| **Complejidad** | Baja |

### P1-3 — Intent comercial no llega a ficha operativa

| Campo | Valor |
|-------|--------|
| **Problema** | `serviceRequested` / kanban “Qué quieren” no en tarea ni 360 empty |
| **Solución** | Superficie en empty state + task detail + intake summary |
| **Complejidad** | Baja |

---

## P2

| ID | Problema | Nota |
|----|----------|------|
| P2-1 | Balance a nivel Quote vs ServiceCase | Arquitectura P1; no bloquea Fase A |
| P2-2 | Gauge legacy aún en codebase (no hub) | Limpieza cosmética |
| P2-3 | Mobile progressive disclosure del rail | V2 desktop-first OK |

## P3

| ID | Problema | Nota |
|----|----------|------|
| P3-1 | Docs CURRENT_STATE confunden agentes | Actualizar docs en ticket aparte |
| P3-2 | CredGate/HisaabScore como “inspiración” sin filtro | Ya documentado: no copiar |

---

## Tabla de clicks (estado actual → meta)

| Acción | Clicks hoy | Meta |
|--------|------------|------|
| Abrir cliente | 1 | 1 |
| Ver scores | 0 (V2) | 0 |
| Ver respuestas intake | ∞ (imposible) | 0 en Resumen |
| Abrir primer expediente | 1–2 + ambigüedad | 1 con selector |
| Ver tarea lead “quién” | 0–1 (subtítulo) | 0 (título D4) |
| Entender qué necesita (tarea) | N (navegar a lead/kanban) | 0–1 en detalle |

---

## Clasificación anti-duplicación

| Idea | Estado |
|------|--------|
| Client 360 denso | YA IMPLEMENTADO |
| Peeks / chart / rail | YA IMPLEMENTADO |
| Intake storage | IMPLEMENTADO PERO POCO VISIBLE |
| ServiceCase multi-vertical | PARCIAL (UI conversión) |
| Tareas lead UX | PARCIAL |
| Copiar Frappe Activities | NO RECOMENDADO (AGPL + ya hay ActivityLog) |
| CredGate | NO NECESARIO |
