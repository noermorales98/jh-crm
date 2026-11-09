---
type: plan
title: Plan — Conector MCP de JH CRM para Claude (tanda 1)
description: The structure-level implementation plan for the MCP connector, batch 1 — OAuth, MCP endpoint, tools for six sections, settings page.
tags: [sdd, plan, mcp, oauth, ai]
timestamp: 2026-11-09T00:00:00Z
topic: sdd
slug: conector-mcp-claude
status: draft
---

# Plan — Conector MCP de JH CRM para Claude (tanda 1)

> Spec: [../specs/conector-mcp-claude.md](../specs/conector-mcp-claude.md) · Constitution: [../constitution.md](../constitution.md) · Status: draft
> Last updated: 2026-11-09 · Cubre la **tanda 1**. Las tandas 2 y 3 actualizarán este mismo plan.

## 0. Global Constraints

- **Stack:** TypeScript strict, Node 22, Next.js 16 App Router, React 19, Prisma + MySQL, Auth.js v5,
  Tailwind 4, npm. Leer `node_modules/next/dist/docs/` antes de usar una API de Next.
- **Organización y permisos:** los deriva el servidor, nunca el input. Toda consulta filtra por
  `organizationId`. Todo permiso pasa por `can(role, action)` de `src/server/auth/permissions.ts`.
- **Reutilizar, no duplicar:** cada herramienta de escritura llama a los servicios de `src/server/*`
  y a los esquemas zod de `src/lib/validation/*`. Ninguna herramienta escribe con Prisma directamente
  (salvo las tablas propias del conector y la auditoría del despachador). La lectura reutiliza
  `src/server/ai/queries.ts` y añade en `src/server/mcp/queries.ts` las consultas que falten, con
  filtro por `organizationId` y comprobación de `*.view`.
- **Auditoría:** cada llamada a una herramienta `write` o `destructive` que termina bien deja una
  entrada `AuditLog` con `action: "mcp.tool.<nombre>"`, `entityType`, `entityId` y
  `metadata: { via: "claude", connectionId }`. Sin argumentos ni datos personales en `metadata`.
- **Refresco:** tras una escritura, el despachador refresca las rutas de la sección con
  `revalidatePath`, las mismas que refresca la action equivalente de `src/actions/<sección>.ts`.
- **Dirección pública:** toda URL absoluta (issuer, metadatos, dirección mostrada en Configuración)
  sale de `NEXT_PUBLIC_APP_URL`. Nunca un dominio escrito a mano.
- **Logs:** el endpoint MCP y el servidor OAuth nunca registran argumentos, salidas, tokens, códigos
  ni `code_verifier`. Solo nombre de herramienta, resultado (ok/código de error) y duración.
- **Datos sensibles:** toda salida de herramienta pasa por `sanitizeForAI` (`src/lib/ai/sanitize.ts`).
  Ninguna herramienta lee ni escribe `ClientSensitiveProfile` ni descifra SSN/ITIN. Nada de datos
  personales en logs, fixtures ni evidencias.
- **Borrar = lo que hace la app:** clientes → archivar; tareas → cancelar; cotizaciones → cancelar;
  oportunidades → marcar perdida. Notas y casos no tienen borrado. Nunca `DELETE` físico.
- **Secretos:** tokens opacos de ≥ 32 bytes (`generateToken`), guardados solo como hash SHA-256.
  Comparación en tiempo constante. Ningún token en logs ni en URLs salvo el `code` de OAuth.
- **Vida de tokens:** access token 1 h; refresh token sin caducidad, **rotado en cada uso**; reusar un
  refresh token ya usado revoca la conexión entera. Authorization code: 10 min, un solo uso.
- **OAuth:** OAuth 2.1 con PKCE `S256` obligatorio; `plain` rechazado.
- **Errores al modelo:** mensajes en español y sin trazas: "No autorizado", "Sin permiso",
  "No encontrado", "Demasiadas peticiones", o el mensaje de la regla de negocio.
- **Límite de peticiones:** 120 llamadas a herramientas por conexión y minuto (`assertRateLimit`).
- **Flag:** `FEATURE_MCP_CONNECTOR=true` activa el endpoint; además, cada organización lo enciende en
  Configuración (`mcpEnabled`, por defecto **apagado**).
- **Migración:** solo aditiva (tablas y columnas nuevas, sin tocar datos existentes).
- **Commits:** gitmoji + frase en inglés en imperativo. Sin `Co-Authored-By` de IA ni "Generated with".
- **UI:** en español; carga, vacío y error; funciona en móvil.
- **Pruebas:** `scripts/smoke/*.ts` con tsx; las de base de datos corren en CI contra MySQL desechable.

## 1. Context & constraints

- Criterios que dan forma al diseño: spec AC-1, AC-3, AC-4 (frontera de auth y permisos), AC-6
  (limpieza), AC-8 (origen "Claude"), AC-9/AC-10/AC-14 (revocación y llaves), AC-13 (todos los roles).
