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

export function LoginForm() {
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);

    const formData = new FormData(event.currentTarget);
    const callbackUrl = safeRedirectPath(
      new URLSearchParams(window.location.search).get("callbackUrl"),
    );

    const result = await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirect: false,
      callbackUrl,
    });

    if (!result || result.error) {
      play("error");
      setError("El correo o la contraseña no coinciden. Revisa e inténtalo de nuevo.");
      setPending(false);
      return;
    }

    window.location.assign(result.url || callbackUrl);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Field label="Correo electrónico" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
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

      {error ? (
        <p id="login-error" className="sr-only">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Ingresando…
          </>
        ) : (
          "Ingresar"
        )}
      </Button>
    </form>
  );
}
