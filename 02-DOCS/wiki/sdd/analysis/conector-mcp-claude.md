---
type: analysis
title: Analysis — Conector MCP de JH CRM para Claude (tanda 1)
description: Cross-read of constitution, spec, plan and tasks for conector-mcp-claude before implement.
tags: [sdd, analyze, mcp]
timestamp: 2026-11-09T00:00:00Z
topic: sdd
slug: conector-mcp-claude
---

# Analysis — Conector MCP de JH CRM para Claude (tanda 1)

> Inputs: [constitution](../constitution.md) v1.0.0 · [spec](../specs/conector-mcp-claude.md) ·
> [plan + tasks](../plans/conector-mcp-claude.md) · Code checked: `src/server/*`, `src/server/ai/*`,
> `src/server/users/index.ts`, `src/lib/ai/sanitize.ts`.

**GATE: BLOCKED** — 2 HIGH · 6 MEDIUM · 7 LOW · 0 CRITICAL.

## Coverage map

| REQ | Spec requirement (short) | Plan | Tasks | Status |
| --- | --- | --- | --- | --- |
| AC-1 | Sin conexión → no autorizado | §3 authenticate | T004–T012 | covered |
| AC-2 | Conectar en web con MFA | §2 consentimiento | T009, T029 | covered (manual) |
| AC-3 | Solo datos de su organización | §3 callTool | T014, T015 | covered |
| AC-4 | VIEWER lee, no escribe | §3 can() | T013–T022 | covered |
| AC-5 | Todas las secciones (tanda 1: seis) | §3 tabla | T013, T015, T017–T022 | AMBIGUOUS (F6) |
| AC-6 | Sin SSN/ITIN/cuentas/secretos | §0 sanitize | T014, T015 | covered (F12) |
| AC-7 | Pagos/rondas/contratos lógicos | — | — | deferred (tandas 2–3) |
| AC-8 | Actividad **y** auditoría con origen Claude | §3 requestOrigin | T002, T003, T016 | GAP (F1) |
| AC-9 | Revocar corta el acceso | §3, §4 | T006, T007, T010, T011, T023, T024 | covered |
| AC-10 | Org apagada → nada funciona | §3 | T007, T011, T024 | covered |
| AC-11 | Página Configuración | §2 | T025, T028, T029 | covered (manual) |
| AC-12 | Límite de peticiones | §0 120/min | T010, T011 | covered |
| AC-13 | Todos los roles conectan | §3 approve | T006, T007 | covered |
| AC-14 | No caduca, llave interna rota | §0 vida tokens | T004–T007, T026 | covered |
| Goal | Cambios visibles al instante | — | — | GAP (F5) |
| Goal | Confirmación antes de borrar | §3 kind → destructiveHint | — | GAP (F7) |
| Goal | 1–2 pasos para conectar | §0 flag + mcpEnabled off | T025 | AMBIGUOUS (F4) |
| — | Purga de tokens en cron | §4 | T026 | DRIFT (F11, aceptable) |

## Findings

