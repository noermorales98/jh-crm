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
- **Reutilizar, no duplicar:** cada herramienta llama a los servicios de `src/server/*` y a los
  esquemas zod de `src/lib/validation/*`. Ninguna herramienta escribe con Prisma directamente
  (salvo las tablas propias del conector).
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
`src/server/ai/queries.ts`. Escritura: una herramienta por acción (p. ej. `crear_tarea`), con su
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
  - orden: rate limit → can(role, tool.permission) → zod.parse(args) → servicio → sanitizeForAI
  - corre dentro del contexto de petición { via: "claude", connectionId }
  - actualiza connection.lastUsedAt (como mucho una vez por minuto)

Tool = { name, title, description, inputSchema, permission: PermissionAction,
         kind: "read" | "write" | "destructive", run(ctx, input) }
  - kind → anotaciones MCP readOnlyHint / destructiveHint (Claude pide confirmación en destructivas)
  - listar/ver/buscar solo exponen secciones cuyo permiso *.view tiene el rol

requestOrigin.run({ via, connectionId }, fn); requestOrigin.current() -> { via?, connectionId? }
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

1. Pega `https://www.jh-multiservices.com/api/mcp` en Claude → Claude recibe 401 y lee los metadatos.
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
| AC-8 | integración (DB) | crear/editar vía herramienta deja ActivityLog y AuditLog con metadata.via="claude" | nada |
| AC-9 | integración (DB) | revocar → siguiente llamada Unauthorized; refresh reutilizado → conexión revocada | nada |
| AC-10 | integración (DB) | mcpEnabled=false → Unauthorized para todas las conexiones de la org | nada |
| AC-11 | e2e manual | página en móvil y escritorio: carga, vacío, error, copiar | — (capturas) |
| AC-12 | integración (DB) | llamada 121 en un minuto → "Demasiadas peticiones", sin escritura | ventana corta en test |
| AC-13 | integración (DB) | los cinco roles completan approve y obtienen tokens | nada |
| AC-14 | unidad + integración | refresh sin caducidad rota; access caduca a 1 h (reloj inyectado) | reloj |
| OAuth | unidad | PKCE S256 ok/fallo, `plain` rechazado, redirect_uri no permitido, código reusado | nada |

- Línea e2e: solo la conexión real con claude.ai y la página visual; todo lo demás se prueba llamando
  a los módulos del servidor contra MySQL real, sin pasar por HTTP.
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
| Conexión eterna en dispositivo perdido | Robo o pérdida | Acceso sin caducidad | Riesgo aceptado (clarify); revocar en Configuración; cambiar contraseña sube sessionVersion y corta todas |
| PR demasiado grande | Tanda 1 supera 400 líneas / 12 archivos | Revisión débil | Ver decisión abierta 1 |
| Servicios pensados para la sesión web | Un servicio llama a `auth()` o `revalidatePath` | Falla fuera de una acción | Revisar cada servicio usado; `revalidatePath` funciona en route handlers |

**Open decisions**

1. **Partir la tanda 1 en dos PR.** Recomendación: PR 1a = pasos 1–6 y 8 (conexión + lectura);
   PR 1b = paso 7 (escritura). Cada uno cabe mejor en el presupuesto de revisión y 1a ya da valor.
   Se cierra con el sí de la dueña.
2. **Dominio de producción.** Supuesto: `www.jh-multiservices.com`. Se cierra comprobando en Vercel
   que el CRM sirve ahí.
3. **Versión del SDK de MCP.** Se fija en `implement` tras leer su documentación vigente.
