# 06 — Checklist de QA

Ámbito: sandbox. Datos sintéticos (nombres ficticios, email `sintetico+…@example.com`, SSN de prueba que no sea un número real de persona, PDF generado en el momento).

No ejecutar contra producción. No cobrar con tarjeta de un cliente. No enviar disputas, contratos ni WhatsApp a números reales.

Leyenda: cada caso anota el rol y el resultado esperado. Un caso no hecho queda en blanco; no se marca como pasado por existir la pantalla.

## Preparación

- [ ] `DATABASE_URL` apunta a MySQL sandbox, no a producción.
- [ ] `PUBLIC_ORG_ID` solo después de PR-SEC-02; hasta entonces no dar por bueno el formulario público.
- [ ] S3 de prueba, claves de Stripe de test, SMTP de captura (Mailpit o equivalente).
- [ ] Dos usuarios staff: uno `VIEWER` y uno `SPECIALIST`. Un `OWNER` para auditoría y usuarios.
- [ ] Portal e intake apagados (`false`) y, en una segunda pasada, encendidos.
- [ ] Registrar comando, exit code y SHA. Actualizar `02-matriz-funcional.csv`.

## Auth y proxy (PR-SEC-01)

Rol: anónimo.

- [ ] POST `/api/webhooks/stripe/org_sintetica` sin firma → 400, no redirect a `/login`.
- [ ] POST con firma inválida → 400.
- [ ] GET `/pay/success` y `/pay/cancel` → 200 sin cookie de staff.
- [ ] GET `/a/token-invalido` → error de la página de avance, no `/login`.
- [ ] GET `/crm` sin sesión → login.
- [ ] GET `/api/files/upload-url` sin sesión → no 200.
- [ ] GET `/api/ai/chat` sin sesión → no 200.

Rol: portal (cuando el flag esté on).

- [ ] Cookie de portal no abre `/crm`. Redirige a `/portal`.

## Aislamiento

Dos orgs sintéticas, A y B.

- [ ] Staff de A no lee el cliente de B por URL directa (`/crm/clientes/{id}`).
- [ ] Staff de A no descarga el documento de B (`/api/files/{id}/download`).
- [ ] Staff de A no registra un pago contra el cliente de B.
- [ ] `VIEWER` de A no ejecuta `archiveClient` (la acción responde error, no solo oculta el botón).
- [ ] `VIEWER` no abre `sensitive.view` (SSN enmascarado o denegado).
- [ ] `STAFF` no anula un recibo (`receipts.void` es ADMIN/OWNER).
- [ ] `SPECIALIST` sí descarga un documento sensible de su org.

## Clientes, leads, casos

- [ ] Alta manual, búsqueda por nombre y filtro de status.
- [ ] Archivar y comprobar que no aparece en el listado por defecto.
- [ ] Kanban: mover etapa y refrescar. La etapa persiste.
- [ ] Marcar ganado: nace `Client` activo y un `ServiceCase`. Anotar qué vertical quedó.
- [ ] Segunda expediente para la misma persona, otro servicio. No se duplica la persona.
- [ ] Siguiente acción y tarea en la cola del dashboard.
- [ ] Modal “Unir expedientes”: hoy debe decir que no está implementado. Después de PR-CL-MERGE, el caso de dos clientes sintéticos mueve el reporte y archiva el origen.
- [ ] Importar un CSV sintético. Hoy: solo texto. Después del PR: preview sin writes, duplicado marcado `exists`, fila sin email no se crea. Un `.xlsx` no se acepta hasta que el parser exista.

## Crédito, rondas, cartas

- [ ] Crear reporte MANUAL con scores sintéticos y un ítem negativo. Números de cuenta enmascarados en la UI.
- [ ] Subir un PDF sintético de una página con texto embebido. La propuesta no se guarda sola: hace falta confirmar.
- [ ] PDF escaneado (sin texto): después de PR-SEC-PII no sale un adjunto al modelo; queda warning de revisión.
- [ ] Buscar en logs locales que el SSN sintético del fixture no se imprima.
- [ ] Cliente ACTIVE sin reportes: el pill no debe decir “listo para fondeo” como si fuera un resultado de crédito (después de PR-AN-QUAL). Antes de ese PR, registrar el comportamiento actual como defecto conocido.
- [ ] Score Plan: el texto no promete puntos de FICO.
- [ ] Ronda con ítems, carta en borrador, finalizar, descargar PDF, marcar enviada a mano. No hay envío postal automático.
- [ ] Comparación entre dos reportes sintéticos: muestra diferencias y no afirma que la disputa causó el cambio.

