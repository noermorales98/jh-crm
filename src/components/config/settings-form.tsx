"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Field,
  Input,
  Textarea,
} from "@/src/components/ui";
import { sendTestWhatsapp, updateSettings } from "@/src/actions/config";

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
  callmebotPhone: string;
  callmebotApiKeyConfigured: boolean;
}

/** Formulario de OrganizationSettings (solo OWNER/ADMIN). */
export function SettingsForm({
  initialValues,
}: {
  initialValues: SettingsFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<SettingsFormValues>(initialValues);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [testing, startTest] = useTransition();

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
        callmebotPhone: values.callmebotPhone.trim() || null,
        callmebotApiKey: apiKey.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const savedKey = Boolean(apiKey.trim());
      setSuccess(true);
      setApiKey("");
      if (savedKey) {
        setValues((v) => ({ ...v, callmebotApiKeyConfigured: true }));
      }
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
          CallMeBot envía avisos a <strong>tu</strong> WhatsApp (uso personal).
          Activa el bot una vez: agrégalo al +34 684 72 39 62, envía{" "}
          <em>I allow callmebot to send me messages</em> y pega aquí el API key
          que te responda. El número y la clave se guardan en la base de datos,
          no en variables de entorno.
        </Alert>
        <label className="flex items-center gap-2 text-sm text-text-secondary-strong">
          <input
            type="checkbox"
            checked={values.callmebotEnabled}
            onChange={(e) => {
              setValues((v) => ({ ...v, callmebotEnabled: e.target.checked }));
              setSuccess(false);
            }}
            className="size-4 rounded border-border-subtle text-action-primary focus:ring-focus"
          />
          Enviar notificaciones del CRM por WhatsApp
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Número de WhatsApp"
            htmlFor="callmebotPhone"
            hint="Con código de país, sin espacios. Ej. +17135551234"
            required={values.callmebotEnabled}
          >
            <Input
              id="callmebotPhone"
              type="tel"
              value={values.callmebotPhone}
              onChange={(e) => set("callmebotPhone", e.target.value)}
              placeholder="+17135551234"
              maxLength={20}
              autoComplete="off"
            />
          </Field>
          <Field
            label="API key de CallMeBot"
            htmlFor="callmebotApiKey"
            hint={
              values.callmebotApiKeyConfigured
                ? "Ya hay una clave guardada. Déjalo vacío para conservarla."
                : "La que te envió el bot por WhatsApp."
            }
            required={values.callmebotEnabled && !values.callmebotApiKeyConfigured}
          >
            <Input
              id="callmebotApiKey"
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setSuccess(false);
              }}
              placeholder={
                values.callmebotApiKeyConfigured ? "••••••••" : "Ej. 123456"
              }
              maxLength={80}
              autoComplete="off"
            />
          </Field>
        </div>
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={testing || pending}
            onClick={() => {
              setError(null);
              setTestMessage(null);
              startTest(async () => {
                const result = await sendTestWhatsapp();
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setTestMessage(
                  "Mensaje de prueba enviado. Revisa WhatsApp y la campana del header.",
                );
                router.refresh();
              });
            }}
          >
            {testing ? "Enviando prueba…" : "Enviar mensaje de prueba"}
          </Button>
          {testMessage ? (
            <p className="mt-2 text-xs text-emerald-700">{testMessage}</p>
          ) : null}
        </div>
      </section>

      <div className="flex items-center gap-2 border-t border-border-subtle pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
