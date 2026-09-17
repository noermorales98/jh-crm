"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { play } from "cuelume";
import { Plus, Trash2 } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from "@/src/components/ui";
import {
  sendTestEmail,
  sendTestWhapiClient,
  sendTestWhatsapp,
  updateSettings,
} from "@/src/actions/config";

const MAX_WHATSAPP_RECIPIENTS = 4;
const MAX_EMAIL_RECIPIENTS = 10;

export type WhatsappRecipientFormValue = {
  id: string;
  label: string;
  phone: string;
  apiKeyConfigured: boolean;
  enabled: boolean;
};

export type EmailRecipientFormValue = {
  id: string;
  label: string;
  email: string;
  enabled: boolean;
};

export interface SettingsFormValues {
  legalName: string;
  logoUrl: string;
  phone: string;
  email: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  timezone: string;
  currency: string;
  defaultTaxRate: string;
  quotePrefix: string;
  receiptPrefix: string;
  clientPrefix: string;
  casePrefix: string;
  defaultTerms: string;
  callmebotEnabled: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpFrom: string;
  smtpSecure: boolean;
  smtpTestTo: string;
  smtpConfigured: boolean;
  digestEnabled: boolean;
  digestHour: number;
  notifyEmailTask: boolean;
  notifyWhatsappTask: boolean;
  notifyEmailCase: boolean;
  notifyWhatsappCase: boolean;
  notifyEmailPayment: boolean;
  notifyWhatsappPayment: boolean;
  notifyEmailDigest: boolean;
  notifyWhatsappDigest: boolean;
  notifyEmailMail: boolean;
  notifyWhatsappMail: boolean;
  notifyEmailContact: boolean;
  notifyWhatsappContact: boolean;
  notifyEmailIntake: boolean;
  notifyWhatsappIntake: boolean;
  emailClientPaymentDue: boolean;
  emailClientDocsPending: boolean;
  emailClientQuoteSent: boolean;
  emailClientQuoteExpiring: boolean;
  emailClientCaseReview: boolean;
  emailClientRoundReview: boolean;
  whapiEnabled: boolean;
  whapiBaseUrl: string;
  whapiConfigured: boolean;
  whatsappClientPaymentDue: boolean;
  whatsappClientDocsPending: boolean;
  whatsappClientQuoteSent: boolean;
  whatsappClientQuoteExpiring: boolean;
  whatsappClientCaseReview: boolean;
  whatsappClientRoundReview: boolean;
  stripeEnabled: boolean;
  stripePublishableKey: string;
  stripeSecretConfigured: boolean;
  stripeWebhookConfigured: boolean;
  stripeWebhookUrl: string;
  documentSoftDeleteRetentionDays: string;
  documentMaxRetentionDays: string;
  whatsappRecipients: WhatsappRecipientFormValue[];
  emailRecipients: EmailRecipientFormValue[];
}

type RecipientDraft = {
  key: string;
  id: string | null;
  label: string;
  phone: string;
  apiKey: string;
  apiKeyConfigured: boolean;
  enabled: boolean;
};

type EmailDraft = {
  key: string;
  id: string | null;
  label: string;
  email: string;
  enabled: boolean;
};

function draftsFromValues(values: SettingsFormValues): RecipientDraft[] {
  return values.whatsappRecipients.map((row) => ({
    key: row.id,
    id: row.id,
    label: row.label,
    phone: row.phone,
    apiKey: "",
    apiKeyConfigured: row.apiKeyConfigured,
    enabled: row.enabled,
  }));
}

function emailDraftsFromValues(values: SettingsFormValues): EmailDraft[] {
  return (values.emailRecipients ?? []).map((row) => ({
    key: row.id,
    id: row.id,
    label: row.label,
    email: row.email,
    enabled: row.enabled,
  }));
}

