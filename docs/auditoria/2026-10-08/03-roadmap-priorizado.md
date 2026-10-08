# 03 — Roadmap priorizado

Base: auditoría de `main` @ `9445bff96631083fc875a6dfdbedf5426814ee52`. La matriz viva es `02-matriz-funcional.csv`.

Después de cada fase implementada:

1. Actualizar la fila (estado, evidencia de prueba, brecha).
2. Ejecutar la prueba indicada en sandbox con datos sintéticos.
3. Dejar la fila en `IMPLEMENTADO SIN PRUEBA` si el comando no se corrió.
4. No desplegar a producción en el mismo paso.

Esfuerzos: supuesto de una persona que ya conoce este repo. Rangos en días de trabajo, no en calendario.

## Conservar

Dashboard, kanban, `markWon`, CRUD de clientes, `ServiceCase` + `CreditCase`, reportes, rondas, cartas, cotizaciones, pagos manuales, documentos, MFA, RBAC y automatizaciones de tareas. No introducir otro ORM ni reescribir el App Router.

## P0 — Seguridad e integridad antes de nuevas pantallas

### P0-1. Allowlist del proxy (PR-SEC-01)

1. Problema. `auth.config.ts` exige sesión staff para todo `/api/` que no sea auth, public, cron, mails o health. El webhook vive en `app/api/webhooks/stripe/[organizationId]/route.ts` y sí lee `stripe-signature`, pero el callback puede rechazar el POST antes. `/pay/success`, `/pay/cancel` y `/a/[token]` caen en “requiere sesión”.
2. Beneficio. Un pago de Stripe puede conciliar y el cliente puede ver el retorno y el avance compartido sin cuenta staff. Es P0 porque bloquea dinero y un enlace ya diseñado.
3. Alcance mínimo. Prefijos `/api/webhooks/stripe/`, `/pay/success`, `/pay/cancel` y `/a/`. Fuera: TTL del avance, OpenRouter, contacto público, idempotencia del webhook.
4. Reutilizar `handleStripeWebhook` y el HMAC de `src/server/avance/share.ts`. No crear otra autenticación.
5. Cambiar `auth.config.ts`. Nuevo `src/server/auth/public-paths.ts`. Nuevo `scripts/smoke/auth-public-paths.ts`. Opcional script npm `smoke:auth-paths`.
6. Sin migración.
7. Sin API nueva. La función pura recibe `pathname` y devuelve `public` o `staff`. El webhook sigue exigiendo firma. `/a/` sigue exigiendo token HMAC.
8. `/pay` y `/a` deben renderizar sin sesión. Error de token inválido sigue siendo el de la página, no un redirect a `/login`.
9. Extraer la función, usarla en `authorized`, cubrir la matriz con el smoke, `npm run lint` en los archivos tocados.
10. Given un pathname `/api/webhooks/stripe/org`, `/pay/success` o `/a/token`, when se evalúa la política, then es público. Given `/api/ai/chat`, `/crm` o `/api/files`, then no es público.
11. Ningún secreto nuevo. Costo: ninguno.
12. Riesgo: abrir de más. El smoke incluye rutas que deben seguir cerradas. Rollback: revertir el commit. El runtime HTTP queda por verificar con un `curl` anónimo en local, sin evento real de Stripe.
13. 0.5–1 día. Un PR.

### P0-2. Organización explícita del contacto y rate limit (PR-SEC-02)

1. Problema. `resolvePublicOrganizationId` en `src/server/contact/index.ts` usa `findFirst` ordenado por `createdAt`. Un segundo tenant recibiría los leads del sitio. El contacto no usa `RateLimitBucket`. El reto matemático lleva los operandos en el token.
2. Beneficio. Los leads no cambian de empresa y el formulario deja de ser trivial de automatizar.
3. Alcance. Variable `PUBLIC_ORG_ID` (nombre, sin valor en el repo) y límite por IP/email reutilizando `src/server/security/rate-limit.ts`. Fuera: CAPTCHA de pago, Meta, plantillas.
4. Reutilizar `submitContactLead` y la tabla de rate limit. No crear otro CRM de leads.
5. Cambiar `src/server/contact/index.ts` y `app/api/public/contact/route.ts`. Documentar el nombre en `.env.example`. Smoke que falle si el id no existe, con org sintética.
6. Sin migración si el id es configuración. Si se prefiere persistir el id en `OrganizationSettings`, una columna nullable y backfill manual en sandbox.
7. El POST público no acepta `organizationId` del body. Lo resuelve el servidor.
8. Si falta la variable, el formulario responde no disponible. No caer en silencio a “la org más vieja”.
9. Leer la variable, buscar la org, aplicar rate limit, ajustar el challenge o sustituirlo por límite, probar.
10. Given dos orgs sintéticas y `PUBLIC_ORG_ID` de la segunda, when llega un contacto, then el lead queda en la segunda. Given muchos POST seguidos, then 429.
11. Confirmar el id de la org operadora fuera del chat, sin pegarlo en git.
12. Si la variable no está en producción el sitio deja de captar hasta configurarla. Despliegue: poner la variable antes del release. Rollback: restaurar el fallback solo como hotfix temporal, no como diseño.
13. 1–2 días. Un PR. Depende de que alguien confirme el id; el código puede mergearse apagado si sin variable responde no disponible.

