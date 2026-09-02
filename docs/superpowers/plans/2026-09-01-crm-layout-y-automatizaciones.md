# Layout master-detail y automatizaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Listas del CRM en master-detail (menos scroll) y automatizaciones: SMTP, digest diario a OWNER/ADMIN, correos a clientes configurables, WhatsApp solo al equipo, jobs para cron-job.org.

**Architecture:** Un `SplitView` compartido lee `?id=` y reparte lista/ficha (sheet en móvil). Las fichas actuales se extraen a paneles reutilizables. El cron de reminders se extiende; un segundo endpoint `/api/cron/digest` se autolimita por hora local. El correo sale por SMTP cifrado en `OrganizationSettings`.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 6 / MySQL, nodemailer para SMTP, CallMeBot existente, cron-job.org + `CRON_SECRET`.

**Spec:** `docs/superpowers/specs/2026-09-01-crm-layout-y-automatizaciones-design.md`

## Global Constraints

- Copy en español.
- WhatsApp: **hasta 4 números del equipo** (tabla `WhatsappRecipient`). Nunca a clientes. Una petición CallMeBot **por número**, en serie.
- In-app siempre on; correo y WhatsApp respetan toggles.
- Secretos SMTP cifrados con `encrypt()` / `decrypt()` de `src/lib/security/encryption.ts`.
- Cron: `Authorization: Bearer $CRON_SECRET`, comparación con `safeEqual`.
- Desktop split desde `md` (768px). Móvil: lista + sheet.
- URLs canónicas de ficha en desktop: `/crm/<lista>?id=<id>`. Deep links `/crm/clientes/[id]` (y equivalentes) redirigen a esa query en desktop.
- No auto-seleccionar el primer ítem.
- No tocar login, chat IA (salvo split de `/crm/chats`), ni formularios “nuevo”.
- Commits solo si el usuario lo pide en el momento de ejecutar; en este plan el paso “Commit” queda como opcional al cierre de cada fase.

---

## File map

**Fase 1 — layout**

- Create: `src/components/layout/split-view.tsx`
- Create: `src/components/layout/split-link.tsx`
- Modify: `app/crm/CrmMain.tsx`
- Create: `src/components/clients/client-detail-panel.tsx` (extraído de `app/crm/clientes/[clientId]/page.tsx`)
- Create: `src/components/cases/case-detail-panel.tsx`
- Create: `src/components/tasks/task-detail-panel.tsx`
- Create: `src/components/rounds/round-detail-panel.tsx`
- Create: `src/components/quotes/quote-detail-panel.tsx`
- Create: `src/components/payments/payment-detail-panel.tsx`
- Create: `src/components/receipts/receipt-detail-panel.tsx`
- Modify: cada `app/crm/<lista>/page.tsx` y redirects en `[id]/page.tsx` donde existan
- Modify: `src/server/tasks/index.ts` (añadir `getTask`)
- Modify: `src/server/rounds/index.ts` (añadir `getRound` si no existe)

**Fase 2 — SMTP + digest**

- Modify: `prisma/schema.prisma` (`OrganizationSettings`, `NotificationType`)
- Create: `src/server/notifications/smtp.ts`
- Create: `src/server/notifications/prefs.ts`
- Create: `src/lib/digest-hour.ts`
- Create: `app/api/cron/digest/route.ts`
- Modify: `src/server/notifications/index.ts`
- Modify: `src/server/config/index.ts`, `src/actions/config.ts`
- Modify: `src/components/config/settings-form.tsx`
- Modify: `README.md`

**Fase 3 — correos cliente**

- Create: `src/server/notifications/client-emails.ts`
- Modify: `app/api/cron/reminders/route.ts`
- Modify: settings form + schema prefs

---

### Task 1: SplitView + CrmMain

**Files:**
- Create: `src/components/layout/split-view.tsx`
- Create: `src/components/layout/split-link.tsx`
- Modify: `app/crm/CrmMain.tsx`