- Constitución en juego: reglas 9, 10, 13 (área delicada: auth → PR + 3 revisores + sí de la dueña),
  16, 17, 18 (migración aditiva tras flag).
- claude.ai exige un conector remoto por HTTPS con OAuth: descubrimiento por metadatos estándar,
  registro dinámico de clientes y PKCE.
- La sesión actual del CRM es JWT de Auth.js con MFA en el login y `sessionVersion` para invalidar.
  El consentimiento OAuth se apoya en esa sesión, así que el MFA se respeta sin código nuevo.
- Fuera de alcance (spec): portal del cliente, datos sensibles, cobros, usuarios/roles/MFA, botón en
  el CRM, secciones de las tandas 2 y 3.

## 2. Architecture

```text
 Claude (claude.ai / Desktop / móvil)            EXTERNAL
   │  1. descubre metadatos      3. llama herramientas (Bearer access token)
   ▼                               ▼
 [ Metadatos OAuth ]          [ Endpoint MCP  /api/mcp ]  ──► [ Rate limit (MySQL) ]
   │                               │ valida token → contexto
   ▼                               ▼
 [ Servidor OAuth ]           [ Registro de herramientas ]
  registro · authorize ·          │ permiso + esquema zod por herramienta
  token · revoke                  ▼
   │  2. pantalla de           [ Servicios src/server/* ]  ──► MySQL (Prisma)
   │     consentimiento            │
   ▼     (sesión CRM + MFA)        ▼
 [ Tablas del conector ]      [ Actividad / Auditoría ]  ◄── origen "claude" (contexto de petición)
                                   │
                              [ sanitizeForAI ] ──► respuesta a Claude
 [ Página Configuración → Claude ]  (dirección, copiar, conexiones, revocar, interruptor admin)
```

- **Metadatos OAuth** (internal) — publica dónde está el servidor de autorización y qué soporta.
- **Servidor OAuth** (internal) — registra clientes, emite códigos con PKCE, cambia códigos y refresh
  tokens por access tokens, rota y revoca.
- **Pantalla de consentimiento** (internal) — página del CRM: exige sesión del CRM (y por tanto MFA),
  muestra qué pide Claude y crea la conexión al aceptar.
- **Endpoint MCP** (internal) — recibe las llamadas de Claude, valida el token, comprueba flag, estado
  de la organización y del usuario, aplica el límite y despacha la herramienta.
- **Registro de herramientas** (internal) — lista declarativa: nombre, descripción, esquema, permiso,
  tipo (lectura/escritura/destructiva) y función que llama al servicio.
- **Contexto de petición** (internal) — marca "esta petición viene de Claude" para que actividad y
  auditoría lo registren sin cambiar la firma de cada servicio.
- **Página de Configuración** (internal) — dirección del conector, instrucciones, conexiones propias
  (y de la organización para admin), revocar, interruptor de la organización.
- **Claude** (external) — cliente OAuth y MCP.

**Decisión principal: servidor OAuth propio dentro del CRM, no un proveedor externo.**
Alternativa: un proveedor de identidad externo (Auth0, Clerk, WorkOS). Daría el OAuth hecho, pero
obliga a mover o duplicar el login, el MFA y los roles, que hoy viven en el CRM (Auth.js + Prisma),
y añade un proveedor nuevo al stack fijo (regla 2: enmienda MAJOR). El servidor propio reutiliza la
sesión, el MFA y `sessionVersion` tal cual, y su superficie es pequeña (cuatro operaciones).
**Recomendación: propio**, con PKCE obligatorio, tokens hasheados y pruebas de cada rechazo.

**Segunda decisión: herramientas de lectura genéricas y de escritura específicas.**
Lectura: tres herramientas (`listar`, `ver`, `buscar`) con un parámetro de sección, reutilizando
`src/server/ai/queries.ts` (`listCrm`, `searchCrm`, `getClientBrief`, `getCaseBrief`). Faltan y se
añaden: lista de oportunidades y de casos de servicio, y detalle por id de tarea, cotización y
oportunidad (`listCrm` hoy solo cubre clients, cases, payments, tasks, quotes, rounds, receipts).
Escritura: una herramienta por acción (p. ej. `crear_tarea`), con su
esquema zod de la app. Motivo: tras las tres tandas habría 80+ herramientas si todo fuese específico,
y Claude elige peor entre tantas; las escrituras sí necesitan esquemas exactos y su propio permiso.

## 3. Interfaces & contracts

