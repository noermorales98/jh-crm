---
type: analysis
title: Analysis — Conector MCP de JH CRM para Claude (tanda 1)
description: Cross-read of constitution, spec, plan and tasks for conector-mcp-claude before implement (re-run after fixes).
tags: [sdd, analyze, mcp]
timestamp: 2026-11-09T00:00:00Z
topic: sdd
slug: conector-mcp-claude
run: 2
---

# Analysis — Conector MCP de JH CRM para Claude (tanda 1)

> Inputs: [constitution](../constitution.md) v1.0.0 · [spec](../specs/conector-mcp-claude.md) ·
> [plan + tasks](../plans/conector-mcp-claude.md) (T001–T032) · Code checked: `src/server/*`,
> `src/server/ai/*`, `src/server/users/index.ts`, `src/lib/ai/sanitize.ts`.
> Run 2 — tras corregir los hallazgos de la run 1 (2 HIGH, 6 MEDIUM, 7 LOW).

**GATE: PASS** — 0 CRITICAL · 0 HIGH · 0 MEDIUM · 4 LOW (aceptados o para vigilar en `implement`).

## Coverage map

| REQ | Spec requirement (short) | Plan | Tasks | Status |
| --- | --- | --- | --- | --- |
| AC-1 | Sin conexión → no autorizado | §3 authenticate | T004–T012, T031 | covered |
| AC-2 | Conectar en web con MFA | §2 consentimiento | T008, T009, T029, T031 | covered (manual + smoke HTTP) |
| AC-3 | Solo datos de su organización | §3 callTool, §0 lectura | T014, T015, T032 | covered |
| AC-4 | VIEWER lee, no escribe | §3 can() | T013–T022 | covered |
| AC-5 | Secciones de la tanda 1 | §2 lectura, §3 tabla | T013, T015, T017–T022, T032 | covered |
| AC-6 | Sin SSN/ITIN/cuentas/secretos | §0 sanitize, logs | T012, T014, T015 | covered |
| AC-7 | Pagos/rondas/contratos lógicos | — | — | deferred (tandas 2–3) |
| AC-8 | Actividad y auditoría con origen Claude | §0 auditoría, §3 callTool | T002, T003, T010, T011, T013, T016, T029 | covered |
| AC-9 | Revocar corta el acceso | §3, §4 | T006, T007, T010, T011, T023, T024, T029 | covered |
| AC-10 | Org apagada → nada funciona | §3 | T007, T011, T024 | covered |
| AC-11 | Página Configuración (incl. aviso de apagado) | §2, §0 dirección | T025, T028, T029 | covered (capturas) |
| AC-12 | Límite de peticiones | §0 120/min | T010, T011 | covered |
| AC-13 | Todos los roles conectan | §3 approve | T006, T007 | covered |
| AC-14 | No caduca, llave interna rota | §0 vida tokens | T004–T007, T026 | covered |
| Goal | Cambios visibles al instante | §0 refresco | T013, T017–T022, T029 | covered |
| Goal | Confirmación antes de borrar | §3 `destructive` | T013, T029 | covered |
| Goal | 1–2 pasos (tras encendido del admin) | §4 paso 0 | T024, T025 | covered |
| — | Purga de tokens en cron | §4 | T026 | DRIFT aceptado (mantenimiento) |

## Run 1 findings — status

| # | Run 1 | Status | Where it was resolved |
| --- | --- | --- | --- |
| F1 | HIGH auditoría en cinco secciones | resolved | plan §0 Auditoría, §3 callTool; T010, T011, T013, T016 |
| F2 | HIGH conexión HTTP sin prueba automática | resolved | T031 nueva; T008, T012 dependen de ella; pantallas con capturas y lógica en smoke |
| F3 | MED "la dueña decide quién conecta" | resolved | spec §Users & context |
| F4 | MED paso previo del admin | resolved | spec §Goals, AC-11, clarifications; plan §4 paso 0; T025 |
| F5 | MED refresco de pantallas | resolved | plan §0 Refresco; T013, T017–T022 |
| F6 | MED consultas de lectura que faltan | resolved | plan §2; T032 nueva; T015 depende de ella |
| F7 | MED confirmación antes de borrar | resolved | plan §3; T013, T029 |
| F8 | MED dominio escrito a mano | resolved | plan §0 Dirección pública; spec clarifications; T025, T029 |
| F9 | LOW supuesto de contraseña | resolved | plan §7; spec clarifications (cambio de rol desconecta, aceptado) |
| F10 | LOW sesión del portal | resolved | T006, T007 |
| F11 | LOW purga no pedida | accepted | — |
| F12 | LOW número de cuenta | resolved | T014 |
| F13 | LOW logs | resolved | plan §0 Logs; T012 |
| F14 | LOW redacción "paso intermedio" | resolved | spec §Cheapest alternative |
| F15 | LOW AC-7 diferido | accepted | — |

## New findings (run 2)

| # | Sev | Type | A (loc) | B (loc) | Conflict | Resolve in |
| --- | --- | --- | --- | --- | --- | --- |
| N1 | LOW | Duplication | plan §0 Auditoría | code `src/server/clients` (ya audita) | En clientes habrá dos entradas de auditoría por cambio: la del servicio y `mcp.tool.*`. Inofensivo; se lee como "qué hizo" + "por qué canal". | aceptar, o en T017 omitir la del despachador si el servicio ya audita |
| N2 | LOW | Constitution (regla 5) | constitution regla 5 | T009, T025 | Las dos pantallas se prueban con capturas; su lógica sí tiene smoke. Aceptado con la regla 7 (evidencia). | aceptar |
| N3 | LOW | Ordering | T029 | plan §7 decisión 2 | La prueba real necesita el dominio confirmado y un preview accesible (Vercel Authentication). | `implement`: resolver antes de T029 |
| N4 | LOW | Process | `rsc risk` (tier 2) | spec frontmatter | El spec aún no tiene `branch:`; `rsc spec gate` lo exige antes de subir la rama. | `implement`: añadirlo al crear la rama |

## Recommended routing

Nada bloquea. Pasar a **`implement`**: primero crear la rama de la tanda 1 (área delicada, regla 13)
y añadir `branch:` al spec (N4); después T001.

```json result-envelope
{
  "status": "complete",
  "executive_summary": "Re-run after fixes: all run-1 HIGH/MEDIUM findings resolved; 4 LOW accepted or deferred to implement. Gate passes.",
  "artifact": "02-DOCS/wiki/sdd/analysis/conector-mcp-claude.md",
  "next_recommended": "implement",
  "risk": "medium",
  "skill_resolution": {"used": ["analyze"], "missing": [], "fallback": [], "compact_rules": ["Read adversarially across artifacts, not inside one.", "A finding without a location is an opinion."]},
  "evidence": ["report path exists", "run-1 findings traced to their fix locations", "dependency graph T001–T032 acyclic"]
}
```