## Dinero

- [ ] Cotización con dos líneas. El total cuadra a centavos. PDF descarga.
- [ ] Aceptar cotización. No se marca pagada por aceptarla.
- [ ] Pago manual en efectivo sintético: nace recibo con folio.
- [ ] Segundo pago no reutiliza el folio.
- [ ] Anulación de recibo con ADMIN. VIEWER no puede.
- [ ] Plan de cuotas: una cuota pendiente no pasa a pagada sola.
- [ ] Stripe test: crear sesión, no completar con tarjeta real de cliente. Tras SEC-01 y un evento firmado de prueba (Stripe CLI), un solo `Payment`. Reenviar el mismo evento: sigue habiendo un solo pago.
- [ ] Consultas: con `FEATURE_CONSULTATION_PAYMENTS=false` no hay estado pagado automático.

## Documentos

- [ ] Upload PDF pequeño: aparece y descarga solo la org dueña.
- [ ] Archivo `.exe` o tipo no listado: rechazo.
- [ ] Por encima de `UPLOAD_MAX_MB`: rechazo en confirm (después de PR-DC-CONFIRM).
- [ ] Soft delete: deja de listarse. El cron de sandbox no borra un documento vivo antiguo (después de PR-SEC-RET).

## Comunicaciones y equipo

- [ ] Invitación: anotar si la contraseña temporal aparece en la respuesta. Eso es defecto hasta PR-TM-INVITE. No reenviar esa contraseña por chat.
- [ ] MFA: enrolar TOTP de prueba, login sin código falla, con código entra.
- [ ] Correo: solo buzón sandbox. Sync IMAP no apunta a un buzón personal.
- [ ] WhatsApp: no disparar a un teléfono real. El smoke de formato puede correr sin red si ya está escrito así.
- [ ] Contacto público: después de SEC-02 cae en la org configurada. Ráfaga de POST → 429.

## Portal e intake

Pasada 1, flags en false:

- [ ] `/portal` no opera como producto abierto.
- [ ] `/intake/token` no acepta un envío.

Pasada 2, flags en true, tokens sintéticos:

- [ ] Token vencido y token revocado no envían.
- [ ] Token válido envía una vez y respeta `maxUses`.
- [ ] Invitación de portal, login, revoke, la sesión vieja deja de valer (`sessionVersion`).
- [ ] Firma de contrato de prueba en el portal. No usar una firma de una persona real.

## Automatizaciones

- [ ] Cron sin bearer → 401.
- [ ] Cron con bearer de sandbox: recordatorio y digest no envían fuera del SMTP de prueba.
- [ ] Alta de lead crea la tarea prevista por `onNewLead`.

## Accesibilidad y estados (muestra, no auditoría HIG completa)

- [ ] Lista de clientes vacía tiene mensaje, no una tabla rota.
- [ ] Botón de importar y de archivar no dispara dos veces mientras `pending`.
- [ ] Error de servidor se muestra en texto, no solo en consola.
- [ ] Ancho móvil de la ficha de cliente: el modal de merge y el de cotización se pueden cerrar.

## Regresión mínima antes de dar por cerrada una fase

- [ ] `npx eslint` de los archivos del PR.
- [ ] Smoke nuevo del PR en sandbox.
- [ ] Smokes sin red que ya no necesitan DB: `smoke:ai-sanitize`, y `smoke:auth-paths` cuando exista.
- [ ] Fila de la matriz actualizada con el comando y el SHA.

## Fuera de este checklist

- Carga de un reporte de buró real.
- Firma con validez legal.
- Campañas, afiliados, Meta Lead Ads.
- Afirmar eliminación de negativos o aprobación de fondeo.