```text
oauth.metadata() -> { issuer, authorization_endpoint, token_endpoint, registration_endpoint,
                      revocation_endpoint, code_challenge_methods_supported: ["S256"],
                      grant_types_supported: ["authorization_code","refresh_token"] }
mcp.protectedResourceMetadata() -> { resource: <URL MCP>, authorization_servers: [<issuer>] }

oauth.registerClient({ client_name, redirect_uris[] }) -> { client_id } | InvalidRedirectUri
  - redirect_uris: solo https://claude.ai/…, https://claude.com/… o loopback http://localhost:<puerto>/…
  - cliente público (sin secreto)

oauth.authorize(req: { client_id, redirect_uri, code_challenge, code_challenge_method, state, scope? })
    -> ConsentPage | RedirectToLogin | Error(invalid_request|unauthorized_client)
  - redirect_uri debe coincidir exactamente con uno registrado
  - sin sesión CRM → /login y vuelta; con sesión → pantalla de consentimiento
oauth.approve(ctx: OrganizationContext, req) -> redirect(redirect_uri?code&state) | OrgDisabled
  - crea Conexión (userId, organizationId, clientId) y un código de un uso, 10 min
oauth.deny(req) -> redirect(redirect_uri?error=access_denied&state)

oauth.token({ grant_type: "authorization_code", code, code_verifier, client_id, redirect_uri })
    -> { access_token, refresh_token, token_type: "Bearer", expires_in: 3600 } | invalid_grant
  - código de un solo uso; segundo uso → invalid_grant y revoca lo emitido con él
  - SHA256(code_verifier) == code_challenge
oauth.token({ grant_type: "refresh_token", refresh_token, client_id }) -> tokens nuevos | invalid_grant
  - rota: el refresh anterior queda usado; reutilizarlo → revoca la conexión entera
oauth.revoke(token) -> 200 siempre (RFC 7009)

mcp.authenticate(bearer) -> McpContext | Unauthorized
  McpContext = OrganizationContext & { connectionId }
  - token existe, no caducado, conexión no revocada, FEATURE_MCP_CONNECTOR on,
    organización con mcpEnabled, usuario activo, miembro de la org, sessionVersion igual al de la
    conexión; rol leído en cada petición (no copiado en el token)
  - 401 con cabecera WWW-Authenticate que apunta a los metadatos del recurso

mcp.callTool(ctx: McpContext, name, args) -> Result | Forbidden | NotFound | Validation | RateLimited | BusinessRule
  - orden: rate limit → can(role, tool.permission) → zod.parse(args) → servicio → [write/destructive:
    AuditLog mcp.tool.<nombre> + revalidatePath(tool.revalidate(result))] → sanitizeForAI
  - corre dentro del contexto de petición { via: "claude", connectionId }
  - actualiza connection.lastUsedAt (como mucho una vez por minuto)
  - no registra argumentos ni salidas en logs

Tool = { name, title, description, inputSchema, permission: PermissionAction,
         kind: "read" | "write" | "destructive", run(ctx, input),
         audit?: (input, result) -> { entityType, entityId },     // obligatorio si kind ≠ read
         revalidate?: (result) -> string[] }                       // obligatorio si kind ≠ read
  - kind → anotaciones MCP readOnlyHint / destructiveHint (Claude pide confirmación en destructivas)
  - archivar_cliente, cancelar_tarea, cancelar_cotizacion y marcar_perdida son `destructive`
  - listar/ver/buscar solo exponen secciones cuyo permiso *.view tiene el rol

runWithRequestOrigin({ via, connectionId }, fn); currentRequestOrigin() -> { via?, connectionId? }
  (src/server/request-origin.ts; withRequestOrigin(metadata) sella o quita via/connectionId)
  - writeAuditLog y el escritor de actividad añaden metadata.via y metadata.connectionId si existen

connections.listMine(ctx) / connections.listOrg(ctx: settings.manage) / connections.revoke(ctx, id)
organization.setMcpEnabled(ctx: settings.manage, enabled: boolean)
```

**Herramientas de la tanda 1**

| Sección | Lectura | Escritura | Destructiva (como la app) |
| --- | --- | --- | --- |
| Clientes | listar/ver/buscar | crear_cliente, editar_cliente, asignar_cliente | archivar_cliente |
| Casos (crédito y servicio) | listar/ver/buscar | crear_caso, editar_caso, mover_caso_etapa, pausar/completar/reabrir_caso, fijar_proxima_accion | — |
| Tareas | listar/ver/buscar | crear_tarea, editar_tarea, completar_tarea, reasignar_tarea | cancelar_tarea |
| Notas | ver (en cliente/caso) | agregar_nota (cliente o caso) | — |
| Oportunidades | listar/ver/buscar | crear_lead, editar_lead, crear_oportunidad, mover_oportunidad_etapa, marcar_ganada | marcar_perdida |
| Cotizaciones | listar/ver/buscar | crear_cotizacion, editar_cotizacion, marcar_enviada/aceptada/rechazada | cancelar_cotizacion |

Quedan fuera en la tanda 1: importar CSV, fusionar clientes, perfil sensible, enlaces de pago.

## 4. Data model & flow

**Entidades nuevas** (migración aditiva)

