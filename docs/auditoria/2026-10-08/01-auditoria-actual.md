# 01 — Auditoría actual de JH CRM

Fecha de la auditoría: 2026-10-08. Idioma: español.

## Insumos recibidos y leídos

| Insumo | Uso en esta auditoría |
| --- | --- |
| Prompt maestro `Prompt-auditoria-y-mejora-JH-CRM.md` | Criterios de evidencia, estados y formato de entrega |
| `Contexto-y-guia-de-anexos.md` | Límites: Fondify es referencia funcional, no arquitectura de JH |
| `Informe-Fondify.md` | Patrones de agencia (importación, calificación, rondas, PDFs, cotización) |
| `rutas-fondify.json` y `endpoints-fondify-frontend.json` | Catálogo de contraste. No son especificación de este repositorio |
| Checkout local `noermorales98/jh-crm` | Fuente de verdad |

No se llamó a la API de Fondify, no se abrió su administrador y no se copió código propietario. No se ejecutaron migraciones, cobros, envíos ni escrituras de producción.

## Alcance y versión

| Dato | Valor | Cómo se obtuvo |
| --- | --- | --- |
| Rama | `main` | `git rev-parse --abbrev-ref HEAD` |
| SHA | `9445bff96631083fc875a6dfdbedf5426814ee52` | `git rev-parse HEAD` |
| Mensaje | Merge pull request #5 from `feat/agency-avance-gestion-embebida` | `git log -1` |
| Autor del merge | Noelí Rodríguez (Nóe), 2026-10-08 17:45 -0500 | `git log -1` |
| Working tree | Limpio, `main` alineado con `origin/main` | `git status -sb` |
| Remoto | `https://github.com/noermorales98/jh-crm.git` | `git remote -v` |

Método:

- **INSPECCIONADO:** `package.json`, App Router, Prisma, auth, permisos, acciones de servidor, rutas API, `.env.example` (solo nombres) y scripts de smoke.
- **NO EJECUTADO:** `npm run lint`, `tsc --noEmit`, `npm run build`, smokes y sondas HTTP. Un script presente no cuenta como prueba pasada.
- **NO VERIFICADO:** valores reales de Vercel/Hostinger, si el webhook de Stripe llega en el despliegue, y un fuzz IDOR de cada `findUnique`.

`docs/CURRENT_STATE.md` y partes de `docs/PENDING_IMPLEMENTATION.md` describen un estado anterior (sin ServiceCase completo, MFA incompleto, Meta aún vigente). No se usaron como hechos.

## Arquitectura verificada en este commit

Stack real en `package.json` (coincide con el README en lo esencial):

- Next.js `16.3.4`, React `19.2.8`, TypeScript 5, Tailwind 4, Zod `^4.5.4`.
- Prisma `^6.19.3` y MySQL (`datasource` en `prisma/schema.prisma`).
- NextAuth `^5.0.0-beta.32`.
- Stripe `^17.7.0`, AWS SDK S3 `^3.1123.0`, `unpdf`, `jspdf`, `imapflow`, `nodemailer`, `otpauth`, AI SDK + OpenRouter.

No hay `middleware.ts`. Next.js 16 usa `proxy.ts`, que delega en `authConfig.callbacks.authorized` (`auth.config.ts`). Las Server Actions se saltan en el proxy (`proxy.ts`, cabecera `next-action`) y dependen de `requireOrganization` / `requirePermission` en cada acción.

Auth (`auth.ts`):

- Provider `credentials`: staff, `passwordHash`, MFA opcional (`verifyMfaLogin`).
- Provider `portal`: `ClientPortalAccess`.
- Sesión JWT. `SESSION_MAX_AGE_SECONDS` es del orden de 10 años (`src/server/auth/session-constants.ts`). La invalidación real es `sessionVersion` / `isActive`.
- Roles Prisma: `OWNER | ADMIN | SPECIALIST | STAFF | VIEWER`. La matriz está en `src/server/auth/permissions.ts` (`can`).

Superficies:

- Sitio: `app/page.tsx` y páginas legales en `app/(marketing)/`.
- Staff: `app/crm/**` (no hay grupo `(staff)`).
- Portal: `app/portal/**`, flag `FEATURE_CLIENT_PORTAL`.
- Intake: `app/intake/[token]`, flag `FEATURE_PUBLIC_INTAKE`.
- Avance compartido: `app/a/[token]`.
- Retorno de pago: `app/pay/success` y `app/pay/cancel`.

Modelo de dominio (conservar, no reescribir):

