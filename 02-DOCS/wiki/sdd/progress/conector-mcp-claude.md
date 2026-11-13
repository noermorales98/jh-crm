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

## T004 + T005 — 2026-11-09 (cierre)
- status: complete
- review ronda 2: correctness pass · security pass · tests pass (8 nits) → nits añadidos como casos de prueba (d22ff79)
- panel registrado en d22ff79

## T006 + T007 — 2026-11-09 (cierre)
- status: complete
- review ronda 1: correctness 2 should-fix (refresh con org apagada quemaba la llave y luego cortaba la conexión — fallo real reproducido; canje simultáneo no revocaba) + 2 nits · security 1 should-fix (registro sin límite) + 2 nits · tests 3 should-fix (huecos: canje sin chequeo de uso, refresh con access token, concurrencia)
- fix (e578c16): marca de uso se deshace si la conexión no es utilizable ahora; carrera en canje revoca; relectura de la conexión dentro de la transacción; guardas de tipo; `revokeToken` con updateMany; límite de registro y purga asignados a T008/T026; estado "cortada" a T024
- red→green ronda 2: 5 comprobaciones nuevas fallan con el servicio anterior y pasan con el arreglo
- review ronda 2: correctness pass (2 preguntas → T024, T008) · security pass · tests pass (2 nits → añadidos en eb0a464)
- estabilidad: `mcp-oauth-db.ts` verde 5 de 5 ejecuciones (incluye casos de peticiones simultáneas)

## T031 (OAuth) + T008 — 2026-11-09
- status: complete
- commits: dc9c339, df8c477, 6872145 (base a06c13b)
- red: stub 501 → 28 fallos; green: `mcp-http.ts` OK (95+ comprobaciones); `smoke:auth-paths` OK
- e2e en servidor dev (3999, BD desechable): `/.well-known/*` → 200; registro ajeno → 400; `/oauth/authorize` sin sesión → login con vuelta
- risk: tier 2 (auth) — 3 refuters × 3 rondas
- ronda 1: security 2 should-fix (límite por IP falseable vía X-Forwarded-For; cuerpo por trozos leído entero) · tests 3 should-fix (revocación sin efecto comprobado; flag apagado sin probar en 3 rutas; rewrites y route.ts sin prueba) · correctness pass
- ronda 2: correctness 1 should-fix (el tope global se gastaba con basura) · tests 5 should-fix (casos sin fijar) · security pass
- ronda 3 (6872145): pass × 3; 3 nits de pruebas aceptados (Content-Length exacto, ventana global literal, cabeceras CORS por ruta)
- decisiones: tope global de 100 registros/hora solo para registros válidos; lectura del cuerpo con corte a 16 KB; rewrites para `/.well-known`
- aceptado: cookies de Auth.js en respuestas OAuth anónimas (inofensivo); en despliegues que no sean Vercel la IP es falseable (el tope global acota igual)

## T009 — 2026-11-09
- status: in review (ronda 2)
- commits: 148fa73, 5d63bfc
- e2e: login → consentimiento → Permitir → vuelta con code/state/iss → canje → llaves (captura escritorio y móvil)
- ronda 1: security 1 should-fix (clickjacking) + 1 pregunta (nombre del cliente falseable) · tests 2 should-fix (reglas de redirección de Permitir/Cancelar sin prueba) · correctness pass (3 nits)
- fix: CSP `frame-ancestors 'none'` + `X-Frame-Options: DENY`; fila «Volverá a» con el destino real; solo 7 campos ocultos; decisiones de los botones en `consent.ts` con pruebas contra BD (redirect_uri falsa → vuelve a la pantalla)

## Reanudación — 2026-11-12
- Base desechable recreada (la carpeta temporal anterior ya no existía); migraciones aplicadas y pruebas previas en verde antes de seguir.

## T010 + T011 — 2026-11-12
- status: complete · commits 20cd1f0, 454e54e · tier 1 (1 revisor seguridad)
- red: stubs que lanzan → fallos; green: `mcp-endpoint.ts` OK
- ronda 1: should-fix (un fallo de `lastUsedAt` tras escribir convertía un cambio guardado en error → Claude reintentaría y duplicaría) + nits; ronda 2: pass
- fix: refresco y último uso "mejor esfuerzo"; `ReadTool | WriteTool` obliga a declarar auditoría; errores limpiados; prueba de límite estable

## T012 (+ T031 MCP) — 2026-11-12
- status: complete · commits 847ec56, 9b23b45, 9cad2ec · tier 2 (3 refuters × 3 rondas)
- incumplimiento de orden TDD: el endpoint se escribió antes que sus casos de prueba; se compensó con mutación por los revisores y rojo→verde en las rondas 2 y 3
- ronda 1: correctness 2 should-fix (fechas en un esquema rompían `tools/list` para todas; doble validación SDK+despachador rompía transformaciones) · tests 2 should-fix · security pass
- ronda 2: tests 1 should-fix (aislamiento por IP del límite) · correctness pregunta (claude.ai comparte IP de Anthropic: limitar 401 de llaves caducadas bloquearía renovaciones)
- ronda 3: pass × 3. Diseño final: servidor MCP de bajo nivel, esquema JSON propio (`z.toJSONSchema`), despachador único validador, `tools/list` filtrado por rol, 405 para GET/DELETE, límite solo para llaves inventadas
- e2e en servidor dev: 401 + `WWW-Authenticate`; `initialize` con llave real

