"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/src/components/ui";
import {
  INTAKE_CONSENT,
  hashIntakeConsentText,
} from "@/src/lib/intake/consent";
import {
  DOCUMENT_CATEGORY_LABELS,
  INTAKE_PRIMARY_GOAL_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { INTAKE_PRIMARY_GOALS } from "@/src/lib/validation/intake-payload";

type FormDataPayload = {
  organizationName: string;
  prefill: { firstName: string; lastName: string | null } | null;
  hasCase: boolean;
};

type DocCategory =
  | "IDENTITY"
  | "PROOF_OF_ADDRESS"
  | "SSN_DOCUMENT"
  | "CREDIT_REPORT"
  | "OTHER";

type PendingDoc = {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: DocCategory;
};

const DOC_CATEGORIES: DocCategory[] = [
  "IDENTITY",
  "PROOF_OF_ADDRESS",
  "SSN_DOCUMENT",
  "CREDIT_REPORT",
  "OTHER",
];

const FLAG_FIELDS = [
  { key: "hasCollection", label: "Colecciones" },
  { key: "hasChargeOff", label: "Charge-offs" },
  { key: "hasLatePayments", label: "Pagos atrasados" },
  { key: "hasRepossession", label: "Reposesión" },
  { key: "hasBankruptcy", label: "Bancarrota" },
  { key: "hasHardInquiries", label: "Consultas duras" },
] as const;

const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 15 * 1024 * 1024;

export function IntakeForm({ token }: { token: string }) {
  const [boot, setBoot] = useState<"loading" | "ready" | "error">("loading");
  const [bootError, setBootError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("J&H Multiservices LLC");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [primaryGoal, setPrimaryGoal] = useState<string>("");
  const [consultationReason, setConsultationReason] = useState("");
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [reportProvider, setReportProvider] = useState("");
  const [hasRecentReportAccess, setHasRecentReportAccess] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/intake/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = (await res.json()) as
          | { ok: true; data: FormDataPayload }
          | { ok: false; error: string };
        if (cancelled) return;
        if (!json.ok) {
          setBoot("error");
          setBootError(json.error || "Este enlace no está disponible.");
          return;
        }
        setOrgName(json.data.organizationName);
        if (json.data.prefill) {
          setFirstName(json.data.prefill.firstName);
          setLastName(json.data.prefill.lastName ?? "");
        }
        setBoot("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setBoot("error");
          setBootError("No se pudo cargar el formulario. Intenta de nuevo.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function uploadFile(file: File) {
    setError(null);
    if (!ALLOWED.includes(file.type)) {
      setError("Solo se aceptan PDF, JPG y PNG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("El archivo excede el límite de 15 MB.");
      return;
    }
    if (docs.length >= 10) {
      setError("Máximo 10 documentos por envío.");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/public/intake/${encodeURIComponent(token)}/upload`,
        { method: "POST", body: form },
      );
      const json = (await res.json()) as
        | {
            ok: true;
            data: {
              storageKey: string;
              originalName: string;
              mimeType: string;
              sizeBytes: number;
            };
          }
        | { ok: false; error: string };
      if (!json.ok) throw new Error(json.error);

      setDocs((prev) => [
        ...prev,
        {
          storageKey: json.data.storageKey,
          originalName: json.data.originalName || file.name,
          mimeType: json.data.mimeType || file.type,
          sizeBytes: json.data.sizeBytes || file.size,
          category: "IDENTITY",
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir el archivo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!consentAccepted) {
      setError("Debes aceptar el consentimiento para continuar.");
      return;
    }
    setPending(true);
    try {
      const textHash = await hashIntakeConsentText(INTAKE_CONSENT.text);
      const payload = {
        ...(primaryGoal ? { primaryGoal } : {}),
        ...(consultationReason.trim()
          ? { consultationReason: consultationReason.trim() }
          : {}),
        ...Object.fromEntries(
          FLAG_FIELDS.map(({ key }) => [key, Boolean(flags[key])]),
        ),
        ...(reportProvider.trim()
          ? { reportProvider: reportProvider.trim() }
          : {}),
        hasRecentReportAccess,
      };
      const res = await fetch(
        `/api/public/intake/${encodeURIComponent(token)}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName,
            lastName,
            email,
            phone,
            addressLine1,
            city,
            state,
            postalCode,
            payload,
            consent: {
              consentType: INTAKE_CONSENT.consentType,
              version: INTAKE_CONSENT.version,
              textHash,
              signerName: `${firstName} ${lastName}`.trim(),
            },
            documents: docs,
          }),
        },
      );
      const json = (await res.json()) as
        | { ok: true }
        | { ok: false; error: string };
      if (!json.ok) throw new Error(json.error || "No se pudo enviar.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar.");
    } finally {
      setPending(false);
    }
  }

  if (boot === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Cargando formulario…
      </p>
    );
  }

  if (boot === "error") {
    return <Alert tone="error">{bootError}</Alert>;
  }

  if (done) {
    return (
      <Alert tone="success">
        Gracias. Recibimos tu información. El equipo de {orgName} se pondrá en
        contacto contigo.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="firstName">
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            autoComplete="given-name"
          />
        </Field>
        <Field label="Apellido" htmlFor="lastName">
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Correo" htmlFor="email">
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </Field>
        <Field label="Teléfono" htmlFor="phone">
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </Field>
      </div>

      <Field label="Dirección" htmlFor="addressLine1">
        <Input
          id="addressLine1"
          value={addressLine1}
          onChange={(e) => setAddressLine1(e.target.value)}
          autoComplete="street-address"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Ciudad" htmlFor="city">
          <Input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            autoComplete="address-level2"
          />
        </Field>
        <Field label="Estado" htmlFor="state">
          <Input
            id="state"
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase())}
            maxLength={2}
            placeholder="TX"
            autoComplete="address-level1"
          />
        </Field>
        <Field label="ZIP" htmlFor="postalCode">
          <Input
            id="postalCode"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            autoComplete="postal-code"
          />
        </Field>
      </div>

      <Field label="Meta principal" htmlFor="primaryGoal">
        <Select
          id="primaryGoal"
          value={primaryGoal}
          onChange={(e) => setPrimaryGoal(e.target.value)}
        >
          <option value="">Seleccionar…</option>
          {INTAKE_PRIMARY_GOALS.map((goal) => (
            <option key={goal} value={goal}>
              {labelFor(INTAKE_PRIMARY_GOAL_LABELS, goal)}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Motivo de la consulta" htmlFor="consultationReason">
        <Textarea
          id="consultationReason"
          value={consultationReason}
          onChange={(e) => setConsultationReason(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Cuéntanos tu situación crediticia…"
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">
          ¿Tienes alguno de estos problemas?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {FLAG_FIELDS.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-2 text-sm text-ink"
            >
              <input
                type="checkbox"
                className="size-4 rounded border-border-subtle text-action-primary"
                checked={Boolean(flags[key])}
                onChange={(e) =>
                  setFlags((prev) => ({ ...prev, [key]: e.target.checked }))
                }
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Proveedor del reporte" htmlFor="reportProvider">
          <Input
            id="reportProvider"
            value={reportProvider}
            onChange={(e) => setReportProvider(e.target.value)}
            placeholder="SmartCredit, AnnualCreditReport…"
            maxLength={100}
          />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 rounded border-border-subtle text-action-primary"
            checked={hasRecentReportAccess}
            onChange={(e) => setHasRecentReportAccess(e.target.checked)}
          />
          Tengo acceso reciente al reporte
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">Documentos (opcional)</p>
        <p className="text-xs text-text-secondary">
          PDF, JPG o PNG · máximo 15 MB cada uno. Elige la categoría de cada
          archivo.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,image/jpeg,image/png"
          disabled={uploading || pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadFile(file);
          }}
          className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-control file:border-0 file:bg-surface-panel file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-nav-hover"
        />
        {uploading ? (
          <p className="flex items-center gap-2 text-xs text-text-secondary">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Subiendo…
          </p>
        ) : null}
        {docs.length > 0 ? (
          <ul className="space-y-2">
            {docs.map((doc) => (
              <li
                key={doc.storageKey}
                className="flex flex-col gap-1 rounded-control bg-surface-panel px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-text-secondary-strong">
                  {doc.originalName}
                </span>
                <Select
                  className="sm:w-48"
                  value={doc.category}
                  onChange={(e) => {
                    const category = e.target.value as DocCategory;
                    setDocs((prev) =>
                      prev.map((d) =>
                        d.storageKey === doc.storageKey
                          ? { ...d, category }
                          : d,
                      ),
                    );
                  }}
                >
                  {DOC_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {labelFor(DOCUMENT_CATEGORY_LABELS, cat)}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="rounded-control bg-surface-panel px-3 py-3">
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1 size-4 rounded border-border-subtle text-action-primary"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
            required
          />
          <span>
            <span className="font-medium">Consentimiento (obligatorio)</span>
            <span className="mt-1 block text-text-secondary">
              {INTAKE_CONSENT.text}
            </span>
          </span>
        </label>
      </div>

      <Button type="submit" disabled={pending || uploading} className="w-full">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Enviando…
          </>
        ) : (
          "Enviar información"
        )}
      </Button>
    </form>
  );
}
