# 09 — Mapa de rutas y datos

Commit: `9445bff96631083fc875a6dfdbedf5426814ee52`.

La puerta HTTP es `proxy.ts` → `authorized` en `auth.config.ts`. Las mutaciones de negocio están en `src/actions/*` y `src/server/*`, con `requirePermission`. Esta lista no sustituye un inventario generado; las páginas se contaron en el árbol `app/**/page.tsx` (83 archivos) y los handlers en `app/api/**/route.ts` (28 archivos).

## Quién puede entrar

| Prefijo | Sesión | Notas |
| --- | --- | --- |
| `/`, `/login`, legales (`/privacy`, `/terms`, `/cancellation`, `/refunds`, `/disclosures`, `/sms-terms`) | No | Allowlist |
| `/intake` | No | La página responde apagada si `FEATURE_PUBLIC_INTAKE` no es `true` |
| `/api/auth`, `/api/public`, `/api/cron`, `/api/mails`, `/api/health` | No | Cron y mails inbound exigen `CRON_SECRET` en el handler |
| `/portal/login` | No | |
| `/portal/*` | Portal | Flag `FEATURE_CLIENT_PORTAL`, `portalAudience` y `clientId` |
| `/crm/*`, `/api/files`, resto de `/api/*` | Staff con rol | Una sesión portal se manda a `/portal` |
| `/pay/success`, `/pay/cancel`, `/a/[token]` | Staff, por el código actual | Deberían ser anónimas. Ver SEC-C1. El token de `/a` no sustituye al proxy |

## Sitio y legales

- `app/page.tsx` inicio.
- `app/(marketing)/*` textos legales.
- `POST /api/public/contact` crea lead en la org más antigua.
- `GET/POST /api/public/meta/leads` → 410.
- `GET /api/public/testimonials` testimonios publicados.
- `GET /api/health`.

## Staff (`/crm`)

Barra principal observada en la auditoría de navegación: Inicio, Pendientes, Leads, Clientes, Cobrar, Mensajes, Chats. Casos existe como ruta y no como ítem principal de escritorio.

| Ruta | Entidades | Permiso típico |
| --- | --- | --- |
| `/crm`, `/crm/dashboard` | Conteos, tareas de atención | `dashboard.view` |
| `/crm/tareas`, `/crm/tareas/[taskId]` | `Task` | `tasks.view` / `tasks.manage` |
| `/crm/oportunidades` | `Opportunity`, `Client` en status lead | `opportunities.*` |
| `/crm/clientes`, `/nuevo`, `/[clientId]` y pestañas expediente, casos, servicios, actividad, notas, tareas, documentos, pagos, reportes, testimonios, plan de acción | `Client`, `Note`, `ServiceCase`, `Document`, `Payment`, `CreditReport` | `clients.*` y el permiso de cada pestaña |
| `/crm/casos`, `/[caseId]` y crédito, importaciones, rondas, cartas, comparaciones, documentos, cotizaciones, pagos, tareas | `ServiceCase`, `CreditCase`, `CreditRound`, `DisputeLetter`, `ReportComparison` | `cases.*`, `rounds.*`, `letters.*` |
| `/crm/expedientes/[serviceCaseId]` | `ServiceCase` genérico | `cases.view` |
| `/crm/pagos`, `/crm/planes-pago`, `/crm/recibos` | `Payment`, `PaymentPlan`, `Receipt` | `payments.*`, `receipts.void` para anular |
| `/crm/cotizaciones` | `Quote`, `QuoteItem`, `Service` | `quotes.*` |
| `/crm/servicios`, `/paquetes` | `Service`, `ServicePackage` | `catalog.*` |
| `/crm/mails`, `/crm/chats` | `MailMessage`, conversación WhatsApp | `mails.*` |
| `/crm/consultas` | `Consultation` | `consultations.*` |
| `/crm/rondas` | lista transversal de `CreditRound` | `rounds.view` |
| `/crm/contratos` | `ContractTemplate`, `ClientContract` | `contracts.*` |
| `/crm/procesadores` | `CreditProcessor`, `ClientProcessorAccount` | `processors.*` |
| `/crm/testimonios` | `Testimonial` | `testimonials.*` |
| `/crm/atribucion` | ninguna | redirect a dashboard |
| `/crm/usuarios` | `User`, `OrganizationMember` | `users.manage` |
| `/crm/auditoria` | `AuditLog` | `audit.view` |
| `/crm/configuracion` y notificaciones, seguridad, etapas, datos | `OrganizationSettings`, `WorkflowStage`, MFA | `settings.manage` |

