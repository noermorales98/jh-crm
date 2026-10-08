# 04 — Plan de implementación por PR

Cada PR sale de `main`, no reescribe módulos y no se despliega solo. Al mergear, actualizar la fila citada de `02-matriz-funcional.csv`.

Los comandos existen o se añaden en el propio PR. No usar `npm run build` como prueba: ese script puede lanzar `scripts/migrate-on-deploy.mjs`.

Datos: org, clientes y PDF sintéticos. Nada de SSN real, contratos firmados por clientes ni cobros live.

## PR-SEC-01 — Rutas que el proxy bloquea

Fila: `SEC-C1`. También desbloquea la verificación de `PY-002` y `SEC-M1`, sin cerrarlas.

Precondición: ninguna.

Archivos a cambiar:

- `auth.config.ts`: `authorized` consulta la función pura.
- Nuevo `src/server/auth/public-paths.ts`.
- Nuevo `scripts/smoke/auth-public-paths.ts`.
- `package.json`: script `smoke:auth-paths` sin `--env-file` si no lee secretos.

Archivos que no se tocan: `src/server/payments/stripe.ts`, `src/server/avance/share.ts`, esquema Prisma.

Pasos:

1. Definir `isAnonymousPath(pathname: string): boolean`.
2. Devolver true solo para los prefijos ya públicos más `/api/webhooks/stripe/`, igual a `/pay/success`, igual a `/pay/cancel`, y prefijo `/a/`.
3. Mantener false para `/api/ai/chat`, `/api/files`, `/api/crm/search`, `/crm`, `/portal` (el portal tiene su propia rama).
4. Sustituir las condiciones duplicadas de `authorized` solo donde sea un cambio mecánico seguro. No relajar `/crm`.
5. Smoke: lista de pathnames esperados. Exit code 1 si alguno falla.
6. `npx tsx scripts/smoke/auth-public-paths.ts`
7. `npx eslint auth.config.ts src/server/auth/public-paths.ts scripts/smoke/auth-public-paths.ts`

Aceptación:

- Given `/api/webhooks/stripe/org_sintetica`, then público.
- Given `/pay/success` y `/pay/cancel`, then público.
- Given `/a/token-sintetico`, then público.
- Given `/api/files/upload-url` y `/crm/clientes`, then no público.

Después, en local y sin Stripe live: `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/webhooks/stripe/org` debe ser 400 por falta de firma, no 307 a `/login`. Si sigue siendo redirect, la fila no pasa a probada.

Rollback: revertir el PR.

## PR-SEC-02 — Contacto atado a una organización

Fila: `LD-002`.

Archivos:

- `src/server/contact/index.ts`: borrar el fallback a la org más antigua.
- `app/api/public/contact/route.ts`: rate limit.
- `.env.example`: nombre `PUBLIC_ORG_ID` vacío, con comentario. No poner un id real.
- Smoke con base sandbox, no contra producción.

Pasos:

1. Si `PUBLIC_ORG_ID` falta o la org no existe, `DomainError` de formulario no disponible.
2. Ignorar cualquier `organizationId` que venga en el JSON.
3. Reutilizar `consumeRateLimit` (o el helper ya exportado en `src/server/security/rate-limit.ts`) con clave IP + email.
4. Probar con dos orgs sintéticas.

Aceptación: el lead queda en la org configurada; el POST 21 en una ventana corta responde 429; sin variable no hay write.

Rollback: revertir. Hasta configurar la variable, la captación web queda apagada a propósito.

## PR-SEC-PII — Extracción sin binario

Fila: `CR-002` y `SEC-H3`.

Archivos:

- `src/server/credit-import/extract.ts`
- `src/lib/ai/sanitize.ts` si el redactor vive ahí
- Smoke sin red: el redactor y la ausencia de la rama `type: "file"`

Pasos:

1. Función `redactBureauText` probada con `123-45-6789` y una fecha de nacimiento sintética.
2. Eliminar el bloque que adjunta `pdfBytes`.
3. Si `extract.mode !== "text"` o el texto útil es corto, devolver propuesta vacía con warning de revisión manual y no llamar a OpenRouter.
4. Confirmar que el job existente sigue en estado revisable por una persona.

Aceptación: un unitario demuestra que el SSN sintético no está en el string que se enviaría. No hace falta una clave real para ese unitario.

Rollback: revertir. No reenviar PDFs históricos.

## PR-SEC-RET — Retención