| # | Sev | Type | A (loc) | B (loc) | Conflict | Resolve in |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | HIGH | Gap / contradiction | spec AC-8 | code `src/server/{cases,service-cases,tasks,notes,opportunities,quotes}` | AC-8 pide actividad **y** auditoría por cada cambio. Solo clientes escribe `AuditLog`; las otras cinco secciones solo escriben actividad. El plan (§3) asume que basta con sellar el origen en escrituras que ya existen. | plan + tasks: el despachador escribe una entrada de auditoría por cada herramienta write/destructive (`mcp.tool.<nombre>`, entidad, id); T016 lo comprueba |
| F2 | HIGH | Constitution (regla 5) | constitution §2 regla 5 | plan Tasks T008, T012 (y T009, T025) | Regla 5: todo cambio de comportamiento trae una prueba que falla sin él. T008 (metadatos, registro) y T012 (401 + `WWW-Authenticate`, `initialize`) son tier 2/1 y solo se comprueban con `curl` a mano. Son justo lo que usa claude.ai para conectar. | tasks: smoke que llama a los route handlers con `Request` (metadatos con `S256`, registro rechaza redirect ajeno, 401 con cabecera, `tools/list` con token). T009/T025 (pantallas) pueden quedar con capturas si la dueña lo acepta |
| F3 | MED | Contradiction | spec §Users & context ("decide quién puede conectar") | spec §Clarifications ("todos pueden conectar") | Línea anterior a clarify no actualizada. | clarify (redacción) |
| F4 | MED | Ambiguity | spec §Goals ("1 o 2 pasos") | plan §0 (`mcpEnabled` apagado por defecto) | Antes del primer uso, un admin tiene que encender el conector. La ficha no lo dice y la persona vería "no autorizado" sin saber por qué. | clarify: aceptar el paso previo del admin y que la página explique "pide a tu admin que lo active" |
| F5 | MED | Gap | spec §What result they get ("visibles al instante") | plan §3/§6 | Las actions de la app refrescan pantallas (`revalidatePath`); los servicios no. Ninguna tarea refresca tras una escritura de Claude. | tasks: T017–T022 incluyen el refresco de rutas de su sección |
| F6 | MED | Ambiguity / underestimate | plan §2 ("reutilizando `src/server/ai/queries.ts`") | code `listCrm` entities | `listCrm` cubre clients, cases, payments, tasks, quotes, rounds, receipts: **no oportunidades ni casos de servicio**. No hay detalle por id para tarea, cotización ni oportunidad. T015 es más grande de lo que dice. | plan + tasks: partir T015 (consultas nuevas para oportunidades y detalle por id) |
| F7 | MED | Gap | spec §What the user can do ("antes de borrar pide confirmación") | plan §3 (`destructiveHint`) | Depende de que Claude respete la anotación; ninguna tarea lo comprueba. | tasks: T013 exige `kind: destructive` en archivar/cancelar/perdida; T029 incluye una captura de Claude pidiendo confirmación |
| F8 | MED | Ambiguity | plan §7 decisión abierta 2 | plan T025 | La dirección del conector está escrita a mano y sin confirmar. | plan: derivarla de `NEXT_PUBLIC_APP_URL`; confirmar el dominio antes de T029 |
| F9 | LOW | Wrong assumption | plan §7 ("cambiar contraseña sube sessionVersion") | code `src/server/users/index.ts` | No existe cambio de contraseña del equipo; suben `sessionVersion` el cambio de rol, de correo y la desactivación. Efecto: **cambiar el rol de alguien desconecta su Claude**. | plan (redacción del riesgo); aceptar el efecto o anotarlo en la ficha |
| F10 | LOW | Gap | plan §3 approve (`OrganizationContext`) | tasks T006/T009 | Una sesión del portal de clientes llegando al consentimiento no está probada (debería rechazarse). | tasks: caso en T006 |
| F11 | LOW | Drift | plan §4 purga | spec | Purga de tokens no pedida en la ficha. Mantenimiento técnico razonable; ya existe `app/api/cron/retention`. | aceptar |
| F12 | LOW | Coverage | spec AC-6 (cuentas completas) | tasks T014 | La prueba siembra SSN; no siembra número de cuenta. | tasks: sembrar también cuenta |
| F13 | LOW | Constitution (regla 16) | constitution regla 16 (sin datos en logs) | tasks T011/T012 | Nada comprueba que el endpoint o el SDK no registren los argumentos de las herramientas. | tasks: añadir a T012 |
| F14 | LOW | Stale wording | spec §Cheapest alternative ("posible paso intermedio") | plan | El plan no incluye el token personal. | clarify (redacción) |
| F15 | LOW | Deferred | spec AC-7 | plan Tasks | Sin tarea en la tanda 1, por diseño (pagos, rondas y contratos van después). | aceptar |

## Recommended routing

- **plan + tasks** (antes de implement): F1, F2, F5, F6, F7, F8, y de paso F9, F10, F12, F13.
- **clarify** (redacción de la ficha): F3, F4, F14; decidir si se acepta F9 (cambio de rol desconecta Claude).
- **aceptar**: F11, F15.
- Tras los cambios, volver a pasar `analyze`.

```json result-envelope
{
  "status": "blocked",
  "executive_summary": "Cross-read of spec/plan/tasks against the constitution: 2 HIGH (audit gap for five sections, untested OAuth/MCP HTTP wiring vs rule 5), 6 MEDIUM, 7 LOW.",
  "artifact": "02-DOCS/wiki/sdd/analysis/conector-mcp-claude.md",
  "next_recommended": "plan",
  "risk": "high",
  "skill_resolution": {"used": ["analyze"], "missing": [], "fallback": [], "compact_rules": ["Read adversarially across artifacts, not inside one.", "A finding without a location is an opinion."]},
  "evidence": ["report path exists", "blockers listed with artifact + location", "constitution conflicts named (rule 5, rule 16)"]
}
```
