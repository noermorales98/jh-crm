# AU-004 — WhatsApp a clientes vía Whapi.Cloud

Fecha: 2026-09-16  
Proyecto: J&H CRM (`jh-crm`)  
Estado: diseño aprobado en chat (enfoque A); pendiente de tu revisión de este archivo

## Problema

El CRM ya avisa al **equipo** por WhatsApp (CallMeBot) y al **cliente** por correo (AU-001). Falta un canal de WhatsApp hacia el **cliente** para los mismos eventos operativos (pago, documentos, cotización, revisión de caso/ronda).

## Decisiones cerradas

- Proveedor: **[Whapi.Cloud](https://whapi.cloud/es/docs)** (sesión de dispositivo vinculado + API HTTP).
- Envío de texto: `POST https://gate.whapi.cloud/messages/text` con `Authorization: Bearer <token>` y JSON `{ "to": "<dígitos internacionales sin +>", "body": "<texto UTF-8>" }` ([docs](https://support.whapi.cloud/help-desk/sending/send-text-message.md)).
- **CallMeBot permanece solo para el equipo.** No se usa CallMeBot hacia `Client.phone`.
- Alcance: **paridad con AU-001** — mismos 6 eventos + toggles independientes `whatsappClient*`.
- Destino: `Client.phone` normalizado a dígitos E.164 **sin** el signo `+` (formato Whapi). Sin teléfono → skip silencioso.
- Token: `whapiTokenEncrypted` en `OrganizationSettings` (mismo `encrypt`/`decrypt` que SMTP).
- Interruptor global: `whapiEnabled` (si está off → cero peticiones Whapi a clientes).
- Dedupe: claves `wa:client:…` en `Notification` del OWNER (espejo de `email:client:…`); `skipWhatsapp: true` / `skipEmail: true` en esa fila para no disparar CallMeBot/SMTP del staff.
- Disparos: mismos puntos que email — cron `reminders` (`sendClientWhatsappForOrg`) + `notifyClientQuoteSent` (WhatsApp) al marcar cotización enviada.
- Ritmo en batch del cron: delay **≥ 1.5 s** entre envíos Whapi de la misma corrida (mitigar riesgo de spam / restricción de cuenta).
- UI: sección en Configuración (junto a CallMeBot / notificaciones cliente): enable, token, base URL opcional, 6 toggles, botón «Enviar prueba».
- Prueba: envía un mensaje fijo al número de prueba o al teléfono de un cliente elegido; no escribe dedupe de negocio.
- Smoke: sin token → skip/error limpio; con mocks o token de test → `sendWhapiText` construye request correcto; dedupe no reenvía.

## Fuera de alcance (este MVP)

- Webhooks entrantes / inbox de respuestas en el CRM.
- Medios, grupos, stickers, plantillas Meta Cloud API.
- AU-003 SMS.
- AU-005 pagos online (siguiente ciclo tras cerrar AU-004).
- Exigir `sms_consent` / consentimiento WA explícito en attribution (se documenta como mejora; MVP usa teléfono del expediente como hoy el email usa `Client.email`).
- Sustituir CallMeBot del equipo por Whapi.

## Modelo de datos (aditivo)

En `OrganizationSettings`:

| Campo | Tipo | Default | Notas |
| --- | --- | --- | --- |
| `whapiEnabled` | Boolean | false | Master switch clientes |
| `whapiTokenEncrypted` | String? Text | null | Bearer token cifrado |
| `whapiBaseUrl` | String? | null | Default runtime `https://gate.whapi.cloud` |
| `whatsappClientPaymentDue` | Boolean | false | |
| `whatsappClientDocsPending` | Boolean | false | |
| `whatsappClientQuoteSent` | Boolean | false | |
| `whatsappClientQuoteExpiring` | Boolean | false | |
| `whatsappClientCaseReview` | Boolean | false | |
| `whatsappClientRoundReview` | Boolean | false | |

Migración Prisma MySQL aditiva; sin DROP.

## Módulos

| Archivo | Rol |
| --- | --- |
| `src/server/notifications/whapi.ts` | `normalizeWhapiTo`, `isWhapiConfigured`, `sendWhapiText` |
| `src/server/notifications/client-whatsapp.ts` | Paridad con `client-emails.ts`: claim+send, 6 eventos, delay |
| `src/server/config` + actions + settings UI | Persistencia y formulario |
| `app/api/cron/reminders/route.ts` | Tras emails de cliente, llamar `sendClientWhatsappForOrg` |
| `scripts/smoke/client-whatsapp-smoke.ts` | Verificación |

## Formato del mensaje

Texto plano con formato WhatsApp ligero (`*negrita*` en marca):

```text
*J&H Multiservices LLC*
Hola {nombre},

{cuerpo del evento}

{teléfono empresa si existe}
```

Sin HTML. Enlaces absolutos si hay portal/CRM público relevante (opcional; mismo criterio que email).

## Seguridad y riesgos

- No loguear el Bearer token ni la URL con secretos.
- Whapi **no** es la Cloud API oficial de Meta: riesgo de invalidación de sesión o límites de cuenta si se abusa del envío. Documentar en UI/README: calentamiento, re-vincular QR si cae la sesión, no blasting.
- Token solo OWNER/ADMIN en settings (mismos permisos que SMTP/CallMeBot).

## Criterios de done

1. Migración deploy + `prisma generate`.
2. Settings guardan token/toggles; prueba envía (o falla con `DomainError` claro).
3. Con toggle + token + teléfono: evento dispara WhatsApp; segunda corrida del mismo dedupe → skip.
4. CallMeBot staff no cambia de comportamiento.
5. Smoke verde; docs backlog AU-004 + PENDING + roadmap Fase 7.
6. Commit estilo historia; push solo si se pide.

## Orden posterior

Tras merge de AU-004 → diseño/plan de **AU-005** (pagos online / consulta Stripe stub → real).