- **McpClient** — clientId, nombre, redirectUris (JSON), createdAt. Clientes registrados por Claude.
- **McpConnection** — id, organizationId, userId, clientId, sessionVersion (al crear), createdAt,
  lastUsedAt, revokedAt, revokedByUserId. Es la "conexión activa" que ve la persona.
- **McpAuthCode** — hash del código, connectionId, codeChallenge, redirectUri, expiresAt, usedAt.
- **McpToken** — hash, connectionId, kind (access|refresh), expiresAt (null en refresh), usedAt
  (refresh rotado), createdAt. Índice único por hash.
- **OrganizationSettings.mcpEnabled** — boolean, por defecto false.

**Flujo principal** (una persona conecta Claude y crea una tarea)

0. (Una vez por organización) un administrador enciende el conector en Configuración → Claude.
1. Pega `<NEXT_PUBLIC_APP_URL>/api/mcp` (copiado de Configuración) en Claude → Claude recibe 401 y lee los metadatos.
2. Claude se registra (McpClient) y abre `/oauth/authorize` con PKCE.
3. Sin sesión → login del CRM (con MFA) → vuelve a la pantalla de consentimiento → "Permitir".
4. Se crea McpConnection y un McpAuthCode → redirección a Claude con el código.
5. Claude cambia el código por access + refresh token (McpToken, solo hashes).
6. "Crea una tarea para llamar a Ana mañana": Claude llama `crear_tarea` con Bearer.
7. Endpoint autentica → rate limit → `tasks.manage` → zod → servicio de tareas en contexto
   `via: "claude"` → actividad y auditoría con origen → `sanitizeForAI` → respuesta con enlace.
8. A la hora, Claude rota el refresh token sin que la persona note nada.

- Consistencia: cambio de código por tokens y rotación de refresh, en una transacción cada uno.
- Revocar conexión: marca revokedAt; la siguiente petición falla porque la autenticación lo comprueba
  (no hay caché de tokens).
- Limpieza: tokens de acceso caducados y códigos usados se borran en el cron existente (datos técnicos,
  no de negocio; regla 17 no aplica).

## 5. Testing strategy

| Criterio | Nivel | Asserts | Fakes |
| --- | --- | --- | --- |
| AC-1 | integración (DB) | sin token, token falso, caducado → Unauthorized, sin datos | nada |
| AC-2 | e2e manual | conectar desde claude.ai en preview con usuario con MFA | — (captura como evidencia) |
| AC-3 | integración (DB) | `ver` con id de otra org → "No encontrado"; listar no mezcla orgs | dos orgs sembradas |
| AC-4 | integración (DB) | VIEWER: lectura ok; cada herramienta write/destructive → "Sin permiso" | nada |
| AC-5 (tanda 1) | unidad | cada sección de la tanda tiene lectura; cada acción de la app listada tiene herramienta con el mismo permiso que su action | registro estático |
| AC-6 | unidad + integración | salida de cada herramienta de lectura sin patrones SSN/ITIN/cuenta; cliente con SSN sembrado | datos sintéticos |
| AC-7 | n/a en tanda 1 | (pagos, rondas, contratos llegan en tandas 2 y 3) | — |
| AC-8 | integración (DB) | cada herramienta write/destructive de las seis secciones deja AuditLog `mcp.tool.<nombre>` con via="claude"; la actividad que ya escribía el servicio lleva metadata.via="claude" | nada |
| Goal "al instante" | unidad | cada herramienta write/destructive declara `revalidate` con las rutas de su action | registro estático |
| Goal "confirmar borrado" | unidad + e2e manual | herramientas de borrado marcadas `destructive`; captura de Claude pidiendo confirmación | — |
| OAuth/MCP HTTP | integración (DB) | llamando a los route handlers con `Request`: metadatos con `S256` y URLs de `NEXT_PUBLIC_APP_URL`; registro rechaza redirect ajeno; token con PKCE malo → `invalid_grant`; `/api/mcp` sin Bearer → 401 + `WWW-Authenticate`; con token → `initialize` y `tools/list` | nada |
| AC-9 | integración (DB) | revocar → siguiente llamada Unauthorized; refresh reutilizado → conexión revocada | nada |
| AC-10 | integración (DB) | mcpEnabled=false → Unauthorized para todas las conexiones de la org | nada |
| AC-11 | e2e manual | página en móvil y escritorio: carga, vacío, error, copiar | — (capturas) |
| AC-12 | integración (DB) | llamada 121 en un minuto → "Demasiadas peticiones", sin escritura | ventana corta en test |
| AC-13 | integración (DB) | los cinco roles completan approve y obtienen tokens | nada |
| AC-14 | unidad + integración | refresh sin caducidad rota; access caduca a 1 h (reloj inyectado) | reloj |
| OAuth | unidad | PKCE S256 ok/fallo, `plain` rechazado, redirect_uri no permitido, código reusado | nada |

