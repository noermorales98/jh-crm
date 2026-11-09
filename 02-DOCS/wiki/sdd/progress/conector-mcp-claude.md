---
type: progress
title: Progress — Conector MCP de JH CRM para Claude (tanda 1)
description: Append-only implement ledger for conector-mcp-claude, batch 1.
tags: [sdd, progress, mcp]
timestamp: 2026-11-09T00:00:00Z
topic: sdd
slug: conector-mcp-claude
branch: feat/conector-mcp-claude
---

# Progress — conector-mcp-claude (tanda 1)

> Spec: [../specs/conector-mcp-claude.md](../specs/conector-mcp-claude.md) ·
> Plan: [../plans/conector-mcp-claude.md](../plans/conector-mcp-claude.md) · Append-only.
> Base de pruebas: MySQL desechable local `jh_gates` en 127.0.0.1:3399 (datos en el scratchpad de la sesión).

## T001 — 2026-11-09
- status: complete
- commit: d15e910 (base a14dab4)
- red: `SHOW TABLES LIKE 'Mcp%'` vacío y sin columna `mcpEnabled` en `jh_gates`
- green: `prisma migrate deploy` aplica `20261109120000_mcp_connector`; segunda vez "No pending migrations"; 4 tablas y la columna existen; `prisma migrate diff` vacío
- files: prisma/schema.prisma (+86, sin reformatear), prisma/migrations/20261109120000_mcp_connector/migration.sql
- risk: tier 2 (database) — 3 refuters
- review: correctness pass · security pass · tests pass (2 nits) → 0 blockers; nit de redacción del done-check corregido en el plan; nit "BD con filas" aceptado (MySQL rellena el DEFAULT)
- controls: tests ✅ build/typecheck ✅ lint (proyecto) ✅ security ✅ traceability ✅ (AC1, AC9, AC10)
- notas para T008: limitar y acotar el registro dinámico (nº, longitud y esquema de `redirect_uris`); comparar hashes en minúsculas
- nota: `npm run lint` del repo da 33 errores, todos en `.rsc/backups/` (copias locales de rsc, fuera de git); `eslint app src scripts` sale 0

## T002 + T003 — 2026-11-09
- status: in review
- commit: 7641edb (base d15e910)
- red: `mcp-request-origin.ts` con módulo stub → 5 comprobaciones de origen fallan (por aserción)
- green: las 10 comprobaciones pasan; `smoke:contract-gates-db` sigue OK
- files: src/server/request-origin.ts, src/server/audit/index.ts, src/server/activity/index.ts, scripts/smoke/mcp-request-origin.ts
- risk: `rsc risk --base d15e910` da tier 2 solo por archivos sin commit de la actualización de rsc (`.claude/rsc-bootstrap.mjs`, `.rsc.json`, `.gitignore`), ajenos a la tarea; sobre los archivos del commit, tier 1 → 1 revisor
- controls: tests ✅ typecheck ✅ lint ✅ traceability ✅ (AC8)

## T002 + T003 — 2026-11-09 (cierre)
- status: complete
- review: ronda 1 → 1 should-fix (faltaba probar que la metadata no pisa el origen) + 3 nits + 1 pregunta; ronda 2 (18bd31f) → pass, 2 nits aceptados
- fix (clase "procedencia falsificable"): fuera del conector se quitan `via`/`connectionId`; dentro, el origen siempre gana; prueba con try/finally; nombres reales en el plan
- red→green ronda 2: con el código anterior fallan 2 comprobaciones nuevas; con el arreglo, 16/16
- verificado: `clients/merge.ts` solo re-apunta `clientId` en actividad, no escribe metadata

## T004 + T005 — 2026-11-09
- status: in review (ronda 2)
- commits: f7fa73e, c5a5977 (base 18bd31f)
- red: stub → 12 fallos por aserción; green: `mcp-oauth-core.ts` OK
- risk: tier 2 (auth) — 3 refuters
- review ronda 1: correctness pass (1 nit) · security 1 should-fix + 2 nits · tests 1 should-fix + 1 nit
- fix (clase "lo validado ≠ lo guardado"): `isAllowedRedirectUri` exige forma canónica (`url.href === uri`), sin `#`, puerto ≠ 0; prueba fija límites PKCE con su propio challenge, longitud exacta del token, `www.claude.ai`, frontera 2048
- red→green ronda 2: 8 comprobaciones nuevas fallan con el código anterior y pasan con el arreglo
- review ronda 2: correctness pass · security pass · tests (pendiente)

## T006 + T007 — 2026-11-09
- status: in review
- commit: 1935294 (base c5a5977)
- red: stub que lanza → 20 fallos; green: `mcp-oauth-db.ts` 48 comprobaciones OK; limpieza verificada (0 filas de prueba restantes)
- incluye la nota de seguridad de T001: registro dinámico acotado (≤ 5 redirect_uris canónicas, nombre ≤ 200)
- risk: tier 2 (auth) — 3 refuters
- controls: tests ✅ typecheck ✅ lint ✅ traceability ✅ (AC9, AC10, AC13, AC14)

## Decision queue
- **blocking** · T001 · tier 2 · Unir la migración del conector requiere tu sí (regla 13). Opciones: aprobar en el PR / pedir cambios. Recomendación: aprobar; 3 revisores sin bloqueos. Evidencia: entrada T001.
- **blocking** · T005, T007 · tier 2 · El núcleo y el servicio OAuth tocan el inicio de sesión: necesitan tu sí en el PR (regla 13).
