# 05 — Riesgos de seguridad y datos

Commit inspeccionado: `9445bff96631083fc875a6dfdbedf5426814ee52`.

No se imprimen secretos. No se probó el despliegue. Donde el hallazgo sale solo del código, el runtime queda `NO VERIFICADO`.

Severidad: crítica (explotable o rompe cobro/aislamiento con el código actual), alta, media, baja.

## Crítica

### C1. El proxy puede tragarse el webhook de Stripe

Evidencia: `auth.config.ts`, callback `authorized`, el bloque que trata `pathname.startsWith("/api/")` como staff. No hay excepción para `/api/webhooks`. La ruta `app/api/webhooks/stripe/[organizationId]/route.ts` rechaza la petición si falta `stripe-signature` y delega en `handleStripeWebhook`, que construye el evento con el secreto de la org.

Efecto: Stripe recibe redirect o 401 y no se crea el pago, o el operador marca cobros a mano y el webhook reintenta. No se observó el HTTP real.

Remedio: PR-SEC-01. La firma sigue siendo la autenticación del webhook. No poner el secreto en el allowlist ni en logs (`console.error` de esa ruta ya imprime solo el mensaje).

Alcance: todas las organizaciones con Checkout.

## Alta

### H1. Retorno de Checkout exige sesión

`/pay/success` y `/pay/cancel` no están en la lista pública. Caen en el final de `authorized`, que exige `auth.user`.

Efecto: el cliente vuelve de Stripe y ve `/login` del staff.

Remedio: mismo PR-SEC-01. Las páginas no deben confirmar el pago por sí solas; el pago lo confirma el webhook.

### H2. El avance compartido exige sesión

`app/a/[token]/page.tsx` autentica el token en `src/server/avance/share.ts` (HMAC, caducidad). El proxy exige sesión antes.

Efecto: el enlace que el staff copia no abre para el cliente.

Remedio: PR-SEC-01. No alargar el trust del token; solo dejar que la página lo valide.

### H3. El PDF de crédito puede salir a OpenRouter

`classifyAndExtractFromPdf` en `src/server/credit-import/extract.ts` envía texto (recorte a unos 28 000 caracteres) y, en la rama de texto escaso, el binario. El system prompt pide nombre, dirección, `dateOfBirth` y `ssnLast4`, y prohíbe el SSN completo en el JSON de vuelta. Esa prohibición no impide que el PDF ya haya salido.

El chat (`src/lib/ai/sanitize.ts`) no cubre este camino.

Remedio: PR-SEC-PII. No adjuntar bytes. Redactar antes del texto. Revisión humana ya existente se mantiene. No afirmar que esto cumple GLBA o CROA.

### H4. El formulario público elige la organización más antigua

`resolvePublicOrganizationId` en `src/server/contact/index.ts`.

Efecto: con dos filas `Organization`, los leads del sitio caen en la primera creada, no en la operadora.

Remedio: PR-SEC-02. `PUBLIC_ORG_ID` en el entorno del despliegue. Rechazar el id que mande el cliente.

Hoy, si solo existe una org, el síntoma no se ve. El diseño igual es frágil.

## Media

### M1. Token de avance de 180 días y sin revocación

`src/server/avance/share.ts`. Un enlace filtrado sigue válido hasta el TTL. El secreto cae en `AUTH_SECRET` o, si faltara, en `FIELD_ENCRYPTION_KEY`.

Remedio posterior: id persistido, TTL más corto, revocar. Exigir `AUTH_SECRET` distinto de la clave de campo.

### M2. Upload firmado sin tamaño

`src/lib/storage/s3.ts` no pone `ContentLength`. `confirm` en `src/server/documents/index.ts` no hace `HeadObject`. Tipos y tope están en `src/lib/storage/policy.ts` (`UPLOAD_MAX_MB`, default 15; PDF, JPEG, PNG).

Remedio: PR-DC-CONFIRM. La política del bucket sigue siendo necesaria; la app no debe ser la única barrera, pero hoy ni siquiera es barrera completa.

### M3. Contacto sin rate limit útil

`app/api/public/contact/route.ts` no usa `RateLimitBucket`. El reto en `src/lib/contact/challenge.ts` incluye los operandos.

Remedio: PR-SEC-02. El intake sí limita (`app/api/public/intake/**`).

### M4. Idempotencia del webhook a medias

Unique de `stripeCheckoutSessionId` en el schema. El handler comprueba y luego inserta. Dos entregas paralelas pueden devolver 500.

