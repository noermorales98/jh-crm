"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
} from "@/src/components/ui";
import { changeMemberEmail, changeOwnEmail } from "@/src/actions/users";
import { playActionResult } from "@/src/lib/cuelume";

/**
 * Diálogo para cambiar correo de login.
 * - mode=own: pide contraseña actual y cierra sesión al éxito.
 * - mode=member: OWNER/ADMIN sin contraseña del otro usuario.
 */
export function ChangeEmailDialog({
  mode,
  userId,
  currentEmail,
  triggerClassName,
  triggerLabel = "Cambiar correo",
}: {
  mode: "own" | "member";
  userId?: string;
  currentEmail: string;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openModal() {
    setEmail(currentEmail);
    setCurrentPassword("");
    setError(null);
    setOpen(true);
  }

  function close() {
    if (!pending) setOpen(false);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result =
        mode === "own"
          ? await changeOwnEmail({ email, currentPassword })
          : await changeMemberEmail(userId!, { email });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setOpen(false);
      if (mode === "own") {
        await signOut({ callbackUrl: "/login" });
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className={
          triggerClassName ??
          "text-sm font-medium text-action-primary hover:underline"
        }
        onClick={openModal}
      >
        {triggerLabel}
      </button>
      <Modal open={open} onClose={close} title="Cambiar correo de inicio de sesión">
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <p className="text-sm text-text-secondary">
            Actual: <span className="font-medium text-ink">{currentEmail}</span>
            {mode === "own"
              ? ". Tras el cambio deberás iniciar sesión de nuevo."
              : ". El miembro deberá iniciar sesión con el correo nuevo."}
          </p>
          <Field label="Nuevo correo" htmlFor="change-email">
            <Input
              id="change-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>
          {mode === "own" ? (
            <Field label="Contraseña actual" htmlFor="change-email-password">
              <Input
                id="change-email-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Field>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" disabled={pending} onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar correo"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