- Línea e2e: solo la conexión real con claude.ai y las dos pantallas (consentimiento y Configuración),
  con capturas como evidencia (regla 7); su lógica (approve/deny, conexiones, interruptor) sí tiene
  smoke. Todo lo demás se prueba contra MySQL real, llamando a los módulos o a los route handlers.
- Debe ser real: MySQL (permisos, org y auditoría dependen de consultas reales). Nunca se simula
  `can()` ni los servicios.
- Cada prueba nueva falla sin el cambio y pasa con él (regla 5).

## 6. Sequencing & dependencies

1. Flag, migración aditiva y modelos del conector — depende de: nada — serial
2. Contexto de petición y origen en actividad/auditoría — depende de: nada — paralelizable con 3
3. Servidor OAuth (registro, códigos, PKCE, token, rotación, revocación) + pruebas unidad/DB — depende de: 1
4. Endpoints públicos OAuth, metadatos, pantalla de consentimiento y rutas públicas en `proxy.ts` — depende de: 3
5. Endpoint MCP: autenticación, flag/org/usuario, rate limit, despacho — depende de: 1, 2
6. Registro de herramientas + lectura genérica (listar/ver/buscar) + limpieza — depende de: 5
7. Herramientas de escritura de las seis secciones — depende de: 6 — paralelizable por sección
8. Página Configuración → Claude (dirección, copiar, conexiones, revocar, interruptor admin) — depende de: 3 — paralelizable con 5–7
9. Pruebas de DB en CI (`qa.yml`) y documentación en wiki — depende de: 3, 5–7
10. Prueba manual en un preview con claude.ai (AC-2, AC-11) — depende de: todo

- Paralelos: 2 ‖ 3; 7 por sección; 8 ‖ 5–7.
- Orden duro: la migración antes que todo; OAuth antes que el endpoint para poder probar de verdad.

## 7. Risks & open decisions

**Risks**

| Risk | Trigger | Impact | Mitigation |
| --- | --- | --- | --- |
| Fallo de seguridad en el OAuth propio | Error en PKCE, rotación o redirect_uri | Acceso de terceros a datos de clientes | PKCE obligatorio, lista cerrada de redirect_uri, tokens hasheados, prueba de cada rechazo, revisor de seguridad en el PR |
| Claude cambia el flujo de conectores | Nueva versión del protocolo o de claude.ai | El conector deja de conectar | Usar el SDK oficial de MCP fijado a una versión; seguir la especificación de autorización vigente; prueba manual en preview antes de unir |
| Previews de Vercel protegidos | Vercel Authentication activo en previews | No se puede probar con claude.ai antes de producción | Bypass de protección para el preview o probar con flag en producción solo para una org de pruebas |
| Fuga de datos sensibles | Un servicio devuelve campos nuevos sensibles | SSN/ITIN en Claude | `sanitizeForAI` en toda salida + prueba con cliente sembrado; las herramientas devuelven solo campos elegidos |
| Claude borra o cambia algo por error | Instrucción ambigua | Datos cambiados | Anotación destructiva (Claude pide confirmación), mismo borrado lógico que la app, auditoría con origen |
| Conexión eterna en dispositivo perdido | Robo o pérdida | Acceso sin caducidad | Riesgo aceptado (clarify); revocar en Configuración; desactivar al usuario o cambiar su rol/correo sube `sessionVersion` y corta todas sus conexiones (no existe cambio de contraseña del equipo) |
| Cambio de rol desconecta Claude | Un admin cambia el rol de alguien | La persona debe reconectar | Aceptado (clarify tras analyze); la página de Configuración muestra la conexión como cortada |
| PR demasiado grande | Tanda 1 supera 400 líneas / 12 archivos | Revisión débil | Un solo PR (decisión 1); revisión por tarea y de cierre por bloques |
| Servicios pensados para la sesión web | Un servicio llama a `auth()` o `revalidatePath` | Falla fuera de una acción | Revisar cada servicio usado; `revalidatePath` funciona en route handlers |

**Open decisions**

1. ~~Partir la tanda 1 en dos PR.~~ **Cerrada 2026-11-09:** la dueña elige **un solo PR** para toda
   la tanda 1. Mitigación del tamaño: revisión dentro de cada tarea (`implement`) y la revisión de
   cierre con tres revisores lee el PR por bloques (OAuth, endpoint MCP, herramientas, UI).
2. **Dominio de producción.** Ya no bloquea el código: todo sale de `NEXT_PUBLIC_APP_URL`. Queda
   confirmar en Vercel que producción es `https://www.jh-multiservices.com` antes de T029.
3. **Versión del SDK de MCP.** Se fija en `implement` tras leer su documentación vigente.

## Tasks
<!-- generated by tasks on 2026-11-09; IDs are stable, do not renumber -->