## Portal, intake, avance, pago

| Ruta | Datos |
| --- | --- |
| `/portal` y progreso, documentos, reportes, pagos, testimonios | Filtrados por `clientId` de la sesión portal |
| `/intake/[token]` | `IntakeLink`, `IntakeSubmission`, `ConsentRecord` |
| `/a/[token]` | Lectura de avance si el HMAC vale. Hoy el proxy estorba |
| `/pay/success`, `/pay/cancel` | Páginas de retorno. No son el registro del pago |

## API de apoyo

| Handler | Escritura | Auth real además del proxy |
| --- | --- | --- |
| `POST /api/webhooks/stripe/[organizationId]` | Pago y recibo | Firma Stripe. El proxy aún pide staff |
| `POST /api/files/upload-url`, `POST /api/files/confirm` | Documento | `documents.upload` |
| `GET /api/files/[documentId]/download` | No | Org y sensibilidad |
| `GET` PDF de carta, cotización, recibo, plan de acción, avance, progress report | Algunos generadores leen y pueden persistir metadatos; no se reauditó cada uno en runtime | Sesión staff y permiso del recurso |
| `POST /api/ai/chat`, `POST /api/crm/search/assist` | Puede guardar `AiChat` | Sesión de org. Falta permiso fino |
| `GET /api/crm/search` | No | Sesión staff |
| Cron GET | Sí (tareas, digest, IMAP, purge) | Bearer |
| Intake público | Sí, acotado al token | Flag, rate limit, caducidad |

## Entidades y cómo se conectan

```text
Organization
  OrganizationMember → User (Role)
  OrganizationSettings
  Client
    ClientSensitiveProfile
    Opportunity
    ServiceCase → WorkflowStage, ServiceCaseStageHistory
      CreditCase → CreditReport → CreditBureauSnapshot, CreditItem
                → CreditRound → DisputeItem → DisputeLetter
                → ReportComparison
      HomeBuyerCase | FundingCase | PersonalLoanCase | ProjectCase
    Document, Note, Task, ActivityLog
    Quote → Payment → Receipt
    PaymentPlan → PaymentInstallment
    Consultation
    ClientContract → ContractTemplate
    ClientPortalAccess
    IntakeLink → IntakeSubmission
    Testimonial
  AuditLog, Notification, MailMessage, AiChat
```

`CreditCase.serviceCaseId` es único: no hay un caso de crédito suelto sin expediente. Lead no es otra persona: es `Client` en status de lead más `Opportunity`. Ronda no es un caso: cuelga del caso de crédito.

## Permisos (resumen de `src/server/auth/permissions.ts`)

- `VIEWER`: lectura de `ALL_READ`. Sin escrituras ni atribución.
- `STAFF`: lectura, `attribution.view` y escrituras operativas (`STAFF_WRITE`). Sin SSN, sin anular recibos, sin usuarios.
- `SPECIALIST`: lo de staff, más `sensitive.*`, `documents.downloadSensitive` y `processors.manage`.
- `ADMIN` y `OWNER`: lo anterior más `receipts.void`, `users.manage`, `audit.view`, `catalog.manage`, `settings.manage`, `portal.manage`, `testimonials.publish`.

El proxy no aplica esta matriz. Si una acción nueva olvida `requirePermission`, queda abierta a cualquier staff. El proxy además ignora el POST de Server Actions.

## Integraciones y el dato que cruzan

| Servicio | Dato | Condición |
| --- | --- | --- |
| MySQL | Todo el dominio | `DATABASE_URL` |
| S3 compatible | Bytes de `Document` y PDF de crédito | `S3_*` |
| Stripe | Importes y ids de sesión. No el PAN | Ajustes de la org |
| SMTP / IMAP | Correo de la org y de clientes | Ajustes de la org |
| CallMeBot / Whapi | Teléfono y texto de aviso | Ajustes de la org |
| OpenRouter | Texto de chat ya sanitizado; texto o PDF de buró en el importador | `OPENROUTER_API_KEY` |
| Scheduler | Dispara cron | `CRON_SECRET` |

Meta no cruza datos: la ruta está retirada.

## Desalineaciones a no perder

- README y nav hablan de piezas que el código apagó (Meta, atribución, Casos en la barra).
- `docs/CURRENT_STATE.md` no describe este SHA.
- Fondify `/a/<slug>` no es el `/a/[token]` de este repo.
