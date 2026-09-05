"use client";

import { useState } from "react";
import { play } from "cuelume";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Alert, Button, Field, Input } from "@/src/components/ui";

function safeRedirectPath(raw: string | null): string {
  if (!raw) return "/portal";
  try {
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      return raw.startsWith("/portal") ? raw : "/portal";
    }
    const url = new URL(raw);
    if (
      url.origin === window.location.origin &&
      url.pathname.startsWith("/portal")
    ) {
      return `${url.pathname}${url.search}`;
    }
  } catch {
    // URL inválida
  }
  return "/portal";
}

export function PortalLoginForm() {
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

    const result = await signIn("portal", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      audience: "portal",
      redirect: false,
      callbackUrl,
    });

    if (!result || result.error) {
      play("error");
      setError(
        "El correo o la contraseña no coinciden. Revisa e inténtalo de nuevo.",
      );
      setPending(false);
      return;
    }

    window.location.assign(result.url || callbackUrl);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Field label="Correo electrónico" htmlFor="portal-email">
        <Input
          id="portal-email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          placeholder="tu@correo.com"
          invalid={Boolean(error)}
        />
      </Field>

      <Field label="Contraseña" htmlFor="portal-password">
        <Input
          id="portal-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          invalid={Boolean(error)}
        />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Ingresando…
          </>
        ) : (
          "Ingresar al portal"
        )}
      </Button>
    </form>
  );
}