### P0-3. Dejar de enviar el PDF de crédito al modelo (PR-SEC-PII)

1. Problema. `classifyAndExtractFromPdf` manda texto del buró y, si es escaso, el archivo (`extract.ts`, rama `pdfBytes` ≤ 4.5 MB). El prompt pide `ssnLast4` y fecha de nacimiento. El chat ya sanitiza; este camino no.
2. Beneficio. Un reporte no sale entero a OpenRouter. Sigue habiendo extracción asistida cuando hay texto embebido, con revisión humana.
3. Alcance. Quitar el adjunto multimodal. Redactar patrones de SSN, DOB y número de cuenta antes de `generateText`. Fuera: OCR local nuevo, cambiar el modelo, tocar el chat.
4. Reutilizar `unpdf`, el schema Zod de la propuesta y el paso de confirmación que ya existe. No confirmar el reporte sin una persona.
5. Cambiar `src/server/credit-import/extract.ts` y, si hace falta, `src/lib/ai/sanitize.ts`. Extender `scripts/smoke/ai-sanitize.ts` o el smoke de importación que no llama a la red.
6. Sin migración. Las propuestas ya guardadas no se reescriben.
7. La propuesta sigue siendo JSON validado. Si el texto redactado no alcanza, el job termina en revisión manual con warning, no en un segundo envío del binario.
8. La UI de importación ya advierte revisión. Añadir un warning estable: “no se adjuntó el PDF; completa a mano lo que falte”.
9. Redactar, borrar la rama multimodal, prueba unitaria del redactor con SSN sintético, lint.
10. Given un texto con `123-45-6789`, when se prepara el prompt, then ese número no está. Given texto escaso, when se clasifica, then no se llama con `type: file`.
11. Sigue haciendo falta `OPENROUTER_API_KEY` para la parte de texto. Sin clave, el flujo ya lanza `DomainError`.
12. Empeora la extracción de PDF escaneados. Es aceptable: mejor carga manual que filtrar el archivo. Rollback: revertir, sabiendo que vuelve el envío del binario.
13. 1–2 días. Un PR, después de SEC-01.

## P1 — Flujo operativo completo y datos limpios

### P1-1. Importación con preview y duplicados (PR-CL-IMPORT)

1. Problema. `onImport` trata todo archivo como texto. No hay dry-run ni dedupe. Fondify separa create, restore, exists y no_email; esa separación sí le sirve a J&H. El formato Dispute Fox no es requisito.
2. Beneficio. Una carga no duplica la cartera ni mete basura.
3. Alcance. CSV con encabezados, preview y confirmación. XLSX solo si se añade un parser mantenido; si no, la UI debe decir CSV y rechazar el otro MIME. Fuera: merge (P1-2) y migración de disputas ajenas.
4. Reutilizar `importClientsCsv` como ejecución final, no como primer paso ciego.
5. Cambiar `src/actions/clients.ts` y `src/components/clients/clients-action-bar.tsx`. Nuevo módulo `src/server/clients/import-preview.ts`.
6. Índice único no se puede imponer ya: hoy hay duplicados posibles. Primero detectar y reportar. Un unique parcial queda para cuando la cartera sandbox esté limpia.
7. Acción `previewClientImport` de solo lectura y `commitClientImport` con permiso `clients.create`. El payload no incluye filas de más de N (definir 500 en el servidor).
8. Estados: vacío, errores de columna, preview con conteos, confirmación, resultado. Deshabilitar el botón mientras `pending` (ya hay `startTransition`).
9. Parser, matcher por email normalizado, UI de preview, commit, smoke con CSV sintético.
10. Given un CSV con email repetido en la org, when se previsualiza, then la fila sale `exists` y no se crea hasta decidir. Given un `.xlsx`, when se selecciona, then error claro si el parser no está.
11. Ningún servicio externo.
12. Un commit a medias puede crear la mitad. Hacerlo en transacción por lote y devolver los errores por fila. Rollback de código no borra filas ya creadas: el smoke usa org desechable.
13. 2–4 días. Un PR.

### P1-2. Unir expedientes de verdad (PR-CL-MERGE)

