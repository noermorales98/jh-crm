"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
} from "@/src/components/ui";
import { changeMemberName, changeOwnName } from "@/src/actions/users";
import { playActionResult } from "@/src/lib/cuelume";

/**
 * Diálogo para cambiar el nombre de visualización.
 * - mode=own: el usuario cambia el suyo.
 * - mode=member: OWNER/ADMIN cambia el de cualquier miembro (incl. admin).
 * El JWT refresca `name` desde DB en cada request (sin cerrar sesión).
 */
export function ChangeNameDialog({
  mode,
  userId,
  currentName,
  triggerClassName,
  triggerLabel = "Cambiar nombre",
}: {
  mode: "own" | "member";
  userId?: string;
  currentName: string;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openModal() {
    setName(currentName);
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
          ? await changeOwnName({ name })
          : await changeMemberName(userId!, { name });
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
      <Modal open={open} onClose={close} title="Cambiar nombre">
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <p className="text-sm text-text-secondary">
            Actual:{" "}
            <span className="font-medium text-ink">
              {currentName || "Sin nombre"}
            </span>
            . Se muestra en el CRM (saludo, menú, asignaciones).
          </p>
          <Field label="Nombre" htmlFor="change-name">
            <Input
              id="change-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              maxLength={100}
              disabled={pending}
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
