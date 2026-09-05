"use client";

import { useState, useTransition } from "react";
import { play } from "cuelume";
import { ShieldCheck, ShieldOff } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  Input,
} from "@/src/components/ui";
import {
  beginMfaSetupAction,
  confirmMfaSetupAction,
  disableMfaAction,
} from "@/src/actions/mfa";

type SetupState = {
  secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
} | null;

export function MfaSettingsPanel({
  initialEnabled,
  recommended,
}: {
  initialEnabled: boolean;
  recommended: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [setup, setSetup] = useState<SetupState>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function beginSetup() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await beginMfaSetupAction();
      if (!result.ok) {
        play("error");
        setError(result.error);
        return;
      }
      play("success");
      setSetup(result.data);
      setCode("");
    });
  }

  function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await confirmMfaSetupAction(code);
      if (!result.ok) {
        play("error");
        setError(result.error);
        return;
      }
      play("success");
      setEnabled(true);
      setSetup(null);
      setCode("");
      setSuccess("Autenticación en dos pasos activada.");
    });
  }

  function disable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await disableMfaAction(disableCode);
      if (!result.ok) {
        play("error");
        setError(result.error);
        return;
      }
      play("success");
      setEnabled(false);
      setDisableCode("");
      setSetup(null);
      setSuccess("Autenticación en dos pasos desactivada.");
    });
  }

  return (
    <div className="space-y-6">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      <div className="flex items-start gap-3">
        {enabled ? (
          <ShieldCheck className="mt-0.5 size-5 text-emerald-600" aria-hidden />
        ) : (
          <ShieldOff className="mt-0.5 size-5 text-text-secondary" aria-hidden />
        )}
        <div>
          <p className="text-sm font-medium text-ink">
            {enabled
              ? "MFA activada en tu cuenta"
              : "MFA desactivada en tu cuenta"}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {recommended
              ? "Tu rol debería usar autenticación en dos pasos. El enrolamiento es opcional por ahora; si la activas, se exigirá en cada inicio de sesión."
              : "Puedes activar un segundo factor con una app TOTP (Google Authenticator, 1Password, etc.)."}
          </p>
        </div>
      </div>

      {!enabled && !setup ? (
        <Button type="button" onClick={beginSetup} disabled={pending}>
          Configurar MFA
        </Button>
      ) : null}

      {setup ? (
        <form onSubmit={confirmSetup} className="space-y-4 border-t border-border-subtle pt-4">
          <Alert tone="info">
            Escanea el URI con tu app o introduce el secreto manualmente.
            Guarda los códigos de recuperación: solo se muestran una vez.
          </Alert>
          <Field label="Secreto (base32)" htmlFor="mfa-secret">
            <Input
              id="mfa-secret"
              readOnly
              value={setup.secret}
              className="font-mono text-sm"
            />
          </Field>
          <Field label="URI otpauth" htmlFor="mfa-uri">
            <Input
              id="mfa-uri"
              readOnly
              value={setup.otpauthUri}
              className="font-mono text-xs"
            />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">
              Códigos de recuperación
            </p>
            <ul className="grid gap-1 rounded-lg bg-surface-app p-3 font-mono text-sm sm:grid-cols-2">
              {setup.recoveryCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <Field label="Código de verificación" htmlFor="mfa-confirm">
            <Input
              id="mfa-confirm"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              required
            />
          </Field>
          <Button type="submit" disabled={pending || code.trim().length < 6}>
            Confirmar y activar
          </Button>
        </form>
      ) : null}

      {enabled ? (
        <form onSubmit={disable} className="space-y-4 border-t border-border-subtle pt-4">
          <Field
            label="Código MFA o de recuperación"
            htmlFor="mfa-disable"
            hint="Necesario para desactivar la protección."
          >
            <Input
              id="mfa-disable"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              autoComplete="one-time-code"
              required
            />
          </Field>
          <Button type="submit" variant="secondary" disabled={pending}>
            Desactivar MFA
          </Button>
        </form>
      ) : null}
    </div>
  );
}