/** Formulario de OrganizationSettings (solo OWNER/ADMIN). */
export function SettingsForm({
  initialValues,
  section = "all",
}: {
  initialValues: SettingsFormValues;
  section?: "all" | "company" | "notifications";
}) {
  const router = useRouter();
  const [values, setValues] = useState<SettingsFormValues>(initialValues);
  const [recipients, setRecipients] = useState<RecipientDraft[]>(() =>
    draftsFromValues(initialValues),
  );
  const [emailRecipients, setEmailRecipients] = useState<EmailDraft[]>(() =>
    emailDraftsFromValues(initialValues),
  );
  const [smtpPassword, setSmtpPassword] = useState("");
  const [whapiToken, setWhapiToken] = useState("");
  const [whapiTestTo, setWhapiTestTo] = useState("");
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [whapiFeedback, setWhapiFeedback] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [testing, startTest] = useTransition();

  const recipientsStamp = initialValues.whatsappRecipients
    .map((row) => `${row.id}:${row.phone}:${row.label}:${row.enabled}:${row.apiKeyConfigured}`)
    .join("|");
  const emailStamp = (initialValues.emailRecipients ?? [])
    .map((row) => `${row.id}:${row.email}:${row.label}:${row.enabled}`)
    .join("|");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setValues(initialValues);
      setRecipients(draftsFromValues(initialValues));
      setEmailRecipients(emailDraftsFromValues(initialValues));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialValues, recipientsStamp, emailStamp]);

  function set<K extends keyof SettingsFormValues>(
    key: K,
    value: SettingsFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
    setSuccess(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateSettings({
        legalName: values.legalName,
        logoUrl: values.logoUrl.trim() || null,
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        website: values.website.trim() || null,
        addressLine1: values.addressLine1.trim() || null,
        addressLine2: values.addressLine2.trim() || null,
        city: values.city.trim() || null,
        state: values.state.trim() || null,
        postalCode: values.postalCode.trim() || null,
        country: values.country.trim() || "US",
        timezone: values.timezone.trim() || "America/Chicago",
        currency: values.currency.trim().toUpperCase() || "USD",
        defaultTaxRate: values.defaultTaxRate || "0",
        quotePrefix: values.quotePrefix.trim().toUpperCase(),
        receiptPrefix: values.receiptPrefix.trim().toUpperCase(),
        clientPrefix: values.clientPrefix.trim().toUpperCase(),
        casePrefix: values.casePrefix.trim().toUpperCase(),
        defaultTerms: values.defaultTerms.trim() || null,
        documentSoftDeleteRetentionDays: values.documentSoftDeleteRetentionDays.trim()
          ? Number(values.documentSoftDeleteRetentionDays)
          : null,
        documentMaxRetentionDays: values.documentMaxRetentionDays.trim()
          ? Number(values.documentMaxRetentionDays)
          : null,
        smtpHost: values.smtpHost.trim() || null,
        smtpPort: values.smtpPort ? Number(values.smtpPort) : null,
        smtpUser: values.smtpUser.trim() || null,
        smtpPassword: smtpPassword.trim() || undefined,
        smtpFrom: values.smtpFrom.trim() || null,
        smtpSecure: values.smtpSecure,
        smtpTestTo: values.smtpTestTo.trim() || null,
        digestEnabled: values.digestEnabled,
        digestHour: Number(values.digestHour),
        notifyEmailTask: values.notifyEmailTask,
        notifyWhatsappTask: values.notifyWhatsappTask,
        notifyEmailCase: values.notifyEmailCase,
        notifyWhatsappCase: values.notifyWhatsappCase,
        notifyEmailPayment: values.notifyEmailPayment,
        notifyWhatsappPayment: values.notifyWhatsappPayment,
        notifyEmailDigest: values.notifyEmailDigest,
        notifyWhatsappDigest: values.notifyWhatsappDigest,
        notifyEmailMail: values.notifyEmailMail,
        notifyWhatsappMail: false,
        notifyEmailContact: values.notifyEmailContact,
        notifyWhatsappContact: values.notifyWhatsappContact,
        notifyEmailIntake: values.notifyEmailIntake,
        notifyWhatsappIntake: values.notifyWhatsappIntake,
        emailClientPaymentDue: values.emailClientPaymentDue,
        emailClientDocsPending: values.emailClientDocsPending,
        emailClientQuoteSent: values.emailClientQuoteSent,
        emailClientQuoteExpiring: values.emailClientQuoteExpiring,
        emailClientCaseReview: values.emailClientCaseReview,
        emailClientRoundReview: values.emailClientRoundReview,
        whapiEnabled: values.whapiEnabled,
        whapiToken: whapiToken.trim() || undefined,
        whapiBaseUrl: values.whapiBaseUrl.trim() || null,
        whatsappClientPaymentDue: values.whatsappClientPaymentDue,
        whatsappClientDocsPending: values.whatsappClientDocsPending,
        whatsappClientQuoteSent: values.whatsappClientQuoteSent,
        whatsappClientQuoteExpiring: values.whatsappClientQuoteExpiring,
        whatsappClientCaseReview: values.whatsappClientCaseReview,
        whatsappClientRoundReview: values.whatsappClientRoundReview,
        stripeEnabled: values.stripeEnabled,
        stripeSecretKey: stripeSecretKey.trim() || undefined,
        stripeWebhookSecret: stripeWebhookSecret.trim() || undefined,
        stripePublishableKey: values.stripePublishableKey.trim() || null,
        callmebotEnabled: values.callmebotEnabled,
        whatsappRecipients: recipients.map((row) => ({
          id: row.id,
          label: row.label,
          phone: row.phone,
          apiKey: row.apiKey.trim() || undefined,
          enabled: row.enabled,
        })),
        emailRecipients: emailRecipients.map((row) => ({
          id: row.id,
          label: row.label,
          email: row.email,
          enabled: row.enabled,
        })),
      });
      if (!result.ok) {
        play("error");
        setError(result.error);
        return;
      }
      play("success");
      setSuccess(true);
      if (smtpPassword.trim()) {
        setSmtpPassword("");
        setValues((v) => ({ ...v, smtpConfigured: true }));
      }
      if (whapiToken.trim()) {
        setWhapiToken("");
        setValues((v) => ({ ...v, whapiConfigured: true }));
      }
      if (stripeSecretKey.trim() || stripeWebhookSecret.trim()) {
        setStripeSecretKey("");
        setStripeWebhookSecret("");
        setValues((v) => ({
          ...v,
          stripeSecretConfigured:
            v.stripeSecretConfigured || Boolean(stripeSecretKey.trim()),
          stripeWebhookConfigured:
            v.stripeWebhookConfigured || Boolean(stripeWebhookSecret.trim()),
        }));
      }
      setRecipients((rows) =>
        rows.map((row) => ({
          ...row,
          apiKey: "",
          apiKeyConfigured: row.apiKeyConfigured || Boolean(row.apiKey.trim()),
        })),
      );
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? (
        <Alert tone="success">Configuración guardada correctamente.</Alert>
      ) : null}

      {section !== "notifications" ? (
        <>
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-ink">Empresa</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre legal" htmlFor="legalName" required>
            <Input
              id="legalName"
              value={values.legalName}
              onChange={(e) => set("legalName", e.target.value)}
              required
              maxLength={200}
            />
          </Field>
          <Field label="URL del logo" htmlFor="logoUrl" hint="Se usa en los PDF de cotizaciones y recibos.">
            <Input
              id="logoUrl"
              type="url"
              value={values.logoUrl}
              onChange={(e) => set("logoUrl", e.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label="Teléfono" htmlFor="phone">
            <Input
              id="phone"
              type="tel"
              value={values.phone}
              onChange={(e) => set("phone", e.target.value)}
              maxLength={30}
            />
          </Field>
          <Field label="Correo" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
          <Field label="Sitio web" htmlFor="website">
            <Input
              id="website"
              value={values.website}
              onChange={(e) => set("website", e.target.value)}
              maxLength={200}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-border-subtle pt-4">
        <h3 className="text-sm font-semibold text-ink">Dirección</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dirección" htmlFor="addressLine1" className="sm:col-span-2">
            <Input
              id="addressLine1"
              value={values.addressLine1}
              onChange={(e) => set("addressLine1", e.target.value)}
              maxLength={200}
            />
          </Field>
          <Field label="Dirección (línea 2)" htmlFor="addressLine2" className="sm:col-span-2">
            <Input
              id="addressLine2"
              value={values.addressLine2}
              onChange={(e) => set("addressLine2", e.target.value)}
              maxLength={200}
            />
          </Field>
          <Field label="Ciudad" htmlFor="city">
            <Input
              id="city"
              value={values.city}
              onChange={(e) => set("city", e.target.value)}
              maxLength={100}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Estado" htmlFor="state">
              <Input
                id="state"
                value={values.state}
                onChange={(e) => set("state", e.target.value)}
                maxLength={50}
              />
            </Field>
            <Field label="Código postal" htmlFor="postalCode">
              <Input
                id="postalCode"
                value={values.postalCode}
                onChange={(e) => set("postalCode", e.target.value)}
                maxLength={20}
              />
            </Field>
          </div>
          <Field label="País" htmlFor="country" hint="Código ISO de 2 letras (ej. US).">
            <Input
              id="country"
              value={values.country}
              onChange={(e) => set("country", e.target.value.toUpperCase())}
              maxLength={2}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-border-subtle pt-4">
        <h3 className="text-sm font-semibold text-ink">Operación</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Zona horaria" htmlFor="timezone" hint="Ej. America/Chicago">
            <Input
              id="timezone"
              value={values.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              maxLength={60}
            />
          </Field>
          <Field label="Moneda" htmlFor="currency" hint="Código ISO de 3 letras.">
            <Input
              id="currency"
              value={values.currency}
              onChange={(e) => set("currency", e.target.value.toUpperCase())}
              maxLength={3}
            />
          </Field>
          <Field label="Impuesto por defecto (%)" htmlFor="defaultTaxRate">
            <Input
              id="defaultTaxRate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={values.defaultTaxRate}
              onChange={(e) => set("defaultTaxRate", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-border-subtle pt-4">
        <h3 className="text-sm font-semibold text-ink">Prefijos de folios</h3>
        <Alert tone="info">
          Los prefijos solo afectan a los folios <strong>futuros</strong>; los
          documentos ya emitidos conservan su folio. Usa de 1 a 10 letras
          mayúsculas.
        </Alert>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Cotizaciones" htmlFor="quotePrefix">
            <Input
              id="quotePrefix"
              value={values.quotePrefix}
              onChange={(e) => set("quotePrefix", e.target.value.toUpperCase())}
              maxLength={10}
            />
          </Field>
          <Field label="Recibos" htmlFor="receiptPrefix">
            <Input
              id="receiptPrefix"
              value={values.receiptPrefix}
              onChange={(e) => set("receiptPrefix", e.target.value.toUpperCase())}
              maxLength={10}
            />
          </Field>
          <Field label="Clientes" htmlFor="clientPrefix">
            <Input
              id="clientPrefix"
              value={values.clientPrefix}
              onChange={(e) => set("clientPrefix", e.target.value.toUpperCase())}
              maxLength={10}
            />
          </Field>
          <Field label="Casos" htmlFor="casePrefix">
            <Input
              id="casePrefix"
              value={values.casePrefix}
              onChange={(e) => set("casePrefix", e.target.value.toUpperCase())}
              maxLength={10}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-border-subtle pt-4">
        <h3 className="text-sm font-semibold text-ink">Documentos</h3>
        <Field
          label="Términos por defecto de cotizaciones"
          htmlFor="defaultTerms"
          hint="Se precargan en cada cotización nueva."
        >
          <Textarea
            id="defaultTerms"
            rows={5}
            value={values.defaultTerms}
            onChange={(e) => set("defaultTerms", e.target.value)}
            maxLength={10000}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Días tras soft-delete (purge)"
            htmlFor="documentSoftDeleteRetentionDays"
            hint="Vacío = sin auto-borrado S3. Tras eliminar un documento, se programa hard-delete."
          >
            <Input
              id="documentSoftDeleteRetentionDays"
              type="number"
              min={1}
              max={3650}
              inputMode="numeric"
              value={values.documentSoftDeleteRetentionDays}
              onChange={(e) => set("documentSoftDeleteRetentionDays", e.target.value)}
              placeholder="p. ej. 30"
            />
          </Field>
          <Field
            label="Retención máxima (días desde creación)"
            htmlFor="documentMaxRetentionDays"
            hint="Vacío = sin límite. El cron de retención purga documentos más antiguos."
          >
            <Input
              id="documentMaxRetentionDays"
              type="number"
              min={1}
              max={3650}
              inputMode="numeric"
              value={values.documentMaxRetentionDays}
              onChange={(e) => set("documentMaxRetentionDays", e.target.value)}
              placeholder="p. ej. 365"
            />
          </Field>
        </div>
      </section>
        </>
      ) : null}

      {section !== "company" ? (
        <>
      <section className={`space-y-4 ${section === "notifications" ? "" : "border-t border-border-subtle pt-4"}`}>
        <h3 className="text-sm font-semibold text-ink">Correo (SMTP)</h3>
        <Alert tone="info">
          Los avisos internos y el resumen diario salen por este servidor. La
          contraseña se cifra. Déjala vacía para conservar la guardada.
        </Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Host" htmlFor="smtpHost">
            <Input
              id="smtpHost"
              value={values.smtpHost}
              onChange={(e) => set("smtpHost", e.target.value)}
              placeholder="smtp.tu-proveedor.com"
              autoComplete="off"
            />
          </Field>
          <Field label="Puerto" htmlFor="smtpPort" hint="587 (STARTTLS) o 465 (TLS).">
            <Input
              id="smtpPort"
              type="number"
              min={1}
              max={65535}
              value={values.smtpPort}
              onChange={(e) => set("smtpPort", e.target.value)}
            />
          </Field>
          <Field label="Usuario" htmlFor="smtpUser">
            <Input
              id="smtpUser"
              value={values.smtpUser}
              onChange={(e) => set("smtpUser", e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field
            label="Contraseña"
            htmlFor="smtpPassword"
            hint={
              values.smtpConfigured
                ? "Ya hay una contraseña guardada."
                : "La del buzón SMTP."
            }
          >
            <Input
              id="smtpPassword"
              type="password"
              value={smtpPassword}
              onChange={(e) => {
                setSmtpPassword(e.target.value);
                setSuccess(false);
              }}
              placeholder={values.smtpConfigured ? "••••••••" : ""}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Remitente (From)" htmlFor="smtpFrom">
            <Input
              id="smtpFrom"
              type="email"
              value={values.smtpFrom}
              onChange={(e) => set("smtpFrom", e.target.value)}
              placeholder="crm@jhmultiservices.com"
            />
          </Field>
          <label className="flex items-center gap-2 self-end text-sm text-text-secondary-strong">
            <input
              type="checkbox"
              data-cuelume-toggle="toggle"
              checked={values.smtpSecure}
              onChange={(e) => set("smtpSecure", e.target.checked)}
              className="size-4 rounded border-border-subtle text-action-primary focus:ring-focus"
            />
            TLS / conexión segura
          </label>
          <Field
            label="Enviar prueba a"
            htmlFor="smtpTestTo"
            hint="Correo que recibirá el mensaje de prueba. Se guarda con el resto de la configuración."
            className="sm:col-span-2"
          >
            <Input
              id="smtpTestTo"
              type="email"
              value={values.smtpTestTo}
              onChange={(e) => set("smtpTestTo", e.target.value)}
              placeholder="tu@correo.com"
              autoComplete="email"
            />
          </Field>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || testing}
          onClick={() => {
            setError(null);
            setTestMessage(null);
            startTest(async () => {
              const result = await sendTestEmail(values.smtpTestTo);
              if (!result.ok) {
                play("error");
                setError(result.error);
                return;
              }
              play("success");
              setTestMessage(result.data.message);
            });
          }}
        >
          {testing ? "Enviando…" : "Enviar correo de prueba"}
        </Button>
      </section>

      <section className="space-y-4 border-t border-border-subtle pt-4">
        <h3 className="text-sm font-semibold text-ink">Notificaciones</h3>
        <p className="text-sm text-text-secondary">
          La campana del CRM siempre registra el aviso. Correo y WhatsApp se
          pueden apagar por tipo.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-text-secondary-strong">
            <input
              type="checkbox"
              data-cuelume-toggle="toggle"
              checked={values.digestEnabled}
              onChange={(e) => set("digestEnabled", e.target.checked)}
              className="size-4 rounded border-border-subtle text-action-primary focus:ring-focus"
            />
            Enviar resumen diario
          </label>
          <Field label="Hora del resumen (zona de la org)" htmlFor="digestHour">
            <Select
              id="digestHour"
              value={String(values.digestHour)}
              onChange={(e) => set("digestHour", Number(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, "0")}:00
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="overflow-x-auto rounded-control border border-border-subtle">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-text-secondary">Tipo</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-text-secondary">Correo al equipo</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-text-secondary">WhatsApp al equipo</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Tareas (recordatorio / vencida)", "notifyEmailTask", "notifyWhatsappTask"],
                  ["Revisión de caso / ronda", "notifyEmailCase", "notifyWhatsappCase"],
                  ["Pago por cobrar", "notifyEmailPayment", "notifyWhatsappPayment"],
                  ["Correo nuevo", "notifyEmailMail", null],
                  ["Formulario de contacto", "notifyEmailContact", "notifyWhatsappContact"],
                  ["Registro de formulario", "notifyEmailIntake", "notifyWhatsappIntake"],
                  ["Resumen diario", "notifyEmailDigest", "notifyWhatsappDigest"],
                ] as const
              ).map(([label, emailKey, waKey]) => (
                <tr key={emailKey} className="border-t border-border-subtle">
                  <td className="px-3 py-2 text-ink">{label}</td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      data-cuelume-toggle="toggle"
                      checked={values[emailKey]}
                      onChange={(e) => set(emailKey, e.target.checked)}
                      className="size-4 rounded border-border-subtle text-action-primary focus:ring-focus"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {waKey ? (
                      <input
                        type="checkbox"
                        data-cuelume-toggle="toggle"
                        checked={values[waKey]}
                        onChange={(e) => set(waKey, e.target.checked)}
                        className="size-4 rounded border-border-subtle text-action-primary focus:ring-focus"
                      />
                    ) : (
                      <span className="text-xs text-text-secondary">No aplica</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] font-semibold text-text-secondary-strong">
          Correos a clientes (requiere SMTP)
        </p>
        {(
          [
            ["Pago por cobrar", "emailClientPaymentDue"],
            ["Documentos / formulario pendiente", "emailClientDocsPending"],
            ["Cotización enviada", "emailClientQuoteSent"],
            ["Cotización por vencer", "emailClientQuoteExpiring"],
            ["Revisión de caso", "emailClientCaseReview"],
            ["Revisión de ronda", "emailClientRoundReview"],
          ] as const
        ).map(([label, key]) => (
          <label
            key={key}
            className="flex items-center gap-2 text-sm text-text-secondary-strong"
          >
            <input
              type="checkbox"
              data-cuelume-toggle="toggle"
              checked={values[key]}
              onChange={(e) => set(key, e.target.checked)}
              className="size-4 rounded border-border-subtle text-action-primary focus:ring-focus"
            />
            {label}
          </label>
        ))}

        <div className="space-y-3 border-t border-border-subtle pt-4">
          <h3 className="text-sm font-semibold text-ink">
            WhatsApp a clientes (Whapi)
          </h3>
          <p className="text-sm text-text-secondary">
            Canal distinto de CallMeBot (equipo). Vincula un número en{" "}
            <a
              href="https://whapi.cloud/es/"
              target="_blank"
              rel="noreferrer"
              className="text-action-primary underline"
            >
              Whapi.Cloud
            </a>{" "}
            y pega el token. Evita envíos masivos; WhatsApp puede invalidar la
            sesión vinculada.
          </p>
          <label className="flex items-center gap-2 text-sm text-text-secondary-strong">
            <input
              type="checkbox"
              data-cuelume-toggle="toggle"
              checked={values.whapiEnabled}
              onChange={(e) => set("whapiEnabled", e.target.checked)}
              className="size-4 rounded border-border-subtle text-action-primary focus:ring-focus"
            />
            Activar WhatsApp a clientes
          </label>
          <Field label="Token Whapi" htmlFor="whapiToken">
            <Input
              id="whapiToken"
              type="password"
              autoComplete="off"
              value={whapiToken}
              onChange={(e) => {
                setWhapiToken(e.target.value);
                setSuccess(false);
              }}
              placeholder={
                values.whapiConfigured
                  ? "•••••••• (deja vacío para no cambiar)"
                  : "Bearer token del panel Whapi"
              }
            />
          </Field>
          <Field label="Base URL (opcional)" htmlFor="whapiBaseUrl">
            <Input
              id="whapiBaseUrl"
              value={values.whapiBaseUrl}
              onChange={(e) => set("whapiBaseUrl", e.target.value)}
              placeholder="https://gate.whapi.cloud"
            />
          </Field>
          <p className="text-[13px] font-semibold text-text-secondary-strong">
            Eventos al cliente (requiere Whapi activo)
          </p>
          {(
            [
              ["Pago por cobrar", "whatsappClientPaymentDue"],
              ["Documentos / formulario pendiente", "whatsappClientDocsPending"],
              ["Cotización enviada", "whatsappClientQuoteSent"],
              ["Cotización por vencer", "whatsappClientQuoteExpiring"],
              ["Revisión de caso", "whatsappClientCaseReview"],
              ["Revisión de ronda", "whatsappClientRoundReview"],
            ] as const
          ).map(([label, key]) => (
            <label
              key={key}
              className="flex items-center gap-2 text-sm text-text-secondary-strong"
            >
              <input
                type="checkbox"
                data-cuelume-toggle="toggle"
                checked={values[key]}
                onChange={(e) => set(key, e.target.checked)}
                className="size-4 rounded border-border-subtle text-action-primary focus:ring-focus"
              />
              {label}
            </label>
          ))}
          <Field label="Teléfono de prueba (con código país)" htmlFor="whapiTestTo">
            <Input
              id="whapiTestTo"
              value={whapiTestTo}
              onChange={(e) => setWhapiTestTo(e.target.value)}
              placeholder="17135551234"
            />
          </Field>
          <p className="text-xs text-text-secondary">
            Solo dígitos con código de país, sin + ni espacios (ej. México{" "}
            <code className="text-xs">521…</code>, US{" "}
            <code className="text-xs">1…</code>). Guarda el token y marca
            «Activar» antes de probar. El canal Whapi debe estar vinculado (QR).
          </p>
          {whapiFeedback ? (
            <Alert tone={whapiFeedback.tone === "error" ? "error" : "success"}>
              {whapiFeedback.text}
            </Alert>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={testing || !whapiTestTo.trim()}
            onClick={() => {
              startTest(async () => {
                setWhapiFeedback(null);
                setTestMessage(null);
                setError(null);
                const result = await sendTestWhapiClient(whapiTestTo);
                if (!result.ok) {
                  play("error");
                  setWhapiFeedback({
                    tone: "error",
                    text: result.error ?? "No se pudo enviar la prueba Whapi.",
                  });
                  setError(result.error);
                  return;
                }
                play("success");
                setWhapiFeedback({
                  tone: "success",
                  text: result.data.message,
                });
                setTestMessage(result.data.message);
              });
            }}
          >
            Enviar prueba Whapi
          </Button>
        </div>

        <div className="space-y-3 border-t border-border-subtle pt-4">
          <h3 className="text-sm font-semibold text-ink">
            Pagos online (Stripe Checkout)
          </h3>
          <p className="text-sm text-text-secondary">
            Cobro diferido de consultas y link de pago de cotizaciones. En
            Stripe Dashboard → Webhooks, apunta a esta URL (eventos:{" "}
            <code className="text-xs">checkout.session.completed</code>):
          </p>
          {values.stripeWebhookUrl ? (
            <p className="break-all rounded-control bg-surface-elevated px-3 py-2 font-mono text-xs text-ink ring-1 ring-border-subtle/50">
              {values.stripeWebhookUrl}
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-text-secondary-strong">
            <input
              type="checkbox"
              data-cuelume-toggle="toggle"
              checked={values.stripeEnabled}
              onChange={(e) => set("stripeEnabled", e.target.checked)}
              className="size-4 rounded border-border-subtle text-action-primary focus:ring-focus"
            />
            Activar Stripe
          </label>
          <Field label="Publishable key (pk_…)" htmlFor="stripePublishableKey">
            <Input
              id="stripePublishableKey"
              value={values.stripePublishableKey}
              onChange={(e) => set("stripePublishableKey", e.target.value)}
              placeholder="pk_live_… o pk_test_…"
            />
          </Field>
          <Field label="Secret key (sk_…)" htmlFor="stripeSecretKey">
            <Input
              id="stripeSecretKey"
              type="password"
              autoComplete="off"
              value={stripeSecretKey}
              onChange={(e) => {
                setStripeSecretKey(e.target.value);
                setSuccess(false);
              }}
              placeholder={
                values.stripeSecretConfigured
                  ? "•••••••• (deja vacío para no cambiar)"
                  : "sk_live_… o sk_test_…"
              }
            />
          </Field>
          <Field label="Webhook secret (whsec_…)" htmlFor="stripeWebhookSecret">
            <Input
              id="stripeWebhookSecret"
              type="password"
              autoComplete="off"
              value={stripeWebhookSecret}
              onChange={(e) => {
                setStripeWebhookSecret(e.target.value);
                setSuccess(false);
              }}
              placeholder={
                values.stripeWebhookConfigured
                  ? "•••••••• (deja vacío para no cambiar)"
                  : "whsec_…"
              }
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-border-subtle pt-4">
        <h3 className="text-sm font-semibold text-ink">
          Correos para avisos de intake
        </h3>
        <p className="text-sm text-text-secondary">
          Destinatarios del correo cuando un cliente completa el intake. No
          tienen que ser usuarios del CRM. Hasta {MAX_EMAIL_RECIPIENTS} correos.
        </p>
        <div className="space-y-3">
          {emailRecipients.map((row, index) => (
            <div
              key={row.key}
              className="space-y-3 rounded-control border border-border-subtle bg-surface-app p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">
                  Correo {index + 1}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setEmailRecipients((rows) =>
                      rows.filter((item) => item.key !== row.key),
                    );
                    setSuccess(false);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Quitar
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre" htmlFor={`email-label-${row.key}`}>
                  <Input
                    id={`email-label-${row.key}`}
                    value={row.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      setEmailRecipients((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, label } : item,
                        ),
                      );
                      setSuccess(false);
                    }}
                    placeholder="Operaciones"
                    maxLength={80}
                  />
                </Field>
                <Field label="Correo" htmlFor={`email-addr-${row.key}`}>
                  <Input
                    id={`email-addr-${row.key}`}
                    type="email"
                    value={row.email}
                    onChange={(e) => {
                      const email = e.target.value;
                      setEmailRecipients((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, email } : item,
                        ),
                      );
                      setSuccess(false);
                    }}
                    placeholder="avisos@empresa.com"
                    autoComplete="off"
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-text-secondary-strong">
                <input
                  type="checkbox"
                  data-cuelume-toggle="toggle"
                  checked={row.enabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setEmailRecipients((rows) =>
                      rows.map((item) =>
                        item.key === row.key ? { ...item, enabled } : item,
                      ),
                    );
                    setSuccess(false);
                  }}
                  className="size-4 rounded border-border-subtle text-action-primary focus:ring-focus"
                />
                Activo
              </label>
            </div>
          ))}
        </div>
        {emailRecipients.length < MAX_EMAIL_RECIPIENTS ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => {
              setEmailRecipients((rows) => [
                ...rows,
                {
                  key: `new-${Date.now()}`,
                  id: null,
                  label: "",
                  email: "",
                  enabled: true,
                },
              ]);
              setSuccess(false);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Añadir correo
          </Button>
        ) : null}
      </section>

      <section className="space-y-4 border-t border-border-subtle pt-4">
        <h3 className="text-sm font-semibold text-ink">
          Notificaciones WhatsApp (CallMeBot)
        </h3>
        <Alert tone="info">
          CallMeBot envía avisos a <strong>tu</strong> WhatsApp (uso personal),
          no a clientes. Cada persona activa el bot una vez: agrégalo al +34 684
          72 39 62, envía <em>I allow callmebot to send me messages</em> y pega
          aquí el API key que te responda. Hasta {MAX_WHATSAPP_RECIPIENTS}{" "}
          números; cada aviso se envía a todos los activos, uno por uno.
        </Alert>
        <label className="flex items-center gap-2 text-sm text-text-secondary-strong">
          <input
            type="checkbox"
            data-cuelume-toggle="toggle"
            checked={values.callmebotEnabled}
            onChange={(e) => {
              setValues((v) => ({ ...v, callmebotEnabled: e.target.checked }));
              setSuccess(false);
            }}
            className="size-4 rounded border-border-subtle text-action-primary focus:ring-focus"
          />
          Enviar notificaciones del CRM por WhatsApp
        </label>
        <div className="space-y-4">
          {recipients.map((row, index) => (
            <div
              key={row.key}
              className="space-y-3 rounded-control border border-border-subtle bg-surface-app p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">
                  Número {index + 1}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setRecipients((rows) => rows.filter((item) => item.key !== row.key));
                    setSuccess(false);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Quitar
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre" htmlFor={`wa-label-${row.key}`}>
                  <Input
                    id={`wa-label-${row.key}`}
                    value={row.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      setRecipients((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, label } : item,
                        ),
                      );
                      setSuccess(false);
                    }}
                    placeholder="Jazmín"
                    maxLength={80}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="Número de WhatsApp"
                  htmlFor={`wa-phone-${row.key}`}
                  hint="Con código de país. Ej. +17135551234"
                >
                  <Input
                    id={`wa-phone-${row.key}`}
                    type="tel"
                    value={row.phone}
                    onChange={(e) => {
                      const phone = e.target.value;
                      setRecipients((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, phone } : item,
                        ),
                      );
                      setSuccess(false);
                    }}
                    placeholder="+17135551234"
                    maxLength={20}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="API key de CallMeBot"
                  htmlFor={`wa-key-${row.key}`}
                  hint={
                    row.apiKeyConfigured
                      ? "Ya hay una clave guardada. Déjalo vacío para conservarla."
                      : "La que te envió el bot por WhatsApp."
                  }
                  className="sm:col-span-2"
                >
                  <Input
                    id={`wa-key-${row.key}`}
                    type="password"
                    value={row.apiKey}
                    onChange={(e) => {
                      const apiKey = e.target.value;
                      setRecipients((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, apiKey } : item,
                        ),
                      );
                      setSuccess(false);
                    }}
                    placeholder={row.apiKeyConfigured ? "••••••••" : "Ej. 123456"}
                    maxLength={80}
                    autoComplete="off"
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-text-secondary-strong">
                  <input
                    type="checkbox"
                    data-cuelume-toggle="toggle"
                    checked={row.enabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setRecipients((rows) =>
                        rows.map((item) =>
                          item.key === row.key ? { ...item, enabled } : item,
                        ),
                      );
                      setSuccess(false);
                    }}
                    className="size-4 rounded border-border-subtle text-action-primary focus:ring-focus"
                  />
                  Activo
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={testing || pending || !row.id}
                  onClick={() => {
                    if (!row.id) return;
                    setError(null);
                    setTestMessage(null);
                    setTestingId(row.id);
                    startTest(async () => {
                      const result = await sendTestWhatsapp(row.id!);
                      setTestingId(null);
                      if (!result.ok) {
                        play("error");
                        setError(result.error);
                        return;
                      }
                      play("success");
                      setTestMessage(
                        `Prueba enviada a ${row.label || row.phone}. Revisa WhatsApp.`,
                      );
                      router.refresh();
                    });
                  }}
                >
                  {testing && testingId === row.id
                    ? "Enviando…"
                    : "Enviar prueba"}
                </Button>
              </div>
              {!row.id ? (
                <p className="text-xs text-text-secondary">
                  Guarda los cambios para poder enviar una prueba a este número.
                </p>
              ) : null}
            </div>
          ))}
        </div>
        {recipients.length < MAX_WHATSAPP_RECIPIENTS ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setRecipients((rows) => [
                ...rows,
                {
                  key: `new-${crypto.randomUUID()}`,
                  id: null,
                  label: "",
                  phone: "",
                  apiKey: "",
                  apiKeyConfigured: false,
                  enabled: true,
                },
              ]);
              setSuccess(false);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Añadir número
          </Button>
        ) : null}
        {testMessage ? (
          <p className="text-xs text-success-ink">{testMessage}</p>
        ) : null}
      </section>
        </>
      ) : null}

      <div className="flex items-center gap-2 border-t border-border-subtle pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
