# J&H CRM

CRM operativo de **J&H MultiServices LLC**. No es solo una agenda de contactos: concentra ventas, expedientes, reparación de crédito, tareas, documentos, cobros y comunicación en un solo lugar.

Sirve para que el equipo (Hugo y staff) responda en segundos:

1. ¿Qué hay que hacer hoy?
2. ¿Qué está atrasado?
3. ¿Quién espera seguimiento?

Sitio público: [jh-multiservices.com](https://jh-multiservices.com). El CRM interno vive en `/crm`. El login del staff es `/login`.

---

## Qué hace

Una **persona** entra como prospecto (web, Meta, alta manual) y se convierte en **cliente**. Sobre esa persona se abren **expedientes de servicio** (crédito, comprador de casa, préstamo, web, etc.). Cada expediente lleva etapas, tareas, documentos, notas, cotizaciones y pagos.

El servicio principal es **reparación de crédito**: reportes de Experian / Equifax / TransUnion, ítems a disputar, rondas, cartas y comparación de avances. El CRM no promete puntajes ni “borrar todo lo negativo”; registra lo que sí ocurrió.

También cubre:

- Pipeline comercial (Leads)
- Catálogo, cotizaciones PDF y cobro (Zelle, efectivo, transferencia, Stripe)
- Correo de la empresa, WhatsApp y campana interna
- Portal del cliente (progreso, documentos, firma, pagos)
- Sitio web con formulario de contacto y páginas legales

---

## Las tres caras del sistema

| Superficie | Quién entra | Para qué |
| --- | --- | --- |
| **Sitio** (`/`) | Público | Landing, consulta de $1, privacidad, términos, SMS, cancelación, reembolsos |
| **CRM** (`/crm`) | Staff con rol | Operación diaria: clientes, casos, cobros, correo, configuración |
| **Portal** (`/portal`) | Cliente invitado | Ver progreso, documentos, reportes, contratos y pagos |

El intake público (`/intake/[token]`) captura documentos del cliente con un enlace; está apagado hasta activar `FEATURE_PUBLIC_INTAKE`.

---

## Cómo se trabaja (flujo típico)

```text
Captación          Venta                 Operación              Cierre
web / Meta / alta  Lead → consulta →    expediente + tareas    pago, recibo,
                   cotización           crédito / rondas       contrato, testimonio
        │               │                     │
        └───────────────┴─────────────────────┘
                         Cliente (una persona)
```

1. Llega un lead (formulario, Facebook/Instagram o alta en Clientes).
2. Se da seguimiento en **Leads** hasta ganarlo o perderlo.
3. Al ganar, el cliente pasa a activo y se abre un **caso / expediente**.
4. Se piden documentos, se cotiza, se cobra (o se arma un plan de cuotas).
5. En crédito: se carga el reporte, se eligen ítems, se arma la **ronda**, se genera la carta, se espera actualización y se compara.
6. El cliente puede entrar al **portal**. Al terminar, se puede pedir un **testimonio**.

---

## Navegación del CRM

La barra izquierda es el trabajo de cada día. El resto está en **Más**. **Configuración** queda abajo del todo.

### Barra principal

| Sección | Ruta | Qué es |
| --- | --- | --- |
| **Inicio** | `/crm/dashboard` | Resumen del día: clientes activos, casos abiertos, cobros, atrasos, leads por contactar y atajos al asistente. |
| **Pendientes** | `/crm/tareas` | Tareas con tipo, prioridad, vencimiento y asignado. También se crean desde el cliente o el caso. |
| **Leads** | `/crm/oportunidades` | Kanban comercial (nuevo → contactado → consulta → intake → propuesta → pago → ganado/perdido). Ganar abre caso y activa al cliente. |
| **Clientes** | `/crm/clientes` | Personas. Estados: prospecto, activo, pausado, completado, cancelado, archivado. Alta en `/crm/clientes/nuevo`. |
| **Casos** | `/crm/casos` | Expedientes de servicio. El de crédito es el núcleo: etapa, responsable, próxima revisión. |
| **Cobrar** | `/crm/pagos` | Pagos pendientes y recibidos. Alta en `/crm/pagos/nuevo`. Al marcar recibido se emite recibo con folio. |
| **Mensajes** | `/crm/mails` | Bandeja de la organización (entrada, enviados, borradores, archivo, spam, papelera). IMAP cada minuto; envío por SMTP. |
| **Chats** | `/crm/chats` | Historial con el asistente de IA. El globo de la esquina también abre el chat. |

### Ficha de cliente

Desde `/crm/clientes/{id}`:

- **Resumen** — contacto, responsable, servicio activo.
- **Expediente** — datos, perfil sensible (SSN, licencia; solo especialista/admin) y documentos.
- **Casos / servicios** — expedientes de esa persona.
- **Actividad y notas** — bitácora.
- **Tareas, documentos, pagos, testimonios**.

Los documentos aceptan PDF/JPG/PNG (hasta 15 MB) con categoría y sensibilidad. El SSN nunca se muestra en claro en listados ni se manda a la IA.

### Ficha de caso (crédito)

Desde `/crm/casos/{id}`:

- **Resumen** — etapa del flujo, estado, próxima acción.
- **Crédito** — reportes INITIAL/UPDATE/MANUAL, scores por buró, cuentas (número enmascarado), importación de PDF.
- **Rondas** — cada ciclo de disputa (borrador → enviada → esperando update → revisión).
- **Comparaciones** — reporte base vs actualizado (eliminado / actualizado / verificado).
- **Cartas** — plantilla → borrador → revisión humana → final → enviada. PDF al vuelo, no se guarda en el bucket.
- **Reporte visual** — snapshot para mostrar avance al cliente.
- **Tareas, documentos, cotizaciones, pagos** ligados a ese caso.

Las rondas de todos los casos también se listan en **Más → Rondas** (`/crm/rondas`).

### Menú Más

| Grupo | Sección | Ruta | Qué es |
| --- | --- | --- | --- |
| Ventas | Consultas | `/crm/consultas` | Solicitudes de consulta del sitio ($1). No se marcan pagadas sin pasarela real. |
| Crédito | Rondas | `/crm/rondas` | Todas las rondas de disputa. |
| Dinero | Cuotas | `/crm/planes-pago` | Planes a plazos; cada cuota genera un pago pendiente. |
| Dinero | Recibos | `/crm/recibos` | Folios emitidos. Solo admin/propietario puede anular. |
| Dinero | Cotizaciones | `/crm/cotizaciones` | Propuestas con ítems del catálogo o sueltos, envío y PDF. Link de Stripe si está activo. |
| Dinero | Servicios | `/crm/servicios` | Catálogo y paquetes (`/crm/servicios/paquetes`). |
| Extra | Testimonios | `/crm/testimonios` | Reseñas con consentimiento (aprobar / publicar son pasos distintos). |
| Extra | Contratos | `/crm/contratos` | Plantillas y contratos; el cliente firma en el portal. |
| Extra | Procesadores | `/crm/procesadores` | Monitores externos (SmartCredit, Credit Karma, etc.) y cuentas del cliente. |

Otras pantallas de staff:

- **Atribución** (`/crm/atribucion`) — de dónde vienen los leads (web, Meta, referido, UTM).
- **Usuarios** (`/crm/usuarios`) — miembros e invitaciones.
- **Auditoría** (`/crm/auditoria`) — eventos sensibles (SSN, documentos, recibos, cambios de rol).

### Configuración

| Pestaña | Ruta | Qué es |
| --- | --- | --- |
| Empresa y folios | `/crm/configuracion` | Nombre, logo, dirección, moneda, impuesto, prefijos (CL, CASE, Q, REC), retención de documentos, Stripe. |
| Notificaciones | `/crm/configuracion/notificaciones` | SMTP, resumen diario, avisos correo/WhatsApp (CallMeBot al equipo, Whapi a clientes). |
| Seguridad | `/crm/configuracion/seguridad` | MFA (TOTP) de la cuenta. |
| Etapas del proceso | `/crm/configuracion/etapas` | Orden y color de las etapas de cada servicio. |
| Borrar datos | `/crm/configuracion/datos` | Zona de propietario/administrador: vacía clientes, leads y operación. Hay que escribir `BORRAR TODO`. Conserva usuarios, catálogo y la empresa. Irreversible. |

Búsqueda global: **⌘K** (o el campo “Buscar o preguntar”). Campana de notificaciones en el header.

---

## Roles

El permiso se valida en servidor, no solo ocultando botones.

| Rol | En la UI | Puede |
| --- | --- | --- |
| **Propietario** (`OWNER`) | Propietario | Todo, incluida administración. |
| **Administrador** (`ADMIN`) | Administrador | Igual: usuarios, auditoría, anular recibos, catálogo, configuración, borrar datos. |
| **Especialista** (`SPECIALIST`) | Especialista | Operación + datos sensibles (SSN, documentos confidenciales) y procesadores. |
| **Staff** (`STAFF`) | Staff | Operación diaria, sin sensibles ni administración. |
| **Solo lectura** (`VIEWER`) | Solo lectura | Consultar, no editar. |

---

## Servicios que puede llevar un cliente

Un cliente no tiene “un solo estado”. Puede tener varios expedientes a la vez:

| Código | Uso |
| --- | --- |
| `CREDIT_REPAIR` | Reparación de crédito (módulo principal). |
| `HOME_BUYER` | Comprador de casa. |
| `BUSINESS_CREDIT` | Crédito comercial / fondeo. |
| `PERSONAL_LOAN` | Préstamo personal. |
| `WEB_DEVELOPMENT` | Sitio web. |
| `CRM_DEVELOPMENT` | Desarrollo de CRM / proyectos. |

Cada vertical tiene sus propias etapas. El flujo de crédito (reportes, rondas, cartas) aplica a `CREDIT_REPAIR`.

---

## Sitio, portal e integraciones

**Sitio.** Portada con servicios y formulario. El envío pide un desliz anti-bot y el consentimiento de privacidad. Crea un cliente prospecto (fuente sitio web), avisa en la campana y por WhatsApp. Si el correo o teléfono ya existe, se anota en el expediente y no se vuelve a notificar.

**Portal.** Flag `FEATURE_CLIENT_PORTAL`. El admin invita desde la ficha. El cliente ve progreso, documentos, reportes, pagos y puede firmar contratos.

**Meta Lead Ads.** Flag `FEATURE_META_LEAD_ADS`. El webhook crea o actualiza cliente + lead (Facebook/Instagram) sin duplicar el mismo anuncio.

**Correo.** IMAP importa la bandeja; SMTP envía. Traducción al español en el detalle. Avisos a campana y WhatsApp.

**Pagos.** Registro manual o Checkout de Stripe (claves por organización). Consultas de $1 no se marcan pagadas sin `FEATURE_CONSULTATION_PAYMENTS` y pasarela.

**IA.** Chat con datos de la org (clientes, casos, cotizaciones, pagos) y enlaces reales `/crm/...`. No descifra SSN ni inventa eliminaciones en burós. Requiere `OPENROUTER_API_KEY`.

**Archivos.** Bucket S3-compatible (p. ej. R2). Sin `S3_*` el resto del CRM funciona; subir/bajar archivos falla de forma controlada. Un cron puede purgar documentos según los días de retención.

---

## Automatizaciones (cron)

No hay cron de Vercel. Se disparan desde [cron-job.org](https://cron-job.org/en/) con `Authorization: Bearer $CRON_SECRET`.

| Job | Ruta | Frecuencia | Qué hace |
| --- | --- | --- | --- |
| Correos | `GET /api/cron/mails-sync` | 1 min | Importa IMAP, avisa una sola vez por mensaje. |
| Recordatorios | `GET /api/cron/reminders` | 15 min | Tareas, revisiones, pagos, follow-ups. |
| Resumen | `GET /api/cron/digest` | 1 h | Correo a owner/admin a la hora configurada. |
| Retención | `GET /api/cron/retention` | 1 día | Hard-delete en S3 de documentos vencidos. |

---

## Para desarrollar

Stack: **Next.js 16** (App Router) + **React 19** + **TypeScript** + **Tailwind 4** + **Prisma 6** (MySQL) + **NextAuth v5**.

```bash
npm install
cp .env.example .env.local    # rellenar valores
npm run db:deploy
npx tsx --env-file=.env.local scripts/bootstrap.ts
npm run dev                   # http://localhost:3000
```

El bootstrap crea la organización, etapas de crédito, settings y el usuario propietario (`BOOTSTRAP_OWNER_EMAIL` / `BOOTSTRAP_OWNER_PASSWORD`).

Imprescindibles en `.env.local`: `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, `BOOTSTRAP_OWNER_*`. Opcionales: OpenRouter, S3, flags `FEATURE_*`. Lista completa en `.env.example`.

| Comando | Uso |
| --- | --- |
| `npm run dev` | Desarrollo |
| `npm run build` / `npm run start` | Producción |
| `npm run lint` | ESLint |
| `npm run db:migrate` / `db:deploy` / `db:studio` | Prisma |
| `npm run seed:demo-credit` | Cliente + caso de crédito de demostración |

Arquitectura, reglas de negocio y seguridad: carpeta [`docs/`](docs/README.md).
