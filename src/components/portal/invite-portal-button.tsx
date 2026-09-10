"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldOff } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Pill,
} from "@/src/components/ui";
import {
  invitePortalAccessAction,
  revokePortalAccessAction,
} from "@/src/actions/portal";
import { playActionResult } from "@/src/lib/cuelume";
import { formatDate } from "@/src/lib/format";

export type PortalAccessSummary = {
  id: string;
  email: string;
  isActive: boolean;
  invitedAt: Date;
  revokedAt: Date | null;
  lastLoginAt: Date | null;
} | null;

export function InvitePortalButton({
  clientId,
  defaultEmail,
  access,
  compact = false,
}: {
  clientId: string;
  defaultEmail?: string | null;
  access: PortalAccessSummary;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openInvite() {
    setEmail(defaultEmail ?? access?.email ?? "");
    setPassword("");
    setError(null);
    setOpen(true);
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await invitePortalAccessAction({
        clientId,
        email,
        temporaryPassword: password,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setOpen(false);
      router.refresh();
    });
  }

  function handleRevoke() {
    if (!confirm("¿Revocar el acceso al portal de este cliente?")) return;
    startTransition(async () => {
      const result = await revokePortalAccessAction({ clientId });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      router.refresh();
    });
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {access ? (
        <div
          className={
            compact
              ? "rounded-control bg-surface-app px-2 py-1.5 text-xs"
              : "rounded-surface bg-surface-app p-3 text-sm"
          }
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium text-ink">{access.email}</span>
            <Pill tone={access.isActive ? "green" : "slate"}>
              {access.isActive ? "Activo" : "Revocado"}
            </Pill>
          </div>
          {!compact ? (
            <p className="mt-1 text-xs text-text-secondary">
              Invitado {formatDate(access.invitedAt)}
              {access.lastLoginAt
                ? ` · Último acceso ${formatDate(access.lastLoginAt)}`
                : ""}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-text-secondary">
              {access.lastLoginAt
                ? `Último acceso ${formatDate(access.lastLoginAt)}`
                : `Invitado ${formatDate(access.invitedAt)}`}
            </p>
          )}
        </div>
      ) : (
        <p className={compact ? "text-xs text-text-secondary" : "text-sm text-text-secondary"}>
          Sin acceso al portal.
        </p>
      )}

      {error && !open ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={openInvite} disabled={pending}>
          <KeyRound className="size-3.5" aria-hidden />
          {access?.isActive ? "Reinvitar" : "Invitar"}
        </Button>
        {access?.isActive ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRevoke}
            disabled={pending}
          >
            <ShieldOff className="size-3.5" aria-hidden />
            Revocar
          </Button>
        ) : null}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={access?.isActive ? "Reinvitar al portal" : "Invitar al portal"}
        description="El cliente entrará en /portal con este correo y la contraseña temporal."
      >
        <form onSubmit={handleInvite} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Correo del portal" htmlFor="portal-email" required>
            <Input
              id="portal-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </Field>
          <Field
            label="Contraseña temporal"
            htmlFor="portal-password"
            required
          >
            <Input
              id="portal-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar acceso"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
