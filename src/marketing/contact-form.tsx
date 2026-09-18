"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ContactSlideConfirm } from "./contact-slide-confirm";
import {
  invalidateContactChallenge,
  loadContactChallenge,
} from "./contact-challenge";
import {
  composeInternationalPhone,
  DEFAULT_PHONE_DIAL_CODE,
  PHONE_DIAL_OPTIONS,
} from "@/src/lib/phone-dial";

type Challenge = { token: string };

type Draft = {
  name: string;
  email: string;
  phone: string;
  message: string;
  website: string;
  privacyAccepted: boolean;
  smsConsent: boolean;
};

type AttributionFields = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  fbclid: string;
  gclid: string;
  landingPage: string;
  referrer: string;
};

type ContactFormProps = {
  variant?: "hero" | "full";
};

const HERO_MESSAGE =
  "Consulta de crédito ($1 USD). Quiero un análisis de mi reporte y orientación sobre reparación crediticia.";

const ATTR_PARAM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
] as const;

function emptyAttribution(): AttributionFields {
  return {
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    utm_content: "",
    utm_term: "",
    fbclid: "",
    gclid: "",
    landingPage: "",
    referrer: "",
  };
}

function readAttributionFromUrl(): AttributionFields {
  if (typeof window === "undefined") return emptyAttribution();
  const params = new URLSearchParams(window.location.search);
  const out = emptyAttribution();
  for (const key of ATTR_PARAM_KEYS) {
    const value = params.get(key)?.trim();
    if (value) out[key] = value.slice(0, 500);
  }
  out.landingPage = window.location.href.slice(0, 500);
  out.referrer = (document.referrer || "").slice(0, 500);
  return out;
}

function answerFromToken(token: string): string | null {
  const [aRaw, bRaw] = token.split("|");
  const a = Number(aRaw);
  const b = Number(bRaw);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  return String(a + b);
}

function readDraft(
  form: HTMLFormElement,
  variant: "hero" | "full",
  dialCode: string,
): Draft {
  const fields = new FormData(form);
  const rawMessage = String(fields.get("message") ?? "").trim();
  const national = String(fields.get("phoneNational") ?? "").trim();
  return {
    name: String(fields.get("name") ?? "").trim(),
    email: String(fields.get("email") ?? "").trim(),
    phone: composeInternationalPhone(dialCode, national),
    message:
      variant === "hero"
        ? rawMessage.length >= 10
          ? rawMessage
          : HERO_MESSAGE
        : rawMessage,
    website: String(fields.get("website") ?? ""),
    privacyAccepted: fields.get("privacyAccepted") === "on",
    smsConsent: fields.get("smsConsent") === "on",
  };
}

function validateDraft(draft: Draft, variant: "hero" | "full"): string | null {
  if (draft.name.length < 2) return "El nombre es obligatorio.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) {
    return "Ingresa un correo electrónico válido.";
  }
  const compact = draft.phone.replace(/[\s()-]/g, "");
  if (!/^\+\d{8,18}$/.test(compact)) {
    return "Teléfono inválido.";
  }
  if (variant === "full" && draft.message.length < 10) {
    return "Cuéntanos un poco más (mínimo 10 caracteres).";
  }
  if (!draft.privacyAccepted) {
    return "Debes aceptar la política de privacidad para continuar.";
  }
  return null;
}

const SUCCESS_NO_CHARGE =
  "Solicitud recibida. No se ha cobrado ningún pago. Le contactaremos pronto.";