1. Problema. El modal de `agency-client-detail.tsx` declara que el merge no existe.
2. Beneficio. Se corrige un duplicado sin perder reportes, rondas y pagos.
3. Alcance. Mover `ServiceCase`, documentos, notas y tareas del cliente origen al destino y archivar el origen. Fuera: deshacer automático y unir dos orgs.
4. Reutilizar archivo de cliente y `ActivityLog` / `AuditLog`. No dejar el modal como está.
5. Nuevo `src/server/clients/merge.ts` y acción en `src/actions/clients.ts`. Cambiar el modal para llamar a esa acción.
6. Transacción Prisma. Sin columnas nuevas si las FK ya apuntan a `Client`. Comprobar cada relación con `onDelete` antes de borrar.
7. Permiso `clients.edit`. Prohibido cruzar `organizationId`. Confirmación con el nombre del destino, no solo un click.
8. Error si el origen y el destino son el mismo. Éxito: navegar al destino y mostrar el origen archivado.
9. Inventariar FKs, transacción, UI, smoke de dos clientes sintéticos.
10. Given origen con un reporte y destino vacío, when se une, then el reporte cuelga del destino y el origen queda `ARCHIVED`.
11. Ninguno.
12. Irreversible en la práctica. Exigir confirmación. Rollback de código no separa datos ya unidos: probar solo en sandbox.
13. 3–5 días. Después de P1-1. Un PR.

### P1-3. Calificación con datos del reporte (PR-AN-QUAL)

1. Problema. `mapClientToFondifyStatus` mapea `ClientStatus`. Un lead nuevo aparece como estructuración aunque no haya reporte.
2. Beneficio. La ficha distingue estado comercial y lectura de crédito. El estimado de fondeo deja de parecer una decisión.
3. Alcance. Función pura sobre snapshots e ítems negativos, con resultado `sin_datos | revision | heuristica`. Fuera: umbrales 720/10 % como ley, y ofertas de afiliado.
4. Reutilizar `getClientActionPlan`. El mapper actual puede quedar solo como filtro de lista comercial, con otro nombre, para no mentir en el pill de crédito.
5. Cambiar `src/lib/fondify/status.ts` o sustituirlo por `src/server/credit-reports/qualification.ts` y los paneles de `agency-client-detail.tsx`.
6. Sin guardar la calificación como verdad permanente en la primera versión. Calcular al leer. Persistir después si operación lo pide.
7. Solo lectura. Permiso `creditReports.view`.
8. Empty: “sin reporte, no hay calificación”. Nunca “aprobado”.
9. Reglas mínimas documentadas en código (por ejemplo: negativos abiertos → no “listo”), prueba con fixtures, copy de UI.
10. Given solo status ACTIVE y cero reportes, when se abre la ficha, then no muestra listo para fondeo por el status. Given un snapshot sintético, then el texto dice estimado.
11. Ningún buró externo.
12. Cambiar el pill mueve clientes de columna. Avisar en el PR y no migrar status de `Client`.
13. 2–3 días.

### P1-4. Retención que no borre de más (PR-SEC-RET)

1. Problema. `src/server/retention/index.ts` puede hard-deletear documentos por antigüedad, no solo por `deletedAt`.
2. Beneficio. Un número mal puesto no vacía el bucket.
3. Alcance. Purgar documentos ya soft-deleted y vencidos. Fuera: borrar clientes.
4. Reutilizar el cron `app/api/cron/retention/route.ts` y el secreto existente.
5. Cambiar `src/server/retention/index.ts` y el smoke `sprint6` si afirma lo contrario.
6. Sin migración si `deletedAt` y `purgeAfter` ya existen en `Document`.
7. El cron sigue con Bearer `CRON_SECRET`.
8. La UI de borrado de documento no cambia.
9. Ajustar el where, smoke con documento vivo antiguo que debe sobrevivir y otro en papelera que debe purgarse.
10. Given un PDF sintético de hace 400 días sin `deletedAt`, when corre la retención, then sigue. Given uno con `purgeAfter` vencido, then se borra el objeto y la fila queda marcada.
11. S3 de sandbox.
12. Rollback del código no restaura objetos ya borrados. Por eso el smoke va primero.
13. 1 día.

### P1-5. Upload con tamaño comprobado (PR-DC-CONFIRM)

1. Problema. La URL firmada no fija `ContentLength` y `confirm` no comprueba el objeto.
2. Beneficio. El límite `UPLOAD_MAX_MB` se cumple aunque la política del bucket sea laxa.
3. Alcance. Firma y confirmación. Fuera: nuevos tipos MIME.
4. Reutilizar `src/lib/storage/s3.ts` y `src/server/documents/index.ts`.
5. Esos dos archivos y el smoke de documentos.
6. Sin migración.
7. Mismos permisos `documents.upload`.
8. Error legible si el objeto no existe o pesa de más. No crear `Document` huérfano.
9. Pasar el tamaño al firmar, `HeadObject` en confirm, rechazar.
10. Given un PUT mayor que el límite, when se confirma, then no hay fila.
11. Bucket sandbox.
12. Clientes que ya arman el PUT sin header pueden fallar. Revisar el upload del staff, del portal y del intake en el mismo PR.
13. 1–2 días.