Fila: `CL-006` / `SEC-M5`.

Archivo: `src/server/retention/index.ts`. Ajustar el smoke de sprint 6 solo si el escenario queda en contra.

El `where` del purge incluye soft-delete vencido. Un documento sin `deletedAt` no entra, aunque sea antiguo.

Smoke en MySQL sandbox. No apuntar `DATABASE_URL` a producción.

## PR-PY-IDEM — Webhook duplicado

Fila: `SEC-M4`. Depende de PR-SEC-01.

Archivo: `src/server/payments/stripe.ts`.

Ante P2002 de Prisma sobre `stripeCheckoutSessionId`, si el pago existe, responder handled. No capturar el resto de unique violations.

Smoke: dos llamadas a la función de dominio con el mismo id sintético, firma ya validada en un helper. No usar un webhook secret de producción.

## PR-DC-CONFIRM — Tamaño del objeto

Fila: `SEC-M2`.

Archivos: `src/lib/storage/s3.ts`, `src/server/documents/index.ts`, y los tres clientes de upload (staff, portal, intake) si omiten `Content-Length`.

`HeadObject` compara tamaño y content-type con la política de `src/lib/storage/policy.ts`. Si falla, no se inserta `Document`.

## PR-CL-IMPORT — Preview

Filas: `CL-002`, `CL-003`.

Archivos: `src/actions/clients.ts`, `src/components/clients/clients-action-bar.tsx`, nuevo `src/server/clients/import-preview.ts`.

Contrato:

- Preview no escribe.
- Commit escribe en una transacción.
- Email normalizado (`trim` + minúsculas) marca `exists` dentro de la misma organización.
- Sin email: fila `no_email`, no se crea.
- MIME distinto de CSV: error, hasta que exista parser XLSX.

Smoke: CSV de tres filas sintéticas (nueva, duplicada, sin email).

## PR-CL-MERGE — Unir

Fila: `CL-004`.

Nuevo `src/server/clients/merge.ts`. El modal deja de ser un texto estático.

Antes de codear, listar en el PR las FKs hacia `Client` leídas de `schema.prisma` (casos, documentos, notas, tareas, pagos, cotizaciones, contratos, portal, intake). Mover las que deban sobrevivir. Archivar el origen. Escribir `AuditLog`.

Confirmación UI con el nombre destino. Prohibido si `organizationId` difiere.

Smoke: dos clientes sintéticos, un `CreditReport` en el origen, cero en el destino.

## PR-AN-QUAL — Calificación

Fila: `AN-002`.

Nueva función de solo lectura. El pill de crédito no usa `mapClientToFondifyStatus` para afirmar reparación o fondeo. El filtro de lista por status comercial puede conservar el mapper si el rótulo dice “estado del cliente” y no “calificación de crédito”.

Copy obligatorio en el estimado: no es una aprobación ni una oferta.

## PR-DOCS-README — Alinear el README

Filas: `LD-003`, `NAV-001`, y el comentario de `FEATURE_CONSULTATION_PAYMENTS` en `.env.example`.

Solo markdown y el comentario del example. No cambiar la semántica del flag en este PR: hoy bloquea solo cuando el valor es `"false"`. El comentario debe decir eso, no “si true y hay pasarela”.

## PRs posteriores (P2)

No abrirlos hasta cerrar P0 y actualizar la matriz.

| PR | Fila | Núcleo |
| --- | --- | --- |
| PR-RD-FLAGS | RD-001 | Columnas nullable `scope` y `method` en el ítem de disputa |
| PR-SCORE-SIM | AN-003 | Función pura de utilización y copy de estimado |
| PR-CT-SMOKE | CT-001 | Smoke de plantilla y firma sintética |
| PR-TM-INVITE | TM-001 | Alta por SMTP o secreto de un solo uso |
| PR-TPL | CM-003 | `MessageTemplate` mínimo |
| PR-AI-PERM | SEC-M9 | Permiso en `app/api/ai/chat/route.ts` |
| PR-AVANCE-REVOKE | SEC-M1 | Token con id y revocación |

## Definición de hecho de cada PR

- Diff limitado a los archivos del corte.
- Prueba del corte ejecutada y pegada en la descripción (comando y exit code).
- Fila de la matriz actualizada en el mismo PR o en un commit inmediato de docs.
- Sin `.env`, sin dumps, sin PDF de clientes.
- Rollback descrito en una frase.
