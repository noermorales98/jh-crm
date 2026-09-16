import { createHash } from "node:crypto";
import { Prisma, type Testimonial } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import {
  TESTIMONIAL_CONSENT_TEXT,
  TESTIMONIAL_CONSENT_VERSION,
} from "@/src/lib/testimonials";
import { DomainError } from "@/src/server/errors";
import {
  ForbiddenError,
  type OrganizationContext,
} from "@/src/server/auth/guards";
import { can, type PermissionAction } from "@/src/server/auth/permissions";
import type { PortalContext } from "@/src/server/portal";
import { writeActivityLog } from "@/src/server/activity";
import { writeAuditLog } from "@/src/server/audit";

type Context = OrganizationContext | PortalContext;
export type TestimonialInput = {
  clientId: string;
  serviceCaseId?: string | null;
  displayName: string;
  body: string;
  rating?: number | null;
};
export type TestimonialCommand =
  | { kind: "edit"; data: TestimonialInput }
  | {
      kind: "consent";
      granted: boolean;
      signerName?: string;
      evidence?: string;
    }
  | { kind: "review"; status: "APPROVED" | "REJECTED" }
  | { kind: "publish"; published: boolean }
  | { kind: "delete" };

function isPortal(ctx: Context): ctx is PortalContext {
  return "accessId" in ctx;
}
function authorize(ctx: Context, permission: PermissionAction) {
  if (!isPortal(ctx) && !can(ctx.role, permission)) throw new ForbiddenError();
}
function contentHash(
  data: Pick<TestimonialInput, "displayName" | "body" | "rating">,
) {
  return createHash("sha256")
    .update(JSON.stringify([data.displayName, data.body, data.rating ?? null]))
    .digest("hex");
}
export function hasTestimonialConsent(row: Testimonial) {
  return Boolean(
    row.consentGrantedAt &&
    !row.consentRevokedAt &&
    row.consentContentHash === contentHash(row) &&
    row.consentVersion === TESTIMONIAL_CONSENT_VERSION,
  );
}
function normalize(data: TestimonialInput): TestimonialInput {
  const displayName = data.displayName.trim();
  const body = data.body.trim();
  if (!displayName || displayName.length > 120 || !body || body.length > 5000)
    throw new DomainError("Nombre público o testimonio inválido.");
  if (
    data.rating != null &&
    (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5)
  )
    throw new DomainError("La calificación debe ser de 1 a 5.");
  return {
    ...data,
    displayName,
    body,
    rating: data.rating ?? null,
    serviceCaseId: data.serviceCaseId || null,
  };
}
async function validateLinks(
  tx: Prisma.TransactionClient,
  ctx: Context,
  data: TestimonialInput,
) {
  if (isPortal(ctx) && data.clientId !== ctx.clientId)
    throw new ForbiddenError();
  const client = await tx.client.findFirst({
    where: {
      id: data.clientId,
      organizationId: ctx.organizationId,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");
  if (
    data.serviceCaseId &&
    !(await tx.serviceCase.findFirst({
      where: {
        id: data.serviceCaseId,
        clientId: client.id,
        organizationId: ctx.organizationId,
        archivedAt: null,
      },
      select: { id: true },
    }))
  )
    throw new DomainError("El expediente no pertenece al cliente.");
}
async function log(
  tx: Prisma.TransactionClient,
  ctx: Context,
  row: Testimonial,
  action: string,
) {
  const actorUserId = isPortal(ctx) ? null : ctx.userId;
  await writeActivityLog(
    { organizationId: ctx.organizationId, actorUserId },
    {
      type: "OTHER",
      description: `Testimonio: ${action}.`,
      clientId: row.clientId,
      serviceCaseId: row.serviceCaseId,
      metadata: {
        testimonialId: row.id,
        source: isPortal(ctx) ? "portal" : "crm",
      },
    },
    tx,
  );
  await writeAuditLog(
    { organizationId: ctx.organizationId, actorUserId },
    {
      action: `testimonial.${action}`,
      entityType: "Testimonial",
      entityId: row.id,
    },
    tx,
  );
}
function consentData(
  row: Pick<TestimonialInput, "displayName" | "body" | "rating">,
  ctx: Context,
  signerName?: string,
  evidence?: string,
): Prisma.TestimonialUpdateInput {
  if (!signerName?.trim() || signerName.trim().length > 120)
    throw new DomainError("Indica el nombre de quien autoriza.");
  if (!isPortal(ctx) && (!evidence?.trim() || evidence.trim().length > 2000))
    throw new DomainError(
      "Registra la evidencia del consentimiento (fecha, canal y referencia).",
    );
  return {
    consentGrantedAt: new Date(),
    consentRevokedAt: null,
    consentSignerName: signerName.trim(),
    consentEvidence: isPortal(ctx)
      ? `Aceptado desde el portal: ${ctx.accessId}`
      : evidence!.trim(),
    consentVersion: TESTIMONIAL_CONSENT_VERSION,
    consentText: TESTIMONIAL_CONSENT_TEXT,
    consentContentHash: contentHash(row),
    consentRecordedById: isPortal(ctx) ? null : ctx.userId,
  };
}
export async function createTestimonial(
  ctx: Context,
  input: TestimonialInput,
  portalConsent?: { accepted: boolean; signerName: string },
) {
  authorize(ctx, "testimonials.manage");
  const data = normalize(input);
  if (isPortal(ctx) && !portalConsent?.accepted)
    throw new DomainError("Debes aceptar la autorización de publicación.");
  return prisma.$transaction(async (tx) => {
    await validateLinks(tx, ctx, data);
    let row = await tx.testimonial.create({
      data: { ...data, organizationId: ctx.organizationId },
    });
    if (isPortal(ctx))
      row = await tx.testimonial.update({
        where: { id: row.id },
        data: consentData(row, ctx, portalConsent!.signerName),
      });
    await log(tx, ctx, row, "creado");
    if (isPortal(ctx)) await log(tx, ctx, row, "consentimiento otorgado");
    return row;
  });
}

/** Bloqueo y versión evitan publicar texto editado o un consentimiento retirado en paralelo. */
export async function changeTestimonial(
  ctx: Context,
  id: string,
  expectedUpdatedAt: Date,
  command: TestimonialCommand,
) {
  const editorial = command.kind === "review" || command.kind === "publish";
  if (isPortal(ctx) && (editorial || command.kind === "delete"))
    throw new ForbiddenError();
  authorize(ctx, editorial ? "testimonials.publish" : "testimonials.manage");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Testimonial WHERE id = ${id} AND organizationId = ${ctx.organizationId} FOR UPDATE`;
    const row = await tx.testimonial.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
        deletedAt: null,
        ...(isPortal(ctx) ? { clientId: ctx.clientId } : {}),
      },
    });
    if (!row) throw new DomainError("Testimonio no encontrado.");
    if (row.updatedAt.getTime() !== expectedUpdatedAt.getTime())
      throw new DomainError(
        "El testimonio cambió. Actualiza la página y revisa de nuevo.",
      );
    // Garantiza una versión distinta incluso si dos escrituras ocurren en el mismo milisegundo.
    const data: Prisma.TestimonialUpdateInput = {
      updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)),
    };
    let action: string;
    switch (command.kind) {
      case "edit": {
        const input = normalize(command.data);
        if (input.clientId !== row.clientId)
          throw new DomainError(
            "No se puede cambiar el cliente del testimonio.",
          );
        await validateLinks(tx, ctx, input);
        Object.assign(data, input, {
          status: "PENDING",
          reviewedAt: null,
          reviewedById: null,
          publishedAt: null,
          consentRevokedAt: row.consentGrantedAt ? new Date() : null,
        });
        action = "editado";
        break;
      }
      case "consent":
        Object.assign(
          data,
          {
            publishedAt: null,
            status: "PENDING",
            reviewedAt: null,
            reviewedById: null,
          },
          command.granted
            ? consentData(row, ctx, command.signerName, command.evidence)
            : { consentRevokedAt: new Date() },
        );
        action = command.granted
          ? "consentimiento otorgado"
          : "consentimiento retirado";
        break;
      case "review":
        if (command.status === "APPROVED" && !hasTestimonialConsent(row))
          throw new DomainError(
            "Se requiere consentimiento vigente para aprobar.",
          );
        Object.assign(data, {
          status: command.status,
          reviewedAt: new Date(),
          reviewedById: (ctx as OrganizationContext).userId,
          publishedAt: null,
        });
        action = command.status === "APPROVED" ? "aprobado" : "rechazado";
        break;
      case "publish":
        if (
          command.published &&
          (row.status !== "APPROVED" ||
            !row.reviewedAt ||
            !row.reviewedById ||
            !hasTestimonialConsent(row))
        )
          throw new DomainError(
            "Se requiere aprobación humana y consentimiento vigente para publicar.",
          );
        data.publishedAt = command.published
          ? (row.publishedAt ?? new Date())
          : null;
        action = command.published ? "publicado" : "retirado de publicación";
        break;
      case "delete":
        data.deletedAt = new Date();
        data.publishedAt = null;
        action = "eliminado";
        break;
    }
    const updated = await tx.testimonial.update({ where: { id }, data });
    await log(tx, ctx, updated, action);
    return updated;
  });
}

export async function listTestimonials(ctx: Context, clientId?: string) {
  authorize(ctx, "testimonials.view");
  const scopedClientId = isPortal(ctx) ? ctx.clientId : clientId;
  return prisma.testimonial.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      ...(scopedClientId ? { clientId: scopedClientId } : {}),
    },
    include: {
      client: { select: { firstName: true, lastName: true } },
      serviceCase: { select: { caseNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Solo organización del sitio (mismo criterio que contacto). Sin IDs ni datos internos. */
export async function listPublicTestimonials() {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!org) return [];
  const rows = await prisma.testimonial.findMany({
    where: {
      organizationId: org.id,
      status: "APPROVED",
      reviewedAt: { not: null },
      reviewedById: { not: null },
      publishedAt: { not: null },
      consentGrantedAt: { not: null },
      consentRevokedAt: null,
      consentVersion: TESTIMONIAL_CONSENT_VERSION,
      deletedAt: null,
      client: { archivedAt: null },
      OR: [{ serviceCaseId: null }, { serviceCase: { archivedAt: null } }],
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  return rows
    .filter(hasTestimonialConsent)
    .map((row) => ({
      displayName: row.displayName,
      body: row.body,
      rating: row.rating,
      publishedAt: row.publishedAt!.toISOString(),
    }));
}