## T013–T015 + T032 — 2026-11-12
- status: complete · commits e6d7709, ccd00be, e2285c1 · tier 1 (seguridad, 3 rondas)
- la prueba de lectura encontró un hueco real de AC-6 (cuenta de 16 dígitos en una nota) → `redact.ts` solo del conector
- ronda 1: 3 should-fix (separadores/prefijos, sobre-enmascarado de teléfonos y códigos, SSN con espacios/puntos) + oráculo de búsqueda + nombres de documentos muy sensibles; ronda 2: should-fix (buscar rechazaba teléfonos con prefijo); ronda 3: pass
- decisión: `buscar` rechaza 9 o ≥13 dígitos; riesgo residual aceptado: 11–12 dígitos se pueden buscar (la salida sigue tapada)

## T016–T022 — 2026-11-12
- status: complete · commits 4b619c2…cdc01a1, 8bf6d64 · 6 desarrolladores en paralelo (`developer`), mismo checkout, sin commits propios
- cada sección: prueba roja (herramienta no encontrada) → verde; esquemas movidos de `"use server"` a `src/lib/validation/` sin cambiar las actions (revisado byte a byte)
- ronda 1 (correctness): 6 should-fix → `editar_lead` borraba lo no enviado (ahora fusiona); `crear_oportunidad` aceptaba WON/LOST; 4 descripciones prometían deshacer; `editar_cliente` con responsable vacío lo quitaba; `cambiar_estado_caso_servicio` ahora destructiva; aviso de mensaje real en `marcar_cotizacion_enviada`
- ronda 2: pass (nit aceptado: `editar_lead` sin origen toma el de la oportunidad)
- pruebas de sección ajenas que fallan con la BD desechable (`sc-00x`, `mark-won-br012`, `ai-fase8-tasks`, `client-merge`): no están en `ci:qa` y dependen de datos de la org de smoke; no se tocaron

## T023–T026 — 2026-11-12
- T023/T024 complete · 595c9d1 · `mcp-connections.ts` rojo (stub) → verde
- T025 in review (ronda 2) · da14d53, 9a1ecaa · capturas: escritorio, móvil 375 px sin scroll horizontal, apagar con confirmación, «Cortada» con motivo, cortar acceso
- T026 complete · 45f3fb0 · `mcp-purge.ts` rojo → verde; integrado en `cron/retention` en bloque aparte
- aceptado: N+1 en el listado de conexiones y tope de 200 (organización pequeña)

## T027 + T028 — 2026-11-12
- T027 · 4155847 · `smoke:mcp-db` (13 pruebas con BD) en el job de MySQL desechable; `auth-paths`, `login-redirect`, `mcp-oauth-core`, `mcp-tool-registry` en `ci:qa`
- T028 · 5c16040 · `02-DOCS/wiki/guias/conectar-claude.md` + sección en `docs/07-SECURITY.md`

## Pendiente
- T029: prueba real con claude.ai — necesita un despliegue con URL pública (preview de Vercel) y tu cuenta de Claude.
- T030: cierre (verify + revisión de cierre de toda la rama + PR) — necesita tu sí (regla 13).

## Decision queue
- **blocking** · T001 · tier 2 · Unir la migración del conector requiere tu sí (regla 13). Opciones: aprobar en el PR / pedir cambios. Recomendación: aprobar; 3 revisores sin bloqueos. Evidencia: entrada T001.
- **blocking** · T005, T007 · tier 2 · El núcleo y el servicio OAuth tocan el inicio de sesión: necesitan tu sí en el PR (regla 13).
- **blocking** · T008, T009 · tier 2 · Direcciones públicas OAuth, login y pantalla de consentimiento: necesitan tu sí en el PR (regla 13).

## Pausa — 2026-11-09 (límite de uso)
- T009: ronda 2 → security pass · correctness pass · tests 1 should-fix (state en Permitir) → añadido y verde; falta registrar el panel (`rsc review ledger panel conector-mcp-claude/T009`)
- T010: en curso, sin commit. `scripts/smoke/mcp-endpoint.ts` escrita y en rojo (stubs en `src/server/mcp/dispatch.ts` y `src/server/mcp/tools/types.ts`). Siguiente: implementar `authenticate` y `callTool` (T011).
- `@modelcontextprotocol/sdk@1.32.2` instalado (package.json y lock modificados, sin commit) para T012.
- Servidor dev en 3999 y MySQL desechable en 3399 pueden seguir encendidos; `.claude/launch.json` sin commit (solo local).
- **blocking** · T012 · tier 2 · Endpoint MCP y dependencia nueva `@modelcontextprotocol/sdk@1.32.2`: necesitan tu sí en el PR (regla 13).
- **review-after** · T015 · Riesgo aceptado: `buscar` permite números de 10–12 dígitos (teléfonos con prefijo); una cuenta de 11–12 dígitos podría confirmarse por coincidencia, aunque nunca se muestra.