### P1-6. Idempotencia del webhook (PR-PY-IDEM)

1. Problema. Dos entregas simultáneas del mismo `checkout.session` pueden chocar con el unique y devolver 500.
2. Beneficio. Stripe no reintenta como si el cobro no se hubiera registrado.
3. Alcance. Capturar la violación unique y responder `{ handled: true }` solo si el pago de esa sesión ya existe. Fuera: reembolsos nuevos.
4. Reutilizar `handleStripeWebhook`. Depende de que PR-SEC-01 deje pasar el POST.
5. `src/server/payments/stripe.ts`.
6. Sin migración: el unique ya está en `Payment.stripeCheckoutSessionId`.
7. Sigue la firma. No marcar pagado si la firma falla.
8. Sin UI.
9. Test del conflicto con dos llamadas secuenciales simuladas; la segunda no crea otro recibo.
10. Given un evento ya aplicado, when se repite, then 200 y un solo `Payment`.
11. Stripe CLI contra sandbox, sin tarjeta real de un cliente.
12. Tragar cualquier error de unique ocultaría otro choque. Filtrar por el campo de sesión.
13. 0.5–1 día. Después de SEC-01.

## P2 — Experiencia, portal y calidad

### P2-1. Flags de ronda (método y alcance)

Añadir `scope` y `method` en el ítem de disputa o en una tabla hija, no un rediseño de `CreditRound`. Default: fuera de alcance. La comparación sigue mostrando antes/después sin la palabra “funcionó por la disputa”. Migración aditiva nullable. UI en el workspace de avance que ya está embebido en la ficha. 3–4 días. Permiso `disputes.manage`.

### P2-2. Score Plan como función pura etiquetada

Extraer el cálculo de utilización que ya está en la ficha a `src/lib/credit/utilization-sim.ts`, con pruebas y el texto “estimado, no es un score de buró”. No portar la función `P(r)` de Fondify: es una heurística de otro producto. 1–2 días. Sin migración.

### P2-3. Contratos y portal con smoke

Cubrir `signContract` y el login de portal con datos sintéticos. No cambia el modelo. Antes hay que tener `FEATURE_CLIENT_PORTAL=true` en el sandbox. 1–2 días.

### P2-4. Invitación sin secreto en la respuesta permanente

`inviteUser` debe crear el usuario y enviar el alta por el SMTP de la org, o mostrar la contraseña una sola vez en la sesión del admin si SMTP no está. No dejar el secreto en un toast persistente ni en logs. 1–2 días. Depende de SMTP de sandbox.

### P2-5. Plantillas mínimas

Un modelo `MessageTemplate` por organización (canal email o whatsapp, cuerpo con huecos de nombre) reutilizando `sendMail` y Whapi. Sin campañas ni bajas masivas en este corte. 3–4 días.

### P2-6. README alineado al código

Quitar Meta y atribución como funciones vivas. Documentar el flag de consultas como opt-out (`=== "false"`). Aclarar que Casos no está en la barra principal de escritorio. PR solo de `README.md`. 0.5 día. Puede ir en cualquier momento; no bloquea P0.

### P2-7. Permiso del chat de IA

`app/api/ai/chat/route.ts` debe llamar a un permiso existente o a uno nuevo `ai.use` negado a `VIEWER`. 0.5–1 día.

### P2-8. Enlace de avance revocable

Guardar el id del token, bajar el TTL y permitir revocar. Hoy son 180 días y solo HMAC (`src/server/avance/share.ts`). Hacerlo después de abrir `/a/` en SEC-01. 1–2 días. Migración aditiva.

## P3 — No construir por imitación

- Afiliados, comisiones, producto consumidor, IDIQ, Firebase, página imán y SaaS de cupos: `NO APLICA`.
- SMS (AU-003) y APIs de buró (AU-006): solo si el negocio trae proveedor y base de cumplimiento. Hasta entonces, PDF manual con revisión.
- CI: un workflow de lint más el smoke sin base (`ai-sanitize`, `auth-public-paths`, reglas de fechas). No es P0.
- Selector de organización: solo cuando exista un segundo tenant real.

## Orden

```text
PR-SEC-01 allowlist
  → PR-SEC-02 org del contacto + rate limit
  → PR-SEC-PII sin PDF crudo
  → PR-SEC-RET retención
  → PR-PY-IDEM webhook
  → PR-DC-CONFIRM uploads
  → PR-CL-IMPORT
  → PR-CL-MERGE
  → PR-AN-QUAL
  → P2 en el orden de arriba
```

P2-6 (README) puede adelantarse: no toca runtime.
