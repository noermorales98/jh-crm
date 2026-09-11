import type { Metadata } from "next";
import { ShieldAlert, UserCog } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as userService from "@/src/server/users";
import {
  Card,
  EmptyState,
  PageHeader,
  Pill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDateTime } from "@/src/lib/format";
import {
  InviteUserButton,
  ROLE_LABELS,
} from "@/src/components/users/invite-user-button";
import { MemberRowActions } from "@/src/components/users/member-row-actions";

export const metadata: Metadata = {
  title: "Usuarios",
};

const ROLE_TONES: Record<string, "purple" | "indigo" | "blue" | "slate"> = {
  OWNER: "purple",
  ADMIN: "indigo",
  SPECIALIST: "blue",
  STAFF: "slate",
  VIEWER: "slate",
};

export default async function UsersPage() {
  const ctx = await requireOrganization();

  if (!can(ctx.role, "users.manage")) {
    return (
      <div>
        <PageHeader
          title="Usuarios"
          description="Gestión de miembros y roles de la organización."
        />
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="Acceso restringido"
            description="Solo el propietario y los administradores pueden gestionar usuarios."
          />
        </Card>
      </div>
    );
  }

  const members = await userService.listMembers(ctx);

  return (
    <div>
      <PageHeader
        title="Usuarios"
        description="Miembros de la organización y sus roles. La contraseña temporal de una invitación se entrega manualmente."
        actions={<InviteUserButton canInviteOwner={ctx.role === "OWNER"} />}
      />

      <Card>
        {members.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="Sin miembros"
            description="Invita al primer miembro del equipo."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Correo</TH>
                <TH>Rol</TH>
                <TH>Estado</TH>
                <TH>Último acceso</TH>
                <TH>Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {members.map((member) => (
                <TR key={member.id} className="transition-colors hover:bg-nav-hover">
                  <TD className="font-medium text-ink">
                    {member.user.name ?? "—"}
                    {member.user.id === ctx.userId ? (
                      <span className="ml-1 text-xs text-text-secondary">(tú)</span>
                    ) : null}
                  </TD>
                  <TD className="font-mono text-[12px] text-text-secondary-strong">{member.user.email}</TD>
                  <TD>
                    <Pill tone={ROLE_TONES[member.role] ?? "slate"}>
                      {ROLE_LABELS[member.role] ?? member.role}
                    </Pill>
                  </TD>
                  <TD>
                    {member.user.isActive ? (
                      <Pill tone="green">Activo</Pill>
                    ) : (
                      <Pill tone="slate">Inactivo</Pill>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap tabular-nums text-text-secondary">
                    {member.user.lastLoginAt
                      ? formatDateTime(member.user.lastLoginAt)
                      : "Nunca"}
                  </TD>
                  <TD>
                    <MemberRowActions
                      userId={member.user.id}
                      name={member.user.name ?? member.user.email}
                      email={member.user.email}
                      role={member.role}
                      isActive={member.user.isActive}
                      isSelf={member.user.id === ctx.userId}
                      canAssignOwner={ctx.role === "OWNER"}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
