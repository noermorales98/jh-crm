"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Select,
} from "@/src/components/ui";
import { inviteUser } from "@/src/actions/users";

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  SPECIALIST: "Especialista",
  STAFF: "Staff",
  VIEWER: "Solo lectura",
};

const INVITABLE_ROLES = ["ADMIN", "SPECIALIST", "STAFF", "VIEWER"];

/**
 * Botón + modal para invitar un miembro. La contraseña temporal se
 * muestra UNA sola vez para entrega manual (no hay email transaccional).
 */
export function InviteUserButton({ canInviteOwner }: { canInviteOwner: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("STAFF");
  const [error, setError] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openModal() {
    setName("");
    setEmail("");
    setRole("STAFF");
    setError(null);
    setTemporaryPassword(null);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    if (temporaryPassword) router.refresh();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await inviteUser({ name, email, role });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTemporaryPassword(result.data.temporaryPassword);
    });
  }

  const roles = canInviteOwner ? ["OWNER", ...INVITABLE_ROLES] : INVITABLE_ROLES;

  return (
    <>
      <Button size="sm" onClick={openModal}>
        <Plus className="size-4" aria-hidden />
        Invitar usuario
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Invitar usuario"
        description="Se crea el usuario con una contraseña temporal que deberás entregar manualmente."
      >
        {temporaryPassword ? (
          <div className="space-y-4">
            <Alert tone="success">
              Usuario creado. Entrega esta contraseña temporal por un canal
              seguro: <strong>no se volverá a mostrar</strong>.
            </Alert>
            <div className="rounded-control border border-border-subtle bg-surface-app px-4 py-3 text-center">
              <code className="select-all font-mono text-sm font-semibold text-ink">
                {temporaryPassword}
              </code>
            </div>
            <div className="flex justify-end">
              <Button onClick={close}>Entendido</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Field label="Nombre" htmlFor="invite-name" required>
              <Input
                id="invite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                autoComplete="off"
              />
            </Field>
            <Field label="Correo electrónico" htmlFor="invite-email" required>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </Field>
            <Field label="Rol" htmlFor="invite-role" required>
              <Select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {roles.map((value) => (
                  <option key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={pending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creando…" : "Crear usuario"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
