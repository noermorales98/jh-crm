"use client";

import { useState } from "react";
import { play } from "cuelume";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Alert, Button, Field, Input } from "@/src/components/ui";

function safeRedirectPath(raw: string | null): string {
  if (!raw) return "/crm/dashboard";
  try {
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      return raw.startsWith("/crm") ? raw : "/crm/dashboard";
    }
    const url = new URL(raw);
    if (
      url.origin === window.location.origin &&
      url.pathname.startsWith("/crm")
    ) {
      return `${url.pathname}${url.search}`;
    }
  } catch {
    // URL inválida: caer al dashboard.
  }
  return "/crm/dashboard";
}

type Step = "credentials" | "mfa";

export function LoginForm() {
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function attemptSignIn(
    creds: { email: string; password: string },
    mfaCode?: string,
  ) {
    const callbackUrl = safeRedirectPath(
      new URLSearchParams(window.location.search).get("callbackUrl"),
    );

    const result = await signIn("credentials", {
      email: creds.email,
      password: creds.password,
      ...(mfaCode ? { mfaCode } : {}),
      redirect: false,
      callbackUrl,
    });

    if (result?.ok) {
      window.location.assign(result.url || callbackUrl);
      return;
    }

    const code = result?.code ?? "";
    if (code === "mfa_required") {
      setStep("mfa");
      setError(undefined);
      setPending(false);
      return;
    }
    if (code === "mfa_invalid") {
      play("error");
      setError("Código MFA inválido o cuenta bloqueada temporalmente.");
      setPending(false);
      return;
    }
    if (code === "rate_limit") {
      play("error");
      setError("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");
      setPending(false);
      return;
    }

    play("error");
    setError(
      step === "mfa"
        ? "Código MFA inválido. Revisa e inténtalo de nuevo."
        : "El correo o la contraseña no coinciden. Revisa e inténtalo de nuevo.",
    );
    setPending(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);

    const formData = new FormData(event.currentTarget);

    if (step === "credentials") {
      const nextEmail = String(formData.get("email") ?? "").trim();
      const nextPassword = String(formData.get("password") ?? "");
      setEmail(nextEmail);
      setPassword(nextPassword);
      await attemptSignIn({ email: nextEmail, password: nextPassword });
      return;
    }

    const mfaCode = String(formData.get("mfaCode") ?? "").trim();
    await attemptSignIn({ email, password }, mfaCode);
  }

  function backToCredentials() {
    setStep("credentials");
    setError(undefined);
    setPassword("");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {step === "credentials" ? (
        <>
          <Field label="Correo electrónico" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              defaultValue={email}
              placeholder="nombre@jhmultiservices.com"
              invalid={Boolean(error)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
            />
          </Field>

          <Field label="Contraseña" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              invalid={Boolean(error)}
              aria-invalid={error ? true : undefined}
            />
          </Field>
        </>
      ) : (
        <>
          <Alert tone="info">
            Introduce el código de tu app de autenticación o un código de
            recuperación.
          </Alert>
          <Field label="Código MFA" htmlFor="mfaCode">
            <Input
              id="mfaCode"
              name="mfaCode"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              placeholder="000000"
              invalid={Boolean(error)}
              aria-invalid={error ? true : undefined}
            />
          </Field>
        </>
      )}

      {error ? (
        <p id="login-error" className="sr-only">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {step === "mfa" ? "Verificando…" : "Ingresando…"}
          </>
        ) : step === "mfa" ? (
          "Verificar e ingresar"
        ) : (
          "Ingresar"
        )}
      </Button>

      {step === "mfa" ? (
        <button
          type="button"
          onClick={backToCredentials}
          className="w-full text-center text-sm text-text-secondary underline-offset-2 hover:underline"
        >
          Volver al correo y contraseña
        </button>
      ) : null}
    </form>
  );
}
