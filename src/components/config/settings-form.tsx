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
  Textarea,
} from "@/src/components/ui";
import { sendTestWhatsapp, updateSettings } from "@/src/actions/config";

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
}: {
  initialValues: SettingsFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<SettingsFormValues>(initialValues);
  const [recipients, setRecipients] = useState<RecipientDraft[]>(() =>
    draftsFromValues(initialValues),
  );
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
          <p className="text-xs text-emerald-700">{testMessage}</p>
        ) : null}
      </section>

      <div className="flex items-center gap-2 border-t border-border-subtle pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