- `Client` 1—N `ServiceCase`.
- `CreditCase.serviceCaseId` único: el caso de crédito envuelve un expediente.
- Verticales más delgados: `HomeBuyerCase`, `FundingCase`, `FundingApplication`, `PersonalLoanCase`, `ProjectCase`.
- Crédito: `CreditReport` → `CreditBureauSnapshot` / `CreditItem`; `CreditRound` → `DisputeItem` → `DisputeLetter`; `ReportComparison`.
- Comercial: `Opportunity`, `Quote`, `Payment`, `Receipt`, `PaymentPlan`, `Consultation`, `ContractTemplate`, `ClientContract`.
- 30 carpetas de migración. La última por nombre es `20260918010000_task_external_key`.

Pruebas y CI:

- No hay `*.test.ts` / `*.spec.ts`, ni Jest, Vitest o Playwright en `package.json`.
- Hay smokes en `scripts/smoke/` invocados con `tsx`. La mayoría exige `.env.local` y MySQL.
- No existe `.github/workflows`. El build de deploy llama `scripts/migrate-on-deploy.mjs` y luego `next build`.

## Cómo arrancar en local sin tocar producción

1. Copiar `.env.example` a `.env.local`. No commitear ese archivo.
2. Apuntar `DATABASE_URL` a una base sandbox vacía. No usar la cadena de producción.
3. `npm install` (el `postinstall` solo ejecuta `prisma generate`).
4. `npm run db:migrate` solo contra esa sandbox.
5. `npm run dev`.

No se ejecutó ese arranque en esta auditoría.

Variables y apagado: ver `08-configuracion-pendiente.md`. Resumen: sin `S3_*` no hay documentos; sin `OPENROUTER_API_KEY` no hay chat ni extracción de PDF; sin `FEATURE_CLIENT_PORTAL=true` el portal no abre; sin `FEATURE_PUBLIC_INTAKE=true` el intake responde como apagado; `FEATURE_CONSULTATION_PAYMENTS=false` bloquea el cobro de consultas (el código trata el flag como opt-out: solo `"false"` bloquea). SMTP, IMAP, Stripe y WhatsApp viven en ajustes de la organización, cifrados, no en el `.env` de la app.

## Qué está implementado en código

Estas funciones tienen UI, validación, permiso, servicio y Prisma. El estado de la matriz es `IMPLEMENTADO SIN PRUEBA` porque los smokes no se ejecutaron aquí. Donde hay script, se cita en la columna de evidencia de prueba.

- Dashboard y cola de atención: `getDashboardSummary` en `src/server/dashboard/index.ts`.
- Leads kanban y conversión: `src/server/opportunities/index.ts` (`createLead`, `listByStage`, `markWon`).
- Clientes CRUD, búsqueda, filtros y archivo: `src/server/clients/index.ts`, `src/actions/clients.ts`.
- Varios expedientes por persona, etapa y siguiente acción: `src/server/cases/index.ts`.
- Reportes INITIAL / UPDATE / MANUAL: `src/server/credit-reports/index.ts`.
- Rondas, disputas, comparaciones y cartas con PDF: `src/server/rounds`, `comparisons`, `letters`.
- Cotizaciones, catálogo, totales, PDF y aceptación: `src/server/quotes/index.ts`.
- Pagos manuales, recibos, anulación y planes: `src/server/payments`, `receipts`, `payment-plans`.
- Documentos con subida firmada y descarga autorizada: `src/server/documents`, `app/api/files/*`.
- MFA TOTP en el login: `auth.ts` y `src/actions/mfa.ts`.
- Automatizaciones de tareas y cron con `CRON_SECRET`: `src/server/automations/index.ts`, `app/api/cron/*`.
- RBAC de servidor, no solo de botones: `src/server/auth/guards.ts`.

## Qué está parcial, mock o apagado

- Importación: `clients-action-bar.tsx` lee el archivo como texto (`file.text()`) y llama `importClientsCsv`. No hay parser XLSX, preview, mapeo de columnas ni dedupe. La etiqueta de UI menciona CSV/XLSX.
- Unir expedientes: `agency-client-detail.tsx` (modal `panel === "merge"`) dice que aún no está implementado. Es UI sin handler de persistencia. Estado: `SOLO UI/MOCK`.
- Calificación tipo Fondify: `mapClientToFondifyStatus` en `src/lib/fondify/status.ts` traduce `ClientStatus` (LEAD → estructuración, ACTIVE/PAUSED → reparación, COMPLETED → listos). No lee scores ni negativos. El propio comentario lo marca como baseline.
- Score Plan: simulación en el cliente dentro de `agency-client-detail.tsx`. No hay motor persistido.
- Rondas: hay ítems, buró, fechas y comparación. No hay campos `method` ni `scope` en `CreditRound`.
- PDF de crédito: `unpdf` extrae texto; `classifyAndExtractFromPdf` (`src/server/credit-import/extract.ts`) envía ese texto a OpenRouter y, si el texto es escaso, adjunta el PDF (hasta 4.5 MB). No es OCR local. Depende de `OPENROUTER_API_KEY` y de S3.
- Stripe Checkout, portal, intake, correo y WhatsApp existen y quedan inertes sin credenciales o flags. Estado compuesto: código presente y `BLOQUEADO POR CONFIGURACIÓN` hasta probar el sandbox.
- Meta Lead Ads: `app/api/public/meta/leads/route.ts` responde 410. `app/crm/atribucion/page.tsx` redirige a `/crm/dashboard`. El modelo `MetaLeadEvent` y `src/server/meta/leads.ts` siguen en el repo. El README todavía lo describe como función viva: desalineación de documentación, no de runtime.