Smokes de DB: se ejecutan contra la MySQL desechable `jh_gates`
(`DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates`), tras migrar con
`MIGRATE_DATABASE_URL=… npx prisma migrate deploy`. Riesgo calculado con `npx @ericrisco/rsc risk`
sobre las rutas previstas; `implement` lo recalcula sobre el diff real.

| ID | [P] | Task | Done-check | Depends-on | Trace | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| T001 |  | Add connector models, `mcpEnabled` and additive migration | `npx prisma migrate deploy` en `jh_gates` aplica limpio dos veces; la migración solo tiene sentencias aditivas (`CREATE TABLE`, `ADD COLUMN`, `ADD CONSTRAINT` de claves nuevas); `npm run typecheck` verde | — | AC1, AC9, AC10 | 2 |
| T002 | [P] | Write failing smoke for request origin in activity and audit | `npx tsx scripts/smoke/mcp-request-origin.ts` falla: no existe `requestOrigin` | — | AC8 | 1 |
| T003 |  | Implement request origin and stamp `via`/`connectionId` in activity and audit | T002 verde; smokes existentes de actividad/auditoría siguen verdes | T002 | AC8 | 1 |
| T004 | [P] | Write failing unit smoke for OAuth core (PKCE, redirect allowlist, token hashing) | `npx tsx scripts/smoke/mcp-oauth-core.ts` falla: módulos no existen | — | AC1, AC14 | 2 |
| T005 |  | Implement OAuth core primitives | T004 verde: S256 ok, `plain` rechazado, redirect no permitido rechazado, hash ≠ token | T004 | AC1, AC14 | 2 |
| T006 |  | Write failing DB smoke for OAuth service | `npx tsx scripts/smoke/mcp-oauth-db.ts` falla: servicio no existe; incluye el caso: sesión del portal de clientes en approve → rechazo | T001, T005 | AC9, AC10, AC13, AC14 | 2 |
| T007 |  | Implement OAuth service (register, approve, exchange, refresh rotation, reuse detection, revoke) | T006 verde: 5 roles obtienen tokens; sesión del portal rechazada; código reusado → invalid_grant; refresh reusado → conexión revocada; org apagada → rechazo; access caduca a 1 h con reloj inyectado | T006 | AC9, AC10, AC13, AC14 | 2 |
| T008 |  | Wire OAuth HTTP endpoints, discovery metadata and public paths | casos OAuth de T031 verdes (metadatos con `S256` y URLs de `NEXT_PUBLIC_APP_URL`; registro con redirect ajeno → 400; PKCE malo → `invalid_grant`); `npm run smoke:auth-paths` verde | T007, T031 | AC1, AC2 | 2 |
| T009 |  | Build consent page with approve and deny | approve/deny cubiertos por T006; captura: sin sesión `/oauth/authorize?...` redirige a `/login`; con sesión muestra consentimiento en español; Permitir → redirect con `code`+`state`; Denegar → `error=access_denied` | T008 | AC2, AC13 | 2 |
| T010 |  | Write failing DB smoke for MCP authentication, dispatch, audit and rate limit | `npx tsx scripts/smoke/mcp-endpoint.ts` falla: `authenticate`/`callTool` no existen; incluye: herramienta write de prueba deja `AuditLog mcp.tool.<nombre>` y llama a revalidate | T001, T003, T007 | AC1, AC8, AC9, AC10, AC12 | 1 |
| T011 |  | Implement MCP authenticate and tool dispatcher (with audit, revalidate, no-arg logging) | T010 verde: sin token/falso/caducado/revocado/org apagada/usuario inactivo/sessionVersion distinto → Unauthorized; llamada 121 en un minuto → RateLimited sin escritura; write ok → AuditLog con via="claude"; read → sin AuditLog | T010 | AC1, AC8, AC9, AC10, AC12 | 1 |
| T012 |  | Wire MCP route with the official SDK (pinned version) | casos MCP de T031 verdes (sin Bearer → 401 + `WWW-Authenticate`; con token → `initialize` y `tools/list`); `grep` en la ruta y el despachador: ningún `console.*` con args/resultados | T011, T031 | AC1, AC6 | 1 |
| T013 | [P] | Write failing static smoke for the tool registry | `npx tsx scripts/smoke/mcp-tool-registry.ts` falla: registro no existe; asserts: cada sección tiene lectura; cada write/destructive tiene `audit` y `revalidate`; archivar/cancelar/perdida son `destructive`; permiso = el de su action | — | AC4, AC5, AC8 | 1 |
| T014 |  | Write failing DB smoke for read tools | `npx tsx scripts/smoke/mcp-read-tools.ts` falla; siembra cliente con SSN **y** número de cuenta sintéticos, dos orgs, oportunidad, caso de servicio | T001, T011 | AC3, AC4, AC6 | 1 |
| T015 |  | Implement tool registry, section stubs and generic read tools | T013 (lectura) y T014 verdes: cada sección de la tanda se lista y se ve por id; id de otra org → "No encontrado"; ni SSN ni cuenta aparecen en ninguna salida; VIEWER lee | T013, T014, T032 | AC3, AC4, AC5, AC6 | 1 |
| T016 |  | Write failing DB smoke for write tools | `npx tsx scripts/smoke/mcp-write-tools.ts` falla; por sección: VIEWER → "Sin permiso"; crear/editar dejan AuditLog `mcp.tool.*`; borrar es lógico | T015 | AC4, AC5, AC8 | 1 |
| T017 | [P] | Implement client write tools | casos de clientes en T016 verdes; archivar es lógico; refresca `/crm/clientes` y la ficha | T016 | AC4, AC5, AC8 | 1 |
| T018 | [P] | Implement case write tools (credit and service) | casos de casos en T016 verdes; refresca las rutas de `src/actions/cases.ts` y `service-cases.ts` | T016 | AC4, AC5, AC8 | 1 |
| T019 | [P] | Implement task write tools | casos de tareas en T016 verdes; cancelar es lógico; refresca las rutas de `src/actions/tasks.ts` | T016 | AC4, AC5, AC8 | 1 |
| T020 | [P] | Implement note write tools | casos de notas en T016 verdes; permiso según destino (`clients.edit`, `cases.manage`, `opportunities.manage`); refresca las rutas de `src/actions/notes.ts` | T016 | AC4, AC5, AC8 | 1 |
| T021 | [P] | Implement opportunity write tools | casos de oportunidades en T016 verdes; refresca las rutas de `src/actions/opportunities.ts` | T016 | AC4, AC5, AC8 | 1 |
| T022 | [P] | Implement quote write tools | casos de cotizaciones en T016 verdes; cancelar es lógico; refresca las rutas de `src/actions/quotes.ts` | T016 | AC4, AC5, AC8 | 1 |
| T023 |  | Write failing DB smoke for connections management | `npx tsx scripts/smoke/mcp-connections.ts` falla | T007 | AC9, AC10 | 1 |
| T024 |  | Implement connections service and settings actions | T023 verde: listar propias; admin lista y revoca de la org; STAFF no revoca ajenas; `setMcpEnabled` exige `settings.manage` | T023 | AC9, AC10 | 1 |
| T025 |  | Build Configuración → Claude page | Capturas en dev, móvil (375 px) y escritorio: dirección desde `NEXT_PUBLIC_APP_URL` + copiar, 2 pasos, conexiones con revocar, interruptor solo para admin; con el conector apagado, aviso "pide a un administrador que lo encienda"; estados de carga, vacío y error | T024 | AC11 | 1 |
| T026 | [P] | Purge expired tokens and used codes in the existing cron | smoke en `mcp-oauth-db.ts` verde: tras la purga no quedan access caducados ni códigos usados; refresh vigentes intactos | T007 | AC14 | 1 |
| T027 |  | Add npm scripts and CI steps for the MCP smokes | `npm run smoke:mcp-*` existen (incluido `mcp-http`); `qa.yml` los corre en el job de MySQL desechable; CI verde en el PR | T005, T007, T011, T015, T016, T024, T031 | all | 2 |
| T028 | [P] | Document how to connect Claude in the wiki | página en `02-DOCS/wiki/` enlazada desde `index.md`, en español, sin datos personales | T025 | AC11 | 0 |
| T029 |  | Connect from claude.ai on a preview deployment | Dominio de producción confirmado en Vercel; capturas: conector añadido, login con MFA, `listar` clientes y `crear_tarea` funcionan; tarea visible en el CRM sin recargar a mano y con origen Claude en auditoría; Claude pide confirmación antes de `cancelar_tarea`; revocar corta el acceso | T012, T017–T022, T025 | AC2, AC8, AC9, AC11 | — |
| T031 |  | Write failing smoke for OAuth and MCP HTTP wiring | `npx tsx scripts/smoke/mcp-http.ts` falla: rutas no existen; llama a los route handlers con `Request` (metadatos, registro, token, `/api/mcp` sin y con Bearer) | T007 | AC1, AC2 | 1 |
| T032 |  | Add missing read queries (opportunities, service cases, detail by id for task/quote/opportunity) | casos de T014 para oportunidades, casos de servicio y detalle por id pasan; cada consulta filtra por `organizationId` y comprueba `*.view` | T014 | AC3, AC5 | 1 |
| T030 |  | All done-checks pass and verify green | cada fila marcada con evidencia; `npm run lint`, `npm run typecheck`, `npm run ci:qa` exit 0 | all | all ACs | — |

