"use client";

import { useActionState } from "react";
import { Loader2, Lock, Mail } from "lucide-react";
import { loginAction, type LoginFormState } from "@/src/actions/auth";

const initialState: LoginFormState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <div
          role="alert"
          className="rounded-control border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {state.error}
        </div>
      ) : null}

      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-xs font-semibold text-text-secondary-strong"
        >
          Correo electrónico
        </label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-placeholder"
            aria-hidden
          />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="tu@jhmultiservices.com"
            className="block min-h-11 w-full rounded-control border border-border-subtle bg-surface-elevated py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-text-placeholder focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/15"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-xs font-semibold text-text-secondary-strong"
        >
          Contraseña
        </label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-placeholder"
            aria-hidden
          />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="block min-h-11 w-full rounded-control border border-border-subtle bg-surface-elevated py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-text-placeholder focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/15"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-action-primary px-4 py-2.5 text-sm font-semibold text-action-primary-foreground transition-colors duration-200 hover:bg-action-secondary motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Ingresando…
          </>
        ) : (
          "Ingresar"
        )}
      </button>
    </form>
  );
}
