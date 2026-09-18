import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { writeAuditLog } from "@/src/server/audit";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toAuditContext } from "@/src/server/context";
import { soleId, resolveAssigneeId } from "@/src/lib/assignee";

/**
 * Gestión de miembros de la organización. Sin email transaccional en
 * esta fase: inviteUser genera una contraseña temporal y la devuelve
 * para entrega manual.
 */

export interface InviteUserData {
  name: string;
  email: string;
  role: Role;
}

function generateTemporaryPassword(): string {
  // Legible a mano pero con suficiente entropía (~48 bits).
  return crypto.randomBytes(6).toString("base64url") + "-" + crypto.randomBytes(4).toString("base64url");
}

async function countActiveOwners(ctx: OrganizationContext): Promise<number> {
  return prisma.organizationMember.count({
    where: {
      organizationId: ctx.organizationId,
      role: "OWNER",
      user: { isActive: true },
    },
  });
}

async function getMemberOrThrow(ctx: OrganizationContext, userId: string) {
  const member = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: ctx.organizationId },
    },
    include: { user: { select: { id: true, email: true, name: true, isActive: true } } },
  });
  if (!member) {
    throw new DomainError("El usuario no es miembro de la organización.");
  }
  return member;
}

/** Crea User + OrganizationMember. Devuelve la contraseña temporal. */
export async function inviteUser(ctx: OrganizationContext, data: InviteUserData) {
  if (data.role === "OWNER" && ctx.role !== "OWNER") {
    throw new DomainError("Solo el propietario puede invitar a otro propietario.");
  }
  const email = data.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: { userId: existing.id, organizationId: ctx.organizationId },
      },
    });
    if (membership) {
      throw new DomainError("Ese correo ya pertenece a un miembro de la organización.");
    }
    throw new DomainError("Ese correo ya está registrado en el sistema.");
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name: data.name.trim(), passwordHash },
    });
    const member = await tx.organizationMember.create({
      data: { userId: user.id, organizationId: ctx.organizationId, role: data.role },
    });
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "MEMBER_INVITED",
        entityType: "OrganizationMember",
        entityId: member.id,
        metadata: { role: data.role, invitedUserId: user.id },
      },
      tx,
    );
    return { user, member };
  });

  return {
    userId: result.user.id,
    email: result.user.email,
    name: result.user.name,
    role: result.member.role,
    temporaryPassword,
  };
}

export async function updateMemberRole(
  ctx: OrganizationContext,
  userId: string,
  role: Role,
) {
  const member = await getMemberOrThrow(ctx, userId);

  if (member.role === "OWNER" && role !== "OWNER") {
    if ((await countActiveOwners(ctx)) <= 1) {
      throw new DomainError("No puedes degradar al único propietario activo.");
    }
  }
  if (role === "OWNER" && ctx.role !== "OWNER") {
    throw new DomainError("Solo el propietario puede nombrar a otro propietario.");
  }
  if (member.role === role) {
    throw new DomainError("El miembro ya tiene ese rol.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.organizationMember.update({
      where: { id: member.id },
      data: { role },
    });
    // El rol vive en el JWT: invalidar sesiones para que tome efecto.
    await tx.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "MEMBER_ROLE_CHANGED",
        entityType: "OrganizationMember",
        entityId: member.id,
        metadata: { targetUserId: userId, from: member.role, to: role },
      },
      tx,
    );
    return updated;
  });
}

export async function deactivateUser(ctx: OrganizationContext, userId: string) {
  if (userId === ctx.userId) {
    throw new DomainError("No puedes desactivar tu propio usuario.");
  }
  const member = await getMemberOrThrow(ctx, userId);
  if (member.role === "OWNER" && (await countActiveOwners(ctx)) <= 1) {
    throw new DomainError("No puedes desactivar al único propietario activo.");
  }
  if (!member.user.isActive) {
    throw new DomainError("El usuario ya está desactivado.");
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { isActive: false, sessionVersion: { increment: 1 } },
    });
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "MEMBER_DEACTIVATED",
        entityType: "User",
        entityId: userId,
        metadata: { email: user.email },
      },
      tx,
    );
    return user;
  });
}