## Qué falta y conviene

- Detección de duplicados por correo o teléfono y restauración explícita.
- Importación con dry-run, mapeo y resumen crear/existe/sin correo.
- Merge real de persona y expedientes, con transacción y auditoría.
- Política de retención de la persona (hoy el cliente se archiva; el cron de retención borra documentos).
- Plantillas de correo y WhatsApp (hoy hay textos fijos).
- Invitación de equipo por correo. `inviteUser` en `src/server/users/index.ts` deja una contraseña temporal en la respuesta.
- Rate limit del formulario de contacto y del login. El rate limit MySQL (`RateLimitBucket`) solo cubre el intake público.
- Organización explícita del formulario público. `resolvePublicOrganizationId` toma la organización más antigua (`src/server/contact/index.ts`).

## Qué no copiar de Fondify

Fondify, observado el 2026-10-08, mezcla un producto de consumidor y un panel de agencia. JH CRM es el CRM operativo de J&H. No hace falta, y no se debe imitar:

- App de consumidor: DNA, Pulse, Smart Plan, ofertas, tarjetas, suscripción personal.
- Membresía IDIQ, KBA, refresh automático de buró y cobro condicionado a verificación.
- Firebase, admin Django, ni la API `fondify.io/api/v1`.
- SaaS de cupos de agencia, afiliados, legado de afiliados y redirección a sitios de ofertas.
- Página imán `/a/<slug>` y registro público de reporte de consumo. El `/a/[token]` de JH es un enlace HMAC de avance, no ese imán.
- Tarifas y umbrales de esa referencia (score 720, utilización 10 %, honorarios de ejemplo) como reglas de J&H. Si se usan, deben ser configuración editable y presentarse como heurística, nunca como aprobación.
- Generar cotización, contrato o score plan con un POST al abrir el modal. En JH la lectura no debe escribir.
- Atribuir “funcionó” a una disputa solo porque la cuenta cambió entre dos reportes.

Patrones que sí conviene adaptar con diseño propio: importación con preview, historial documental, flags de ronda (método y alcance), plan de acción calculado con datos del reporte, y PDFs que ya existen en este repo (cartas, cotizaciones, recibos, avance, plan de acción).

## Seguridad (resumen)

Detalle y remediación en `05-riesgos-seguridad-y-datos.md`.

- El allowlist de `auth.config.ts` no incluye `/api/webhooks/stripe`, `/pay/*` ni `/a/*`. El webhook sí verifica firma, pero el proxy puede exigir sesión antes. Conclusión estática; el comportamiento HTTP en runtime queda `NO VERIFICADO`.
- El importador de PDF puede enviar PII de buró a OpenRouter.
- El contacto público no está atado a un `organizationId` configurado.
- Muestreo de acciones: el `organizationId` sale de la sesión y las mutaciones pasan por `requirePermission`. No se certificó el 100 % de las consultas.
- No se encontraron secretos en git. `.env.example` solo tiene placeholders. `.env.local` está en gitignore y no se leyó.

## Checks

| Comando | Resultado |
| --- | --- |
| `git rev-parse` / `git status` | EJECUTADO. Ver tabla de versión |
| `npm run lint` | NO EJECUTADO |
| `tsc --noEmit` | NO EJECUTADO. No hay script `typecheck` en `package.json` |
| `npm run build` | NO EJECUTADO. Además corre migraciones si `RUN_PRISMA_MIGRATE` lo permite |
| Smokes `npm run smoke:*` | NO EJECUTADO. Requieren sandbox confirmado |

## Relación con el resto del paquete

- Matriz: `02-matriz-funcional.csv`
- Orden de trabajo: `03-roadmap-priorizado.md`
- Cortes de PR: `04-plan-implementacion-por-pr.md`
- Riesgos: `05-riesgos-seguridad-y-datos.md`
- QA: `06-checklist-qa.md`
- Backlog máquina: `07-backlog.json`
- Configuración: `08-configuracion-pendiente.md`
- Rutas y datos: `09-mapa-rutas-y-datos.md`

Después de cada PR de código hay que actualizar la fila correspondiente de la matriz y registrar el comando y el resultado. No marcar `IMPLEMENTADO Y PROBADO` si la prueba no se ejecutó en sandbox con datos sintéticos.