**Interfaces:**
- Consumes: `useSearchParams`, `useRouter`, `usePathname` de `next/navigation`
- Produces: `SplitView({ list, detail, selectedId, emptyTitle, emptyDescription })`, `SplitLink({ href, id, children, className })` donde `href` es la ruta de lista (`/crm/clientes`)

- [ ] **Step 1: Crear `SplitLink`**

```tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export function SplitLink({
  href,
  id,
  children,
  className,
}: {
  href: string;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const params = useSearchParams();
  const next = new URLSearchParams(params.toString());
  next.set("id", id);
  return (
    <Link href={`${href}?${next.toString()}`} className={className} scroll={false}>
      {children}
    </Link>
  );
}
```

- [ ] **Step 2: Crear `SplitView`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function SplitView({
  list,
  detail,
  selectedId,
  emptyTitle,
  emptyDescription,
}: {
  list: ReactNode;
  detail: ReactNode;
  selectedId: string | null;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function closeSheet() {
    const next = new URLSearchParams(params.toString());
    next.delete("id");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row md:gap-4">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto md:max-w-[26rem] md:shrink-0 md:rounded-surface md:bg-surface-elevated">
        {list}
      </div>
      <div className="hidden min-h-0 min-w-0 flex-1 overflow-y-auto md:block md:rounded-surface md:bg-surface-elevated">
        {selectedId ? (
          detail
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div>
              <p className="text-sm font-semibold text-ink">{emptyTitle}</p>
              <p className="mt-1 text-sm text-text-secondary">{emptyDescription}</p>
            </div>
          </div>
        )}
      </div>
      {selectedId ? (
        <div className="fixed inset-0 z-30 bg-ink/40 md:hidden" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            className="absolute inset-x-0 bottom-0 top-10 overflow-y-auto rounded-t-surface bg-surface-elevated"
          >
            <div className="sticky top-0 flex justify-end bg-surface-elevated px-3 py-2">
              <button
                type="button"
                onClick={closeSheet}
                className="flex size-9 items-center justify-center rounded-full hover:bg-nav-hover"
                aria-label="Cerrar"
                data-cuelume-press="press"
                data-cuelume-release="release"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {detail}
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Actualizar `CrmMain`**

Si el pathname es una lista master-detail (`/crm/clientes`, `/crm/casos`, `/crm/tareas`, `/crm/rondas`, `/crm/cotizaciones`, `/crm/pagos`, `/crm/recibos`, `/crm/chats` exactos, no `/nuevo` ni `/[id]/…`):

```tsx
"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const SPLIT_LISTS = new Set([
  "/crm/clientes",
  "/crm/casos",
  "/crm/tareas",
  "/crm/rondas",
  "/crm/cotizaciones",
  "/crm/pagos",
  "/crm/recibos",
  "/crm/chats",
]);

export function CrmMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const chatDetail = /^\/crm\/chats\/[^/]+$/.test(pathname);
  const splitList = SPLIT_LISTS.has(pathname);

  return (
    <main
      className={
        chatDetail || splitList
          ? "flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden px-6 py-4 lg:px-8"
          : "flex-1 px-6 py-6 lg:px-8"
      }
    >
      {children}
    </main>
  );
}
```

- [ ] **Step 4: Verificar en el navegador**

Abrir `/crm/dashboard`: el padding normal sigue. No hay error de hidratación. `SplitView` aún no se usa.

---

### Task 2: Panel de cliente + lista master-detail

**Files:**
- Create: `src/components/clients/client-detail-panel.tsx`
- Modify: `app/crm/clientes/page.tsx`
- Modify: `app/crm/clientes/[clientId]/page.tsx`

**Interfaces:**
- Consumes: `clientService.getClientDetail(ctx, clientId)`
- Produces: `ClientDetailPanel({ clientId }: { clientId: string })` — server component async

- [ ] **Step 1: Extraer el JSX de `ClientSummaryPage` (desde el return, sin el wrapper de página completa si hay tabs de layout) a `ClientDetailPanel`**

El panel carga el detalle:

```tsx
export async function ClientDetailPanel({ clientId }: { clientId: string }) {
  const ctx = await requireOrganization();
  let detail: Awaited<ReturnType<typeof clientService.getClientDetail>>;
  try {
    detail = await clientService.getClientDetail(ctx, clientId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }
  // ... mismo render que la página actual (header, cards, acciones)
}
```

`app/crm/clientes/[clientId]/page.tsx` queda:

```tsx
import { redirect } from "next/navigation";

export default async function ClientSummaryPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/crm/clientes?id=${clientId}`);
}
```

Las pestañas Expediente/Casos/etc. **no** redirigen; siguen en `/crm/clientes/[clientId]/expediente`. El header de esas subpáginas se queda.

- [ ] **Step 2: Envolver la lista de clientes**

En `app/crm/clientes/page.tsx`:

```tsx
const selectedId = firstParam(sp, "id") ?? null;

return (
  <div className="flex min-h-0 flex-1 flex-col">
    <PageHeader ... />
    <SplitView
      selectedId={selectedId}
      emptyTitle="Elige un cliente"
      emptyDescription="Selecciona una fila para ver el resumen a la derecha."
      list={/* Card actual: filtros + filas. Cada nombre usa SplitLink href="/crm/clientes" id={client.id} */}
      detail={selectedId ? <ClientDetailPanel clientId={selectedId} /> : null}
    />
  </div>
);
```

Fila seleccionada: `className` extra `bg-nav-active` si `client.id === selectedId`.

Preservar `q`, `status`, `assignedTo`, `cursor`, `back` en `SplitLink` (usa `useSearchParams`, ya los copia).

- [ ] **Step 3: Probar**

Desktop: `/crm/clientes` vacío a la derecha. Clic en un nombre → ficha a la derecha, URL `?id=`. F5 mantiene la ficha.  
`/crm/clientes/<id>` redirige a `?id=`.  
`/crm/clientes/<id>/expediente` no redirige.  
Móvil (DevTools 390px): clic abre sheet; X cierra y quita `id`.

---

### Task 3: Casos

**Files:**
- Create: `src/components/cases/case-detail-panel.tsx` desde `app/crm/casos/[caseId]/page.tsx`
- Modify: `app/crm/casos/page.tsx` — `SplitView` + `SplitLink` `href="/crm/casos"`
- Modify: `app/crm/casos/[caseId]/page.tsx` — `redirect(\`/crm/casos?id=${caseId}\`)`
- Subrutas `/rondas`, `/tareas`, `/documentos`, `/pagos`, `/cotizaciones` no redirigen

- [ ] **Step 1:** Extraer panel con `caseService.getCaseDetail(ctx, caseId)`.
- [ ] **Step 2:** Lista + `?id=` + highlight.
- [ ] **Step 3:** Probar igual que clientes. Creación de casos sigue desde la ficha del cliente.

---

### Task 4: Tareas (no hay `/crm/tareas/[id]` hoy)

**Files:**
- Modify: `src/server/tasks/index.ts` — añadir `getTask`
- Create: `src/components/tasks/task-detail-panel.tsx`
- Modify: `app/crm/tareas/page.tsx`
- Modify: `src/components/tasks/task-table.tsx` — el título/fila usa `SplitLink` o recibe `selectedId` y `onSelect` vía href

**Interfaces:**
- Produces:

```ts
export async function getTask(ctx: OrganizationContext, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId: ctx.organizationId },
    select: TASK_LIST_SELECT, // reutilizar el select de lista + notes si existe
  });
  if (!task) throw new DomainError("Tarea no encontrada.");
  return task;
}
```

- [ ] **Step 1:** Implementar `getTask`.
- [ ] **Step 2:** `TaskDetailPanel` muestra título, tipo, prioridad, fechas, cliente/caso, notas y `TaskRowActions`.
- [ ] **Step 3:** `TasksPage` envuelve con `SplitView`; filas enlazan a `/crm/tareas?id=`.
- [ ] **Step 4:** Probar completar/reassignar desde el panel y que `router.refresh()` actualice lista y ficha.

---

### Task 5: Rondas, cotizaciones, pagos, recibos

**Files:**
- Rondas: `src/server/rounds/index.ts` (`getRound` si no existe), `src/components/rounds/round-detail-panel.tsx`, `app/crm/rondas/page.tsx`. No hay `/crm/rondas/[id]`; el panel muestra ronda + `RoundActions` + link al caso.
- Cotizaciones: extraer de `app/crm/cotizaciones/[quoteId]/page.tsx` → `quote-detail-panel.tsx`; lista + `redirect` desde `[quoteId]` (no redirigir `/nueva`).
- Pagos: extraer de detalle si existe; si solo hay lista, crear panel con `getPaymentDetail`. `app/crm/pagos/nuevo` no es split.
- Recibos: panel con `getReceipt` + anular si aplica.

- [ ] **Step 1:** Un entity a la vez, mismo patrón `SplitView` + `?id=` + highlight.
- [ ] **Step 2:** Probar cada lista en desktop y sheet móvil.

---

### Task 6: Chats en split

**Files:**
- Modify: `app/crm/chats/page.tsx`
- Modify: `app/crm/chats/[chatId]/page.tsx` — `redirect(\`/crm/chats?id=${chatId}\`)`
- Modify: `app/crm/CrmMain.tsx` — el caso `chatDetail` de `/crm/chats/[id]` deja de ser necesario tras el redirect; el split de `/crm/chats` ya pone alto completo

- [ ] **Step 1:** Izquierda: lista actual (blobatar + título). Derecha: `AiChatPanel` + `HeaderTitle` con el título del chat.
- [ ] **Step 2:** El widget flotante sigue oculto en `/crm/chats*`.
- [ ] **Step 3:** Probar crear chat (redirect a `?id=`), abrir hilo, enviar mensaje.

---

### Task 7: Cierre fase 1

- [ ] Recorrer las 8 listas en desktop: dos columnas, sin scroll de página (solo columnas).
- [ ] Móvil: sheet abre/cierra.
- [ ] Deep links de cliente/caso/cotización redirigen a `?id=`.
- [ ] Subpáginas (expediente, documentos, nuevo) intactas.

---

### Task 8: Schema SMTP + prefs + digest

**Files:**
- Modify: `prisma/schema.prisma`

Añadir a `NotificationType`:

```
DAILY_DIGEST
```

Añadir a `OrganizationSettings` (después de `callmebotApiKeyEncrypted`):

```prisma
  smtpHost                 String?
  smtpPort                 Int?
  smtpUser                 String?
  smtpPasswordEncrypted    String?  @db.Text
  smtpFrom                 String?
  smtpSecure               Boolean  @default(true)
  digestEnabled            Boolean  @default(true)
  digestHour               Int      @default(8)
  notifyEmailTask          Boolean  @default(true)
  notifyWhatsappTask       Boolean  @default(true)
  notifyEmailCase          Boolean  @default(true)
  notifyWhatsappCase       Boolean  @default(true)
  notifyEmailPayment       Boolean  @default(true)
  notifyWhatsappPayment    Boolean  @default(true)
  notifyEmailDigest        Boolean  @default(true)
  notifyWhatsappDigest     Boolean  @default(true)
  emailClientPaymentDue    Boolean  @default(false)
  emailClientDocsPending   Boolean  @default(false)
  emailClientQuoteSent     Boolean  @default(false)
  emailClientQuoteExpiring Boolean  @default(false)
  emailClientCaseReview    Boolean  @default(false)
  emailClientRoundReview   Boolean  @default(false)
```

Los toggles de cliente arrancan en `false` para no mandar correo el día que se despliega SMTP a medias.

- [ ] **Step 1:** Editar schema.
- [ ] **Step 2:** `npx prisma migrate dev --name smtp_digest_prefs`
- [ ] **Step 3:** `npx prisma generate`

---

### Task 9: `isDigestHour` + SMTP

**Files:**
- Create: `src/lib/digest-hour.ts`
- Create: `scripts/smoke/digest-hour.ts`
- Create: `src/server/notifications/smtp.ts`

**Interfaces:**
- Produces:

```ts
export function isDigestHour(now: Date, timezone: string, digestHour: number): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  return hour === digestHour;
}

export function digestDedupeKey(organizationId: string, now: Date, timezone: string): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return `digest:${organizationId}:${day}`;
}
```

```ts
// smtp.ts
export type SmtpSettings = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPasswordEncrypted: string | null;
  smtpFrom: string | null;
  smtpSecure: boolean;
};

export function isSmtpConfigured(s: SmtpSettings): boolean {
  return Boolean(s.smtpHost && s.smtpPort && s.smtpFrom);
}

export async function sendSmtpMail(
  settings: SmtpSettings,
  message: { to: string; subject: string; text: string },
): Promise<void> {
  if (!isSmtpConfigured(settings)) return;
  const nodemailer = await import("nodemailer");
  const password = settings.smtpPasswordEncrypted
    ? decrypt(settings.smtpPasswordEncrypted)
    : undefined;
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost!,
    port: settings.smtpPort!,
    secure: settings.smtpSecure && settings.smtpPort === 465,
    auth: settings.smtpUser
      ? { user: settings.smtpUser, pass: password }
      : undefined,
  });
  await transporter.sendMail({
    from: settings.smtpFrom!,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}
```

- [ ] **Step 1:** `npm i nodemailer` y `npm i -D @types/nodemailer`
- [ ] **Step 2:** Escribir `digest-hour.ts` y el smoke:

```ts
// scripts/smoke/digest-hour.ts
import { isDigestHour, digestDedupeKey } from "../../src/lib/digest-hour";

const noonUtc = new Date("2026-09-01T13:00:00.000Z"); // 08:00 Chicago (CDT)
if (!isDigestHour(noonUtc, "America/Chicago", 8)) {
  throw new Error("esperaba true a las 8 Chicago");
}
if (isDigestHour(noonUtc, "America/Chicago", 9)) {
  throw new Error("no debe coincidir hora 9");
}
const key = digestDedupeKey("org1", noonUtc, "America/Chicago");
if (key !== "digest:org1:2026-09-01") {
  throw new Error(`dedupe inesperado: ${key}`);
}
console.log("ok");
```

- [ ] **Step 3:** `npx tsx scripts/smoke/digest-hour.ts` → `ok`
- [ ] **Step 4:** Implementar `smtp.ts`. No enviar en el smoke (no hay SMTP en CI).

---

### Task 10: Prefs + correo interno en `createNotification`

**Files:**
- Create: `src/server/notifications/prefs.ts`
- Modify: `src/server/notifications/index.ts`

```ts
export type ChannelPrefs = {
  notifyEmailTask: boolean;
  notifyWhatsappTask: boolean;
  notifyEmailCase: boolean;
  notifyWhatsappCase: boolean;
  notifyEmailPayment: boolean;
  notifyWhatsappPayment: boolean;
  notifyEmailDigest: boolean;
  notifyWhatsappDigest: boolean;
};

export function emailEnabledFor(type: NotificationType, p: ChannelPrefs): boolean {
  if (type === "TASK_DUE" || type === "TASK_OVERDUE") return p.notifyEmailTask;
  if (type === "CASE_REVIEW_DUE" || type === "ROUND_REVIEW_DUE") return p.notifyEmailCase;
  if (type === "PAYMENT_DUE") return p.notifyEmailPayment;
  if (type === "DAILY_DIGEST") return p.notifyEmailDigest;
  return false;
}

export function whatsappEnabledFor(type: NotificationType, p: ChannelPrefs): boolean {
  if (type === "TASK_DUE" || type === "TASK_OVERDUE") return p.notifyWhatsappTask;
  if (type === "CASE_REVIEW_DUE" || type === "ROUND_REVIEW_DUE") return p.notifyWhatsappCase;
  if (type === "PAYMENT_DUE") return p.notifyWhatsappPayment;
  if (type === "DAILY_DIGEST") return p.notifyWhatsappDigest;
  return false;
}
```

En `createNotification`, tras crear el registro (solo si es nuevo, no en update de dedupe):

1. Cargar settings (prefs + smtp + callmebot).
2. Si `whatsappEnabledFor` y no `skipWhatsapp` → `deliverWhatsapp` (como hoy).
3. Si `emailEnabledFor` → `sendSmtpMail` al `user.email` del destinatario. Subject = `title`, text = `[title]\n\n[body]\n\n[link absoluto si hay NEXT_PUBLIC_APP_URL]`.
4. Errores de SMTP/WhatsApp: `console.error`, no throw.

Si el `findUnique(dedupeKey)` ya existía, **no** reenviar correo ni WhatsApp (mismo contrato que hoy para WhatsApp).

---

### Task 11: `GET /api/cron/digest`

**Files:**
- Create: `app/api/cron/digest/route.ts`
- Modify: `src/server/dashboard/index.ts` — reutilizar `getDashboardSummary` o extraer un `getDigestPayload(organizationId)`

Auth idéntica a reminders (`CRON_SECRET` + `safeEqual`).

Para cada org con `digestEnabled`:

1. Si `!isDigestHour(now, timezone, digestHour)` → skip.
2. Calcular payload (mismos números que el dashboard: clientes activos, casos abiertos, tareas hoy, tareas vencidas, revisiones, pagos pendientes).
3. Recipients: `organizationMember` role OWNER/ADMIN + `user.isActive`.
4. `createNotification` por usuario:

```ts
{
  organizationId,
  userId,
  type: "DAILY_DIGEST",
  title: "Resumen diario del CRM",
  body: textoPlano,
  link: "/crm/dashboard",
  dedupeKey: digestDedupeKey(organizationId, now, timezone),
}
```

Cuidado: `dedupeKey` es unique **global**. Un digest por org/día es una sola fila si usamos `digest:org:day`, pero necesitamos una notificación **por usuario**. Usar `digest:${organizationId}:${userId}:${day}`.

Actualizar `digestDedupeKey`:

```ts
export function digestDedupeKey(
  organizationId: string,
  userId: string,
  now: Date,
  timezone: string,
): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return `digest:${organizationId}:${userId}:${day}`;
}
```

Ajustar el smoke de Task 9 a esta firma.

Texto plano ejemplo:

```
Resumen 2026-09-01

Clientes activos: 12
Casos abiertos: 4
Tareas de hoy: 3
Tareas vencidas: 1
Pagos pendientes: 2 (USD 1,200)

Revisiones: 2 casos / 1 ronda
```

- [ ] **Step 1:** Implementar ruta.
- [ ] **Step 2:** `curl` sin Bearer → 401. Con Bearer y hora distinta → `{ ok: true, sent: 0 }`.

---

### Task 12: UI de Configuración (SMTP + digest + toggles internos)

**Files:**
- Modify: `src/server/config/index.ts` — `SettingsUpdateData` + `getSettingsFormValues` + `updateSettings`
- Modify: `src/actions/config.ts` — zod + `sendTestEmail`
- Modify: `src/components/config/settings-form.tsx`

`getSettingsFormValues` añade campos SMTP (password nunca; `smtpConfigured: Boolean(smtpPasswordEncrypted || smtpHost)`), `digestHour`, `digestEnabled`, toggles.

`updateSettings`: si `smtpPassword` viene vacío, no tocar el cifrado. Si viene texto, `encrypt`.

`sendTestEmail`: `requireRole("OWNER","ADMIN")`, manda al email del usuario de sesión. Si SMTP incompleto, `DomainError("Configura el servidor SMTP primero.")`.

UI: sección Correo (host, puerto, usuario, password, from, checkbox TLS, botón prueba). Sección Notificaciones (hora 0–23, digest on/off, checkboxes correo/WhatsApp por tipo interno). No mostrar aún toggles de cliente (fase 3) o mostrarlos disabled hasta Task 14 — **mostrarlos en fase 3**.

---

### Task 13: README cron-job.org

**Files:**
- Modify: `README.md` sección Cron

Texto a añadir:

```
## Cron (cron-job.org)

Crea dos jobs contra el host de producción. Header en ambos:
`Authorization: Bearer <CRON_SECRET>`

1. Recordatorios — cada 15 minutos
   GET https://<host>/api/cron/reminders

2. Resumen diario — cada hora (el servidor solo envía a la hora configurada en Ajustes)
   GET https://<host>/api/cron/digest
```

---

### Task 14: Correos a clientes

**Files:**
- Create: `src/server/notifications/client-emails.ts`
- Modify: `app/api/cron/reminders/route.ts`
- Modify: settings form + `updateSettings` para los 6 toggles `emailClient*`

**Interfaces:**

```ts
export async function sendClientEmailsForOrg(
  organizationId: string,
  now: Date,
): Promise<{ sent: number; skipped: number }>
```

Para cada toggle on, consultar lo mismo que reminders (pagos due, casos, rondas, quotes SENT con `validUntil <= endOfToday`, intake links activos). Destinatario `client.email`. Skip si no hay email.

`dedupeKey` en una tabla no existe para emails de cliente. Evitar duplicados con notificaciones `SYSTEM` internas **o** una tabla ligera. Decisión de spec: usar `Notification` del OWNER con keys:

- `email:client:${clientId}:payment:${paymentId}:due`
- `email:client:${clientId}:quote:${quoteId}:sent`
- `email:client:${clientId}:quote:${quoteId}:expiring:${day}`
- `email:client:${clientId}:case:${caseId}:review:${day}`
- `email:client:${clientId}:round:${roundId}:review:${day}`
- `email:client:${clientId}:intake:${linkId}:pending`

Crear esa Notification al OWNER (`skipWhatsapp: true`) **después** de enviar el SMTP. Si `create` por unique falla / already exists, no enviar. Flujo:

1. `findUnique({ where: { dedupeKey } })` — si existe, skip.
2. `sendSmtpMail` al cliente.
3. `createNotification` SYSTEM al primer OWNER, `skipWhatsapp: true`, mismo `dedupeKey`, title `Correo enviado: …`.

`clientQuoteSent`: además disparar desde la action `markQuoteSent` (no solo el cron), con el mismo `dedupeKey` `email:client:${clientId}:quote:${quoteId}:sent`.

Plantilla texto:

```
Hola {nombre},

Te escribimos de {legalName}.

{cuerpo}

{legalName}
{phone}
```

- [ ] **Step 1:** Módulo + wiring en reminders (al final del GET, loop orgs).
- [ ] **Step 2:** Toggles en Ajustes.
- [ ] **Step 3:** `markQuoteSent` llama al helper de cotización enviada.

---

### Task 15: Cierre fase 2–3

- [ ] Digest: hora en Ajustes, job cada hora, un envío por usuario/día.
- [ ] Prueba SMTP desde Ajustes.
- [ ] Cliente sin email: no rompe el cron.
- [ ] WhatsApp de clientes: no existe ningún envío.
- [ ] README con las dos URLs.

---

## Spec coverage

| Spec | Task |
| --- | --- |
| Split 8 listas | 1–6 |
| Sheet móvil | 1 |
| Redirect desktop `[id]` → `?id=` | 2, 3, 5, 6 |
| Dashboard sin master-detail | 1 (no está en SPLIT_LISTS) |
| SMTP cifrado + prueba | 8, 9, 12 |
| Prefs correo/WhatsApp internas | 10, 12 |
| Digest OWNER/ADMIN hora configurable | 9, 11, 12 |
| cron-job.org 2 jobs | 11, 13 |
| Correos cliente on/off | 14 |
| WhatsApp solo equipo | 10, 14 |
| Intake docs pending + flag público | 14 |

## Self-review

- Firma `digestDedupeKey` unificada con `userId` (un notif por admin/día).
- Toggles cliente default `false`.
- Tareas/rondas sin ruta `[id]`: paneles nuevos, no redirects inventados.
- Sin placeholders TBD.