export function ContactForm({ variant = "full" }: ContactFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const sendingRef = useRef(false);
  const uid = useId();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [status, setStatus] = useState<
    "idle" | "confirm" | "sending" | "ok" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldInvalid, setFieldInvalid] = useState(false);
  const [attribution, setAttribution] =
    useState<AttributionFields>(emptyAttribution);
  const [dialCode, setDialCode] = useState(DEFAULT_PHONE_DIAL_CODE);

  const loadChallenge = useCallback(async (opts?: { fresh?: boolean }) => {
    if (opts?.fresh) invalidateContactChallenge();
    const next = await loadContactChallenge();
    setChallenge(next);
  }, []);

  useEffect(() => {
    setAttribution(readAttributionFromUrl());
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Un solo GET compartido: hero y full esperan la misma promesa.
    loadChallenge().catch((err: unknown) => {
      if (cancelled) return;
      setFieldInvalid(false);
      setError(
        err instanceof Error ? err.message : "No se pudo cargar el formulario.",
      );
    });
    return () => {
      cancelled = true;
    };
  }, [loadChallenge]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge || status === "sending" || status === "confirm") return;
    const draft = readDraft(event.currentTarget, variant, dialCode);
    const invalid = validateDraft(draft, variant);
    if (invalid) {
      setStatus("error");
      setFieldInvalid(true);
      setError(invalid);
      return;
    }
    setError(null);
    setFieldInvalid(false);
    setStatus("confirm");
  }

  async function sendConfirmed() {
    const form = formRef.current;
    if (!form || !challenge || sendingRef.current) return;
    sendingRef.current = true;
    const draft = readDraft(form, variant, dialCode);
    const invalid = validateDraft(draft, variant);
    const answer = answerFromToken(challenge.token);
    if (invalid || !answer) {
      setStatus("error");
      setError(invalid ?? "Recarga la página e inténtalo de nuevo.");
      return;
    }

    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          ...attribution,
          privacyAccepted: draft.privacyAccepted,
          smsConsent: draft.smsConsent,
          challengeToken: challenge.token,
          challengeAnswer: answer,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo enviar. Inténtalo de nuevo.");
      }
      setStatus("ok");
      form.reset();
      setDialCode(DEFAULT_PHONE_DIAL_CODE);
      await loadChallenge({ fresh: true });
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "No se pudo enviar. Inténtalo de nuevo.",
      );
      await loadChallenge({ fresh: true }).catch(() => undefined);
    } finally {
      sendingRef.current = false;
    }
  }

  const isHero = variant === "hero";
  const formClass = isHero ? "contact-form contact-form--hero" : "contact-form";
  const errorId = `${uid}-error`;

  if (status === "ok") {
    return (
      <div
        className={
          isHero ? "contact-form-ok contact-form-ok--hero" : "contact-form-ok"
        }
        role="status"
      >
        <div className="form-ok-icon" aria-hidden="true">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h3>Solicitud recibida</h3>
        <p>{SUCCESS_NO_CHARGE}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setStatus("idle");
            setError(null);
            setFieldInvalid(false);
          }}
        >
          Enviar otra consulta
        </button>
      </div>
    );
  }

  return (
    <>
      <form ref={formRef} className={formClass} onSubmit={onSubmit} noValidate>
        {isHero ? (
          <>
            <p className="form-price">Consulta de crédito · $1 USD</p>
            <h3>Análisis y reparación de crédito</h3>
            <p>
              Solicite una revisión inicial: analizamos su situación crediticia y le orientamos sobre
              el siguiente paso.
            </p>
          </>
        ) : (
          <>
            <h3>Escríbanos sobre su crédito</h3>
            <p>
              Cuéntenos su situación crediticia. Respondemos personalmente a cada mensaje.
            </p>
          </>
        )}

        <label className="hp" htmlFor={`${uid}-website`}>
          Sitio web
          <input
            id={`${uid}-website`}
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </label>

        {ATTR_PARAM_KEYS.map((key) => (
          <input
            key={key}
            type="hidden"
            name={key}
            value={attribution[key]}
            readOnly
          />
        ))}
        <input
          type="hidden"
          name="landingPage"
          value={attribution.landingPage}
          readOnly
        />
        <input
          type="hidden"
          name="referrer"
          value={attribution.referrer}
          readOnly
        />

        <div className="form-fields">
          <label htmlFor={`${uid}-name`}>
            <span className="field-label">Nombre completo</span>
            <input
              id={`${uid}-name`}
              name="name"
              type="text"
              autoComplete="name"
              required
              maxLength={120}
              placeholder="María González"
              aria-invalid={fieldInvalid}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          <label htmlFor={`${uid}-email`}>
            <span className="field-label">Correo electrónico</span>
            <input
              id={`${uid}-email`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={200}
              placeholder="nombre@correo.com"
              aria-invalid={fieldInvalid}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          <div className="phone-field">
            <span className="field-label" id={`${uid}-phone-label`}>
              Teléfono
            </span>
            <div
              className="phone-field-row"
              role="group"
              aria-labelledby={`${uid}-phone-label`}
            >
              <label className="phone-dial-label" htmlFor={`${uid}-dial`}>
                <span className="sr-only">Código de país</span>
                <select
                  id={`${uid}-dial`}
                  name="phoneDial"
                  value={dialCode}
                  onChange={(e) => setDialCode(e.target.value)}
                  aria-invalid={fieldInvalid}
                  aria-describedby={error ? errorId : undefined}
                >
                  {PHONE_DIAL_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="phone-national-label" htmlFor={`${uid}-phone`}>
                <span className="sr-only">Número</span>
                <input
                  id={`${uid}-phone`}
                  name="phoneNational"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  required
                  maxLength={20}
                  placeholder="(872) 555-0123"
                  aria-invalid={fieldInvalid}
                  aria-describedby={error ? errorId : undefined}
                />
              </label>
            </div>
          </div>

          {isHero ? null : (
            <label htmlFor={`${uid}-message`}>
              <span className="field-label">Mensaje</span>
              <textarea
                id={`${uid}-message`}
                name="message"
                rows={4}
                required
                maxLength={2000}
                placeholder="Cuéntenos qué necesita…"
                aria-invalid={fieldInvalid}
                aria-describedby={error ? errorId : undefined}
              />
            </label>
          )}
        </div>

        <div className="form-consents">
          <label className="form-consent" htmlFor={`${uid}-privacy`}>
            <input
              id={`${uid}-privacy`}
              name="privacyAccepted"
              type="checkbox"
              required
              aria-invalid={fieldInvalid}
            />
            <span>
              Acepto la{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer">
                privacidad
              </a>
            </span>
          </label>
          <label className="form-consent" htmlFor={`${uid}-sms`}>
            <input id={`${uid}-sms`} name="smsConsent" type="checkbox" />
            <span>
              Acepto SMS (
              <a href="/sms-terms" target="_blank" rel="noopener noreferrer">
                términos
              </a>
              )
            </span>
          </label>
        </div>

        {error ? (
          <p className="contact-form-error" role="alert" id={errorId}>
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={!challenge || status === "sending"}
          aria-busy={!challenge || status === "sending"}
        >
          {!challenge ? "Preparando…" : isHero ? "Comenzar" : "Enviar consulta"}
        </button>
      </form>

      <ContactSlideConfirm
        open={status === "confirm" || status === "sending"}
        busy={status === "sending"}
        onConfirm={() => {
          void sendConfirmed();
        }}
        onCancel={() => {
          if (status === "sending") return;
          setStatus("idle");
        }}
      />
    </>
  );
}