**T003 — Interfaces**
- Produces (`src/server/request-origin.ts`): `runWithRequestOrigin(origin: { via: "claude"; connectionId: string }, fn: () => Promise<T>) -> Promise<T>`; `currentRequestOrigin() -> { via?: "claude"; connectionId?: string }`; `withRequestOrigin(metadata)` (AsyncLocalStorage). Fuera del conector, `via`/`connectionId` de la metadata se quitan.
- Produces: `ActivityLog.metadata` y `AuditLog.metadata` incluyen `via` y `connectionId` cuando hay origen; sin origen, idénticos a hoy.

**T005 — Interfaces**
- Produces: `verifyPkce(verifier: string, challenge: string, method: string) -> boolean` (solo `S256`); `isAllowedRedirectUri(uri: string) -> boolean` (https://claude.ai/…, https://claude.com/…, http://localhost:<puerto>/…, http://127.0.0.1:<puerto>/…); `hashToken(token: string) -> string` (SHA-256 hex); `newOpaqueToken() -> string` (`generateToken(32)`).

**T007 — Interfaces**
- Consumes: T005; modelos de T001 (`McpClient`, `McpConnection`, `McpAuthCode`, `McpToken`, `OrganizationSettings.mcpEnabled`).
- Produces: `registerClient({ client_name, redirect_uris }) -> { client_id }`; `approve(ctx: OrganizationContext, req) -> { code }`; `exchangeCode({ code, code_verifier, client_id, redirect_uri }, now?) -> Tokens`; `refresh({ refresh_token, client_id }, now?) -> Tokens`; `revokeToken(token) -> void`. `Tokens = { access_token, refresh_token, token_type: "Bearer", expires_in: 3600 }`. Errores: `OAuthError("invalid_grant" | "invalid_request" | "unauthorized_client" | "access_denied")`.

**T011 — Interfaces**
- Consumes: T003, T007.
- Also produces: tras una herramienta `write`/`destructive` correcta, `writeAuditLog({ action: "mcp.tool.<nombre>", entityType, entityId, metadata: { via: "claude", connectionId } })` con los datos de `tool.audit(input, result)`, y `revalidatePath` para cada ruta de `tool.revalidate(result)`. Logs: solo `{ tool, outcome, ms }`.
- Produces: `authenticate(bearer: string | null, now?) -> McpContext` o lanza `UnauthorizedError`; `McpContext = OrganizationContext & { connectionId: string }`; `callTool(ctx: McpContext, name: string, args: unknown) -> unknown` con orden rate limit → `can` → zod → servicio (dentro de `runWithRequestOrigin`) → `sanitizeForAI`. Errores: `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `RateLimitError`, validación zod, regla de negocio.

**T015 — Interfaces**
- Consumes: T032 `src/server/mcp/queries.ts` → `listOpportunities(ctx, { estado?, texto?, limite? })`, `listServiceCases(ctx, {...})`, `getTaskDetail(ctx, id)`, `getQuoteDetail(ctx, id)`, `getOpportunityDetail(ctx, id)`; cada una devuelve `null` si el id no es de la org.
- Produces: `Tool = { name, title, description, inputSchema, permission: PermissionAction, kind: "read" | "write" | "destructive", run(ctx: McpContext, input) }`; registro = concatenación de `src/server/mcp/tools/<sección>.ts` (cada uno exporta `tools: Tool[]`, stubs vacíos en esta tarea); lectura: `listar({ seccion, estado?, texto?, limite? })`, `ver({ seccion, id })`, `buscar({ texto })`, reutilizando `src/server/ai/queries.ts`.

**T017–T022 — Interfaces**
- Consumes: `Tool` de T015; servicios de `src/server/<sección>`; esquemas de `src/lib/validation`; permiso igual al de la action equivalente en `src/actions/<sección>.ts`.
- Produces: solo su archivo `src/server/mcp/tools/<sección>.ts`. Nombres de herramienta según la tabla de §3.

**T024 — Interfaces**
- Produces: `listMyConnections(ctx)`, `listOrgConnections(ctx)` (exige `settings.manage`), `revokeConnection(ctx, id)` (propia, o cualquiera de la org con `settings.manage`), `setMcpEnabled(ctx, enabled)` (exige `settings.manage`).

### Review & delivery forecast
- Tier 2 (tres revisores + tu sí): T001, T004–T009, T027 — esquema, OAuth y CI.
- Cambios tras `analyze` (2026-11-09): T006–T022, T025, T027, T029 actualizadas; añadidas T031 (smoke HTTP) y T032 (consultas de lectura que faltaban).
- Tier 1 (un revisor): el resto. Nota: T010–T012 tocan la autenticación del endpoint MCP aunque la
  ruta no esté marcada como `auth`; la revisión de cierre los lee con la lente de seguridad.
- Un solo PR (decisión de la dueña). Supera el presupuesto de 400 líneas / 12 archivos; la revisión
  de cierre se hace por bloques: esquema · OAuth · endpoint MCP · herramientas · UI · CI.
- Antes del primer commit: rama propia (área delicada, regla 13) y `branch:` en el frontmatter del spec
  para que pase `npx @ericrisco/rsc spec gate`.
