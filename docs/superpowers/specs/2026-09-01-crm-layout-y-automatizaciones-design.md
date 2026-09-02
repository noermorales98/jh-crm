# Layout master-detail y automatizaciones (correo, WhatsApp, digest)

Fecha: 2026-09-01  
Proyecto: J&H CRM (`jh-crm`)  
Estado: diseño aprobado en chat (incl. 2–4 destinatarios WhatsApp); pendiente de tu revisión de este archivo

## Problema

Las listas del CRM son una sola columna: hay que hacer mucho scroll para trabajar. Además se necesitan avisos automáticos por correo y WhatsApp, y un resumen diario configurable para la operación.

## Decisiones cerradas

- Patrón visual: **master-detail** (lista a la izquierda, ficha a la derecha) en **todas las listas**.
- Móvil: lista a pantalla completa; al tocar un ítem la ficha se abre **encima** (sheet) y se puede cerrar.
- Dashboard: se queda en bloques de dos columnas; **no** es master-detail.
- Enfoque técnico: **extender lo existente** (cron de recordatorios + CallMeBot), no rehacer el CRM.
- Resumen diario: **un solo digest para OWNER/ADMIN** (toda la operación), no uno por persona.
- Hora del digest: **configurable** en Ajustes; default **08:00** en el timezone de la org (`America/Chicago` salvo que se cambie).
- Correo: **SMTP configurable a mano** (host, puerto, usuario, contraseña, remitente, TLS).
- Destinatarios de correo: **equipo y clientes**, con plantillas distintas y cada tipo on/off.
- WhatsApp: **solo el equipo**, nunca clientes. Hasta **4 números** CallMeBot; **todos los activos reciben todos** los avisos. CallMeBot no hace broadcast: **una petición HTTP por número**, en serie.
- Cron: [cron-job.org](https://cron-job.org/en/) llama endpoints protegidos con `Authorization: Bearer CRON_SECRET`.

## Fuera de alcance

- WhatsApp Business / Twilio a clientes.
- Más de 4 números WhatsApp, enrutado por tipo de aviso, o un número por miembro del CRM.
- Rediseño del dashboard como inbox.
- Cambiar el chat de IA, el login o las páginas de “nuevo” (formularios de alta siguen a página completa).
- Usuarios, auditoría y configuración de etapas no son listas master-detail.

## Fase 1 — Layout master-detail

### Listas que lo usan

| Lista | Ruta lista | Ficha |
| --- | --- | --- |
| Clientes | `/crm/clientes` | resumen del cliente |
| Casos | `/crm/casos` | resumen del caso |
| Tareas | `/crm/tareas` | detalle/acciones de la tarea |
| Rondas | `/crm/rondas` | detalle de la ronda / caso |
| Cotizaciones | `/crm/cotizaciones` | ficha de cotización |
| Pagos | `/crm/pagos` | ficha del pago |
| Recibos | `/crm/recibos` | ficha del recibo |
| Chats | `/crm/chats` | hilo (ya es pantalla completa; en desktop lista + hilo) |

Las subrutas (`/expediente`, `/documentos`, “Nuevo cliente”, etc.) siguen siendo páginas propias.

### Escritorio (`md` y arriba, ~768px)

- El `main` de una lista master-detail ocupa el alto útil (`100dvh - header`) sin scroll de página.
- Columna izquierda (~360–420px): búsqueda, filtros y filas compactas; esa columna sí hace scroll.
- Columna derecha (flex): ficha del ítem seleccionado; scroll propio.
- Sin selección: estado vacío a la derecha (“Elige un cliente”).
- URL compartible: `/crm/clientes?id=<id>`. El primer ítem **no** se auto-selecciona.
- Las URLs actuales `/crm/clientes/[clientId]` (y equivalentes) siguen funcionando: en desktop **redirigen** a `/crm/clientes?id=<id>` (mismo split); en móvil abren la ficha en sheet o a pantalla completa, sin perder el deep link.

### Móvil

- Solo se ve la lista.
- Al tocar una fila se abre un **sheet** (panel a pantalla casi completa, cerrar con X o gesto/atrás).
- Cerrar el sheet quita el `id` de la query y vuelve a la lista.

### Implementación

- Un layout compartido `SplitView` (lista + ficha + sheet).
- Extraer de cada ficha actual un componente de “panel” reutilizable (p. ej. el resumen de cliente) para no duplicar páginas.
- `CrmMain` deja de poner padding vertical de página en estas listas; el split gestiona el alto.
- No usar parallel routes de Next: un `searchParam` `id` es suficiente y más simple.

## Fase 2 — SMTP, preferencias y digest

### Lo que ya existe

- `GET /api/cron/reminders` cada 15 min: tareas con `reminderAt`, tareas vencidas, revisión de caso, revisión de ronda, pagos PENDING. Idempotente por `dedupeKey`.
- `createNotification` escribe in-app y, si CallMeBot está activo, manda WhatsApp a **cada** destinatario activo (antes: un solo teléfono de la org).
- No hay envío de correo hoy.

### Destinatarios WhatsApp (CallMeBot)

Tabla nueva `WhatsappRecipient` (no un JSON ni `phone2`/`key2`):

| Campo | Uso |
| --- | --- |
| `label` | Nombre interno (“Jazmín”, “Principal”) |
| `phone` | E.164, misma validación actual |
| `apiKeyEncrypted` | API key de CallMeBot, cifrada como hoy |
| `enabled` | Apagar sin borrar |
| `sortOrder` | Orden en el formulario |

Tope **4** por organización, validado en servidor (`DomainError`). Teléfono único por org.

`OrganizationSettings.callmebotEnabled` sigue siendo el interruptor global. Si está apagado, **cero** peticiones aunque haya filas activas.

Migración: si la org ya tiene `callmebotPhone` + `callmebotApiKeyEncrypted`, crear una fila `label = "Principal"` y dejar de usar esos dos campos (se eliminan en la misma migrate).

**Envío** (`deliverWhatsapp`):

1. Si `!callmebotEnabled`, return.
2. Cargar destinatarios `enabled` de la org, máx. 4, orden `sortOrder`.
3. Armar el texto **una vez** con `formatWhatsappNotification`.
4. Para cada fila, en **serie**: descifrar key → `sendCallmebotMessage({ phone, apiKey, text })`.
5. Un fallo (red, key inválida) se loguea y **no** aborta el resto.

In-app y correo se crean **una vez**. Solo WhatsApp se multiplica.

**Ajustes:** lista de filas (nombre, teléfono, API key, activo, “Enviar prueba” a esa fila). “Añadir número” se oculta al llegar a 4. Key vacía al guardar = conservar la cifrada. Clientes no aparecen aquí.

### SMTP

Campos nuevos en `OrganizationSettings` (secretos cifrados con el mismo helper que CallMeBot):

- `smtpHost`, `smtpPort`, `smtpUser`, `smtpPasswordEncrypted`, `smtpFrom`, `smtpSecure` (TLS/STARTTLS).
- `digestHour` (0–23, default 8), `digestEnabled` (default true).

En `/crm/configuracion`, sección **Correo**: formulario + botón “Enviar prueba” al email de la org o del usuario.

Si SMTP no está configurado, los correos no se envían (no-op registrado); in-app y WhatsApp siguen.

### Preferencias de notificación (org, OWNER/ADMIN)

Sección **Notificaciones**. Por cada tipo interno:

| Tipo | In-app | Correo al equipo | WhatsApp equipo |
| --- | --- | --- | --- |
| Tarea recordatorio / vencida | siempre | on/off | on/off |
| Revisión de caso / ronda | siempre | on/off | on/off |
| Pago por cobrar | siempre | on/off | on/off |
| Resumen diario | siempre | on/off | on/off |

In-app no se apaga: es el registro canónico. Correo y WhatsApp respetan el toggle. WhatsApp además requiere CallMeBot encendido.

### Digest

- Nuevo `GET /api/cron/digest` (mismo Bearer).
- cron-job.org lo llama **cada hora**. El handler solo envía si, en el timezone de la org, la hora actual es `digestHour` y `digestEnabled`.
- Destinatarios: miembros OWNER y ADMIN activos.
- `dedupeKey`: `digest:<orgId>:<YYYY-MM-DD>`.
- Contenido: tareas de hoy, tareas vencidas, casos/rondas por revisar, pagos pendientes, conteos de clientes activos y casos abiertos. Texto plano (correo y WhatsApp) + notificación in-app con enlace a `/crm/dashboard`.
- Tipo nuevo: `NotificationType.DAILY_DIGEST`.

### Cron-job.org (operación)

Documentar en README:

1. Job `reminders`: `GET https://<host>/api/cron/reminders` cada 15 min, header `Authorization: Bearer <CRON_SECRET>`.
2. Job `digest`: `GET https://<host>/api/cron/digest` cada hora, mismo header.

## Fase 3 — Correos a clientes

Cada plantilla es on/off en la misma sección de Notificaciones. Destinatario: `client.email` (si falta, se omite y se deja rastro en logs, no se inventa un canal).

| Clave | Cuándo | Contenido |
| --- | --- | --- |
| `clientPaymentDue` | Pago PENDING con `dueAt` hoy o vencido | Monto, fecha, nombre, enlace de contacto de la empresa |
| `clientDocsPending` | Hay un `IntakeLink` activo del cliente (o caso) con `useCount < maxUses` y sin `IntakeSubmission` completada, o el intake venció sin usarse | Texto pidiendo completar el intake; enlace público si `FEATURE_PUBLIC_INTAKE` está activo. Si el intake público está apagado, el toggle se muestra pero el job no envía. |
| `clientQuoteSent` | Al marcar cotización como enviada | Folio, total, validez |
| `clientQuoteExpiring` | Cotización SENT por vencer (fecha de validez = hoy o vencida) | Folio, fecha |
| `clientCaseReview` | Caso OPEN con `nextReviewAt` hoy/vencida | Código de caso, fecha |
| `clientRoundReview` | Ronda SENT/WAITING_UPDATE con `expectedReviewAt` hoy/vencida | Número de ronda, caso |

Reglas:

- Un correo por evento por día (`dedupeKey` tipo `email:client:<clientId>:payment:<paymentId>:due`).
- No WhatsApp a clientes.
- Plantillas en español, texto plano, sin HTML rico.
- El cron de `reminders` (cada 15 min) es quien dispara estos correos cuando el toggle está on; no hace falta un tercer job.

## Arquitectura

```
cron-job.org
  ├─ GET /api/cron/reminders  → notificaciones internas + correos cliente (fase 3)
  └─ GET /api/cron/digest     → digest OWNER/ADMIN

createNotification()
  ├─ DB (in-app, dedupeKey)
  ├─ WhatsApp: loop serial de WhatsappRecipient activos (si toggle global)
  └─ email (si toggle + SMTP)  [nuevo]

sendSmtpMail(settings, { to, subject, text })
```

- El envío de correo es un módulo `src/server/notifications/smtp.ts`.
- `createNotification` no envía correo a clientes (ellos no son `User`). Los correos a clientes los manda el cron con `sendSmtpMail` directo.
- Contraseña SMTP cifrada; nunca se devuelve al cliente.

## Errores

- Cron sin `CRON_SECRET` válido: 401.
- SMTP mal configurado o rechazo del servidor: log + no tumbar el resto del job.
- CallMeBot rechaza un número: log + continuar con los demás.
- Destinatario sin key descifrable: skip esa fila.
- Cliente sin email: skip.
- Digest ya enviado hoy: no-op por `dedupeKey`.

## Pruebas

- SplitView: `?id=` selecciona; sin `id` vacío a la derecha; en viewport estrecho el sheet abre y cierra.
- Cron reminders: sigue siendo idempotente.
- Digest: no envía fuera de `digestHour`; segundo hit el mismo día no duplica.
- SMTP: prueba desde Ajustes; si falta host, el botón explica que falta configurar.
- WhatsApp: 2 números activos → 2 peticiones CallMeBot en serie con el mismo texto; 1 desactivado → 1 petición; global off → 0. Prueba por fila. Quinto número rechazado.

## Orden de implementación

1. Master-detail en las 8 listas (SplitView + paneles).
2. Destinatarios WhatsApp (tabla + loop serial + UI) junto con SMTP + preferencias + `/api/cron/digest` + docs de cron-job.org.
3. Correos a clientes desde el cron de reminders.