export async function listMembers(ctx: OrganizationContext) {
  return prisma.organizationMember.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: {
        select: { id: true, name: true, email: true, isActive: true, lastLoginAt: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Si la org tiene exactamente un miembro activo, su userId; si no, null. */
export async function findSoleActiveUserId(
  organizationId: string,
): Promise<string | null> {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId, user: { isActive: true } },
    select: { userId: true },
    take: 2,
  });
  return soleId(members.map((m) => ({ id: m.userId })));
}

/** Asignado explícito, o el único usuario activo de la org. */
export async function resolveAssigneeForOrg(
  organizationId: string,
  explicit?: string | null,
): Promise<string | null> {
  return resolveAssigneeId(explicit, await findSoleActiveUserId(organizationId));
}

/** El usuario cambia su propio nombre de visualización. */
export async function updateOwnName(
  ctx: OrganizationContext,
  data: { name: string },
) {
  const name = data.name.trim();
  if (!name) throw new DomainError("El nombre es obligatorio.");
  if (name.length > 100) {
    throw new DomainError("El nombre no puede superar 100 caracteres.");
  }

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, name: true },
  });
  if (!user) throw new DomainError("Usuario no encontrado.");

  if (user.name === name) {
    throw new DomainError("Ese ya es tu nombre actual.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { name },
      select: { id: true, name: true },
    });
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "MEMBER_NAME_CHANGED",
        entityType: "User",
        entityId: user.id,
        metadata: { from: user.name, to: name, self: true },
      },
      tx,
    );
    return updated;
  });
}

/** OWNER/ADMIN cambia el nombre de un miembro (incluido admin/owner). */
export async function updateMemberName(
  ctx: OrganizationContext,
  userId: string,
  data: { name: string },
) {
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    throw new DomainError("No tienes permiso para cambiar el nombre de otro usuario.");
  }
  const member = await getMemberOrThrow(ctx, userId);
  if (!member.user.isActive) {
    throw new DomainError("El usuario está desactivado.");
  }

  const name = data.name.trim();
  if (!name) throw new DomainError("El nombre es obligatorio.");
  if (name.length > 100) {
    throw new DomainError("El nombre no puede superar 100 caracteres.");
  }
  if (member.user.name === name) {
    throw new DomainError("Ese ya es el nombre actual del miembro.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { name },
      select: { id: true, name: true },
    });
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "MEMBER_NAME_CHANGED",
        entityType: "User",
        entityId: userId,
        metadata: {
          from: member.user.name,
          to: name,
          self: userId === ctx.userId,
          targetUserId: userId,
        },
      },
      tx,
    );
    return updated;
  });
}

/** El usuario cambia su propio correo de login (requiere contraseña actual). */
export async function updateOwnEmail(
  ctx: OrganizationContext,
  data: { email: string; currentPassword: string },
) {
  const email = data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user) throw new DomainError("Usuario no encontrado.");

  const ok = await bcrypt.compare(data.currentPassword, user.passwordHash);
  if (!ok) throw new DomainError("La contraseña actual no es correcta.");

  if (email === user.email) {
    throw new DomainError("Ese ya es tu correo actual.");
  }

  const taken = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (taken) throw new DomainError("Ese correo ya está registrado.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { email, sessionVersion: { increment: 1 } },
      select: { id: true, email: true },
    });
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "MEMBER_EMAIL_CHANGED",
        entityType: "User",
        entityId: user.id,
        metadata: { from: user.email, to: email, self: true },
      },
      tx,
    );
    return updated;
  });
}

/** OWNER/ADMIN cambia el correo de login de un miembro. */
export async function updateMemberEmail(
  ctx: OrganizationContext,
  userId: string,
  data: { email: string },
) {
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    throw new DomainError("No tienes permiso para cambiar el correo de otro usuario.");
  }
  const member = await getMemberOrThrow(ctx, userId);
  if (!member.user.isActive) {
    throw new DomainError("El usuario está desactivado.");
  }

  const email = data.email.trim().toLowerCase();
  if (email === member.user.email) {
    throw new DomainError("Ese ya es el correo actual del miembro.");
  }

  const taken = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (taken) throw new DomainError("Ese correo ya está registrado.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { email, sessionVersion: { increment: 1 } },
      select: { id: true, email: true },
    });
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "MEMBER_EMAIL_CHANGED",
        entityType: "User",
        entityId: userId,
        metadata: {
          from: member.user.email,
          to: email,
          self: false,
          targetUserId: userId,
        },
      },
      tx,
    );
    return updated;
  });
}
