"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganization, requireRole } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { emailSchema } from "@/src/lib/validation/common";
import { cuidSchema } from "@/src/lib/validation/common";
import * as userService from "@/src/server/users";

const roleEnum = z.enum(["OWNER", "ADMIN", "SPECIALIST", "STAFF", "VIEWER"]);

const inviteSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(100),
  email: emailSchema,
  role: roleEnum,
});

/** Crea el usuario y devuelve su contraseña temporal (entrega manual). */
export async function inviteUser(
  input: unknown,
): Promise<
  ActionResult<{ userId: string; email: string; role: string; temporaryPassword: string }>
> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const data = inviteSchema.parse(input);
    const result = await userService.inviteUser(ctx, data);
    revalidatePath("/crm/usuarios");
    return actionOk({
      userId: result.userId,
      email: result.email,
      role: result.role,
      temporaryPassword: result.temporaryPassword,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const updateRoleSchema = z.object({ role: roleEnum });

export async function updateMemberRole(
  userId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const id = cuidSchema.parse(userId);
    const { role } = updateRoleSchema.parse(input);
    const member = await userService.updateMemberRole(ctx, id, role);
    revalidatePath("/crm/usuarios");
    return actionOk({ id: member.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function deactivateUser(userId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const id = cuidSchema.parse(userId);
    const user = await userService.deactivateUser(ctx, id);
    revalidatePath("/crm/usuarios");
    return actionOk({ id: user.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const changeOwnEmailSchema = z.object({
  email: emailSchema,
  currentPassword: z.string().min(1, "La contraseña actual es obligatoria."),
});

/** Cualquier miembro activo cambia su propio correo de login. */
export async function changeOwnEmail(
  input: unknown,
): Promise<ActionResult<{ email: string }>> {
  try {
    const ctx = await requireOrganization();
    const data = changeOwnEmailSchema.parse(input);
    const user = await userService.updateOwnEmail(ctx, data);
    revalidatePath("/crm", "layout");
    revalidatePath("/crm/usuarios");
    return actionOk({ email: user.email });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const changeMemberEmailSchema = z.object({
  email: emailSchema,
});

/** OWNER/ADMIN cambia el correo de login de un miembro. */
export async function changeMemberEmail(
  userId: string,
  input: unknown,
): Promise<ActionResult<{ email: string }>> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const id = cuidSchema.parse(userId);
    const data = changeMemberEmailSchema.parse(input);
    const user = await userService.updateMemberEmail(ctx, id, data);
    revalidatePath("/crm/usuarios");
    return actionOk({ email: user.email });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const changeOwnNameSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(100),
});

/** Cualquier miembro activo cambia su propio nombre. */
export async function changeOwnName(
  input: unknown,
): Promise<ActionResult<{ name: string }>> {
  try {
    const ctx = await requireOrganization();
    const data = changeOwnNameSchema.parse(input);
    const user = await userService.updateOwnName(ctx, data);
    revalidatePath("/crm", "layout");
    revalidatePath("/crm/usuarios");
    return actionOk({ name: user.name ?? data.name });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const changeMemberNameSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(100),
});

/** OWNER/ADMIN cambia el nombre de un miembro. */
export async function changeMemberName(
  userId: string,
  input: unknown,
): Promise<ActionResult<{ name: string }>> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const id = cuidSchema.parse(userId);
    const data = changeMemberNameSchema.parse(input);
    const user = await userService.updateMemberName(ctx, id, data);
    revalidatePath("/crm", "layout");
    revalidatePath("/crm/usuarios");
    return actionOk({ name: user.name ?? data.name });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
