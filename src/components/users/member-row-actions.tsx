"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  ConfirmDialog,
  Select,
} from "@/src/components/ui";
import { deactivateUser, updateMemberRole } from "@/src/actions/users";
import { playActionResult } from "@/src/lib/cuelume";
import { ROLE_LABELS } from "./invite-user-button";
import { ChangeEmailDialog } from "./change-email-dialog";
import { ChangeNameDialog } from "./change-name-dialog";

const ALL_ROLES = ["OWNER", "ADMIN", "SPECIALIST", "STAFF", "VIEWER"];

/**
 * Acciones por miembro: cambiar rol (select + guardar) y desactivar.
 * El backend protege al único OWNER activo y al propio usuario.
 */
export function MemberRowActions({
  userId,
  name,
  email,
  role,
  isActive,
  isSelf,
  canAssignOwner,
}: {
  userId: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  isSelf: boolean;
  canAssignOwner: boolean;
}) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState(role);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const roleChanged = selectedRole !== role;
  const roles = canAssignOwner
    ? ALL_ROLES
    : ALL_ROLES.filter((r) => r !== "OWNER");

  function saveRole() {
    setError(null);
    startTransition(async () => {
      const result = await updateMemberRole(userId, { role: selectedRole });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        setSelectedRole(role);
        return;
      }
      playActionResult(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Select
          aria-label={`Rol de ${name}`}
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          disabled={pending || !isActive}
          className="w-36"
        >
          {roles.map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </Select>
        {roleChanged ? (
          <Button size="sm" onClick={saveRole} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        ) : null}
        {isActive ? (
          <>
            {isSelf ? (
              <ChangeNameDialog
                mode="own"
                currentName={name}
                triggerClassName="inline-flex h-8 items-center rounded-control px-2 text-sm font-medium text-action-primary hover:bg-nav-hover"
              />
            ) : (
              <ChangeNameDialog
                mode="member"
                userId={userId}
                currentName={name}
                triggerClassName="inline-flex h-8 items-center rounded-control px-2 text-sm font-medium text-action-primary hover:bg-nav-hover"
              />
            )}
            {isSelf ? (
              <ChangeEmailDialog
                mode="own"
                currentEmail={email}
                triggerClassName="inline-flex h-8 items-center rounded-control px-2 text-sm font-medium text-action-primary hover:bg-nav-hover"
              />
            ) : (
              <ChangeEmailDialog
                mode="member"
                userId={userId}
                currentEmail={email}
                triggerClassName="inline-flex h-8 items-center rounded-control px-2 text-sm font-medium text-action-primary hover:bg-nav-hover"
              />
            )}
          </>
        ) : null}
        {isActive && !isSelf ? (
          <ConfirmDialog
            title="Desactivar usuario"
            message={
              <>
                <strong>{name}</strong> ya no podrá iniciar sesión. Sus
                registros y auditoría se conservan.
              </>
            }
            confirmLabel="Desactivar"
            danger
            trigger={
              <Button variant="ghost" size="sm">
                Desactivar
              </Button>
            }
            onConfirm={async () => {
              const result = await deactivateUser(userId);
              if (!result.ok) return result.error;
              router.refresh();
            }}
          />
        ) : null}
      </div>
      {error ? (
        <Alert tone="error">
          <span className="text-xs">{error}</span>
        </Alert>
      ) : null}
    </div>
  );
}