Remedio: PR-PY-IDEM, después de C1.

### M5. Retención máxima

`src/server/retention/index.ts` puede borrar documentos por antigüedad, incluidos los que no están en papelera. El cron exige `CRON_SECRET` y comparación en tiempo constante. Eso protege el endpoint, no el dato si el secreto es válido y el número de días está mal.

Remedio: PR-SEC-RET.

### M6. JWT de sesión muy largo

`src/server/auth/session-constants.ts`. La revocación por `sessionVersion` existe y es el control real. Un JWT robado vive hasta que ese contador sube.

Remedio diferido: acortar `maxAge` del portal. No es el primer PR.

### M7. Primera membresía gana

`src/server/auth/session.ts` hace `take: 1`. Un usuario en dos orgs entra a una sola, la que devuelva la query.

Remedio: no construir un switcher hasta el segundo tenant. No “arreglarlo” eligiendo al azar.

### M8. Portal busca email en todas las orgs

`src/server/portal/index.ts`. Con una org no hay choque. Con dos, el mismo email puede autenticar el acceso equivocado si la contraseña coincide.

Remedio: atar el login a la org del enlace de invitación cuando haya más de una org.

### M9. Chat de IA solo pide sesión de organización

`app/api/ai/chat/route.ts`. `VIEWER` puede usarlo. La sanitización quita claves de SSN y deja email y teléfono, a propósito para el staff.

Remedio: permiso explícito. No ampliar herramientas en el mismo cambio.

### M10. Rate limit ausente en login y en el chat

Solo el intake usa `src/server/security/rate-limit.ts`. El límite en MySQL puede competir consigo mismo bajo concurrencia.

Remedio: contacto en PR-SEC-02. Login en un corte aparte. No introducir Redis solo por esto.

## Baja

### L1. Los cron hacen el trabajo en GET

`app/api/cron/reminders`, `digest`, `mails-sync`, `retention`. Es el contrato con el scheduler externo. Fallan cerrados si `CRON_SECRET` no está. Comparación con igualdad en tiempo constante.

Remedio: cuando se cambie el scheduler, pasar a POST. No ahora.

### L2. Borrado permanente de correo

`src/server/mails/index.ts` tras la papelera. Hay confirmación de UI, no una frase escrita.

### L3. Inbound de correo acepta organizationId con el secreto de cron

`app/api/mails/inbound/route.ts`. Si el bearer filtra, se puede elegir la org.

Remedio: resolver la org por el destinatario, no por el body.

### L4. Borrados desiguales

Documentos: soft y luego hard. Clientes: archivo. Ítems de crédito: hard delete. Hay que decirlo en la matriz de retención, no unificarlo de golpe.

### L5. Acoplar HMAC al cifrado de campos

Si `AUTH_SECRET` faltara, avance y el reto de contacto usan `FIELD_ENCRYPTION_KEY`. En un despliegue correcto `AUTH_SECRET` existe. El fallback amplía el radio si una clave se filtra.

## Controles que sí están

- El `organizationId` de las acciones de staff sale de la sesión (`auth.ts`), no de un campo oculto del cliente. Muestreo, no fuzz completo.
- `requirePermission` / `can` en servidor. Los botones no son el control (`permissions.ts`).
- Stripe: firma y comprobación de metadata de org, una vez que la petición entra.
- Descarga de documentos: org y permiso de sensibilidad.
- Intake: token con caducidad, usos y relectura en la transacción.
- Portal: `revokedAt` y `sessionVersion`.
- Cifrado AES-256-GCM de campos sensibles (`FIELD_ENCRYPTION_KEY`).
- Dinero en `Decimal(12,2)`. Folios con `increment` dentro de la transacción (`src/server/folios.ts`).
- Cron y inbound comparan el bearer sin cortocircuito obvio de strings.
- No hay PEM ni `.env` con valores en el árbol de git. Placeholders solo en `.env.example` y textos de UI de configuración.

## Secretos

Si en el futuro aparece un valor real en un diff, no pegarlo en el issue: indicar archivo y tipo (clave de API, webhook, SMTP) y rotar.

`.env.local` existe en el disco de trabajo según gitignore. No se abrió para esta auditoría.

## Qué no se afirma

No se afirma producción lista, ni cumplimiento CROA/GLBA/FCRA, ni que el webhook falle hoy en Vercel. Se afirma que el código del proxy no deja pasar ese pathname sin sesión, y que eso hay que probarlo con un POST anónimo en sandbox.
