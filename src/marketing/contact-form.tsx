"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ContactSlideConfirm } from "./contact-slide-confirm";

type Challenge = { token: string };

type Draft = {
  name: string;
  email: string;
  phone: string;
  message: string;
  website: string;
};

function answerFromToken(token: string): string | null {
  const [aRaw, bRaw] = token.split("|");
  const a = Number(aRaw);
  const b = Number(bRaw);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  return String(a + b);
}

function readDraft(form: HTMLFormElement): Draft {
  const fields = new FormData(form);
  return {
    name: String(fields.get("name") ?? "").trim(),
    email: String(fields.get("email") ?? "").trim(),
    phone: String(fields.get("phone") ?? "").trim(),
    message: String(fields.get("message") ?? "").trim(),
    website: String(fields.get("website") ?? ""),
  };
}

function validateDraft(draft: Draft): string | null {
  if (draft.name.length < 2) return "El nombre es obligatorio.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) {
    return "Ingresa un correo electrónico válido.";
  }
  if (!/^[\d\s()+.-]{7,20}$/.test(draft.phone)) return "Teléfono inválido.";
  if (draft.message.length < 10) {
    return "Cuéntanos un poco más (mínimo 10 caracteres).";
  }
  return null;
}

export function ContactForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const sendingRef = useRef(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [status, setStatus] = useState<"idle" | "confirm" | "sending" | "ok" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const loadChallenge = useCallback(async () => {
    const res = await fetch("/api/public/contact", { cache: "no-store" });
    const data = (await res.json()) as {
      ok?: boolean;
      token?: string;
      error?: string;
    };
    if (!res.ok || !data.token) {
      throw new Error(data.error ?? "No se pudo cargar la verificación.");
    }
    setChallenge({ token: data.token });
  }, []);

  useEffect(() => {
    loadChallenge().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "No se pudo cargar el formulario.");
    });
  }, [loadChallenge]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge || status === "sending" || status === "confirm") return;
    const draft = readDraft(event.currentTarget);
    const invalid = validateDraft(draft);
    if (invalid) {
      setStatus("error");
      setError(invalid);
      return;
    }
    setError(null);
    setStatus("confirm");
  }

  async function sendConfirmed() {
    const form = formRef.current;
    if (!form || !challenge || sendingRef.current) return;
    sendingRef.current = true;
    const draft = readDraft(form);
    const invalid = validateDraft(draft);
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
      await loadChallenge();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "No se pudo enviar. Inténtalo de nuevo.");
      await loadChallenge().catch(() => undefined);
    } finally {
      sendingRef.current = false;
    }
  }

  if (status === "ok") {
    return (
      <div className="contact-form-ok" role="status">
        <h3>Mensaje enviado</h3>
        <p>Gracias. Recibimos su consulta y le contactaremos pronto.</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setStatus("idle");
            setError(null);
          }}
        >
          Enviar otra consulta
        </button>
      </div>
    );
  }

  return (
    <>
      <form ref={formRef} className="contact-form" onSubmit={onSubmit} noValidate>
        <h3>Escríbanos</h3>
        <p>Cuéntenos su situación. Respondemos personalmente a cada mensaje.</p>

        <label className="hp" htmlFor="contact-website">
          Sitio web
          <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>

        <label htmlFor="contact-name">
          Nombre completo
          <input id="contact-name" name="name" type="text" autoComplete="name" required maxLength={120} />
        </label>
        <label htmlFor="contact-email">
          Correo electrónico
          <input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={200} />
        </label>
        <label htmlFor="contact-phone">
          Teléfono
          <input id="contact-phone" name="phone" type="tel" autoComplete="tel" required maxLength={20} />
        </label>
        <label htmlFor="contact-message">
          Mensaje
          <textarea id="contact-message" name="message" rows={4} required maxLength={2000} aria-describedby={error ? "contact-error" : undefined} />
        </label>

        {error ? (
          <p className="contact-form-error" role="alert" id="contact-error">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary" disabled={!challenge || status === "sending"}>
          {!challenge ? "Cargando formulario…" : "Enviar consulta"}
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
