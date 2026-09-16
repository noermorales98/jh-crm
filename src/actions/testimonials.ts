"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  requirePermission,
  requirePortalSession,
} from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import * as testimonials from "@/src/server/testimonials";

const inputSchema = z.object({
  clientId: cuidSchema,
  serviceCaseId: cuidSchema.nullish(),
  displayName: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(5000),
  rating: z.number().int().min(1).max(5).nullish(),
});
const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("edit"), data: inputSchema }),
  z.object({
    kind: z.literal("consent"),
    granted: z.boolean(),
    signerName: z.string().trim().min(1).max(120).optional(),
    evidence: z.string().trim().min(1).max(2000).optional(),
  }),
  z.object({
    kind: z.literal("review"),
    status: z.enum(["APPROVED", "REJECTED"]),
  }),
  z.object({ kind: z.literal("publish"), published: z.boolean() }),
  z.object({ kind: z.literal("delete") }),
]);
function refresh(clientId: string) {
  revalidatePath("/crm/testimonios");
  revalidatePath(`/crm/clientes/${clientId}/testimonios`);
  revalidatePath(`/crm/clientes/${clientId}/actividad`);
  revalidatePath("/portal/testimonios");
}
export async function createTestimonialAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("testimonials.manage");
    const row = await testimonials.createTestimonial(
      ctx,
      inputSchema.parse(input),
    );
    refresh(row.clientId);
    return actionOk({ id: row.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
export async function changeTestimonialAction(
  id: string,
  updatedAt: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const command = commandSchema.parse(input);
    const ctx = await requirePermission(
      command.kind === "review" || command.kind === "publish"
        ? "testimonials.publish"
        : "testimonials.manage",
    );
    const row = await testimonials.changeTestimonial(
      ctx,
      cuidSchema.parse(id),
      z.coerce.date().parse(updatedAt),
      command,
    );
    refresh(row.clientId);
    return actionOk({ id: row.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
const portalInputSchema = inputSchema
  .omit({ clientId: true })
  .extend({
    accepted: z.literal(true),
    signerName: z.string().trim().min(1).max(120),
  });
export async function submitPortalTestimonialAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePortalSession();
    const { accepted, signerName, ...data } = portalInputSchema.parse(input);
    const row = await testimonials.createTestimonial(
      ctx,
      { ...data, clientId: ctx.clientId },
      { accepted, signerName },
    );
    refresh(row.clientId);
    return actionOk({ id: row.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
export async function changePortalTestimonialAction(
  id: string,
  updatedAt: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePortalSession();
    const command = commandSchema.parse(input);
    // La capa de dominio bloquea revisión/publicación/borrado e impone clientId de sesión.
    const row = await testimonials.changeTestimonial(
      ctx,
      cuidSchema.parse(id),
      z.coerce.date().parse(updatedAt),
      command,
    );
    refresh(row.clientId);
    return actionOk({ id: row.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
