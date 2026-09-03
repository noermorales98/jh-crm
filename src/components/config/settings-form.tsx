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
  sendTestWhatsapp,
  updateSettings,
} from "@/src/actions/config";

const MAX_WHATSAPP_RECIPIENTS = 4;

export type WhatsappRecipientFormValue = {
  id: string;
  label: string;
  phone: string;
  apiKeyConfigured: boolean;
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
  emailClientPaymentDue: boolean;
  emailClientDocsPending: boolean;
  emailClientQuoteSent: boolean;
  emailClientQuoteExpiring: boolean;
  emailClientCaseReview: boolean;
  emailClientRoundReview: boolean;
  whatsappRecipients: WhatsappRecipientFormValue[];
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
  const [smtpPassword, setSmtpPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [testing, startTest] = useTransition();

  const recipientsStamp = initialValues.whatsappRecipients
    .map((row) => `${row.id}:${row.phone}:${row.label}:${row.enabled}:${row.apiKeyConfigured}`)
    .join("|");

  useEffect(() => {
    setValues(initialValues);
    setRecipients(draftsFromValues(initialValues));
  }, [initialValues, recipientsStamp]);

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
        notifyWhatsappMail: values.notifyWhatsappMail,
        notifyEmailContact: values.notifyEmailContact,
        notifyWhatsappContact: values.notifyWhatsappContact,
        emailClientPaymentDue: values.emailClientPaymentDue,
        emailClientDocsPending: values.emailClientDocsPending,
        emailClientQuoteSent: values.emailClientQuoteSent,
        emailClientQuoteExpiring: values.emailClientQuoteExpiring,
        emailClientCaseReview: values.emailClientCaseReview,
        emailClientRoundReview: values.emailClientRoundReview,
        callmebotEnabled: values.callmebotEnabled,
        whatsappRecipients: recipients.map((row) => ({
          id: row.id,
          label: row.label,
          phone: row.phone,
          apiKey: row.apiKey.trim() || undefined,
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
            <thead className="bg-nav-hover text-xs text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Correo al equipo</th>
                <th className="px-3 py-2 font-medium">WhatsApp al equipo</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Tareas (recordatorio / vencida)", "notifyEmailTask", "notifyWhatsappTask"],
                  ["Revisión de caso / ronda", "notifyEmailCase", "notifyWhatsappCase"],
                  ["Pago por cobrar", "notifyEmailPayment", "notifyWhatsappPayment"],
                  ["Correo nuevo", "notifyEmailMail", "notifyWhatsappMail"],
                  ["Formulario de contacto", "notifyEmailContact", "notifyWhatsappContact"],
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
                    <input
                      type="checkbox"
                      data-cuelume-toggle="toggle"
                      checked={values[waKey]}
                      onChange={(e) => set(waKey, e.target.checked)}
                      className="size-4 rounded border-border-subtle text-action-primary focus:ring-focus"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs font-medium text-text-secondary-strong">
          Correos a clientes (requiere SMTP)
        </p>
        {(
          [
            ["Pago por cobrar", "emailClientPaymentDue"],
            ["Documentos / intake pendiente", "emailClientDocsPending"],
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
              className="space-y-3 rounded-control border border-border-subtle p-4"
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
