import crypto from "node:crypto";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { isIntakeEnabled } from "@/src/server/intake";
import { writeAuditLog } from "@/src/server/audit";
import { toAuditContext } from "@/src/server/context";

function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const looksLocal =
    !configured || /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(configured);

  // En Vercel no usar localhost aunque NEXT_PUBLIC_APP_URL venga mal.
  if (looksLocal) {
    const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    if (productionHost) {
      return `https://${productionHost.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
    }
    const deploymentHost = process.env.VERCEL_URL?.trim();
    if (deploymentHost) {
      return `https://${deploymentHost.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
    }
  }

  return (configured || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Crea un IntakeLink para compartir con el cliente.
 * Solo si FEATURE_PUBLIC_INTAKE=true.
 */
export async function createClientIntakeLink(
  ctx: OrganizationContext,
  input: {
    clientId: string;
    caseId?: string | null;
    maxUses?: number;
    expiresInDays?: number;
  },
) {
  if (!isIntakeEnabled()) {
    throw new DomainError(
      "El intake público está desactivado. Activa FEATURE_PUBLIC_INTAKE=true.",
    );
  }

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  let caseId: string | null = input.caseId ?? null;
  if (caseId) {
    const creditCase = await prisma.creditCase.findFirst({
      where: {
        id: caseId,
        organizationId: ctx.organizationId,
        clientId: client.id,
      },
      select: { id: true },
    });
    if (!creditCase) throw new DomainError("Caso no encontrado para este cliente.");
  }

  const maxUses = Math.min(Math.max(input.maxUses ?? 1, 1), 10);
  const expiresInDays = Math.min(Math.max(input.expiresInDays ?? 7, 1), 90);
  const token = `jh-${crypto.randomBytes(24).toString("base64url")}`;

  const link = await prisma.intakeLink.create({
    data: {
      organizationId: ctx.organizationId,
      token,
      clientId: client.id,
      caseId,
      createdById: ctx.userId,
      maxUses,
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    },
  });

  await writeAuditLog(toAuditContext(ctx), {
    action: "INTAKE_LINK_CREATED",
    entityType: "IntakeLink",
    entityId: link.id,
    metadata: { clientId: client.id, caseId, maxUses, expiresInDays },
  });

  return {
    id: link.id,
    token: link.token,
    url: `${appBaseUrl()}/intake/${link.token}`,
    maxUses: link.maxUses,
    expiresAt: link.expiresAt,
  };
}

export async function listClientIntakeLinks(
  ctx: OrganizationContext,
  clientId: string,
) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  const now = new Date();
  const rows = await prisma.intakeLink.findMany({
    where: { organizationId: ctx.organizationId, clientId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      token: true,
      caseId: true,
      maxUses: true,
      useCount: true,
      expiresAt: true,
      isActive: true,
      createdAt: true,
      case: { select: { caseCode: true } },
    },
  });

  return rows.map((row) => {
    const expired = Boolean(row.expiresAt && row.expiresAt < now);
    const exhausted = row.useCount >= row.maxUses;
    const usable = row.isActive && !expired && !exhausted;
    return {
      id: row.id,
      url: `${appBaseUrl()}/intake/${row.token}`,
      caseCode: row.case?.caseCode ?? null,
      maxUses: row.maxUses,
      useCount: row.useCount,
      expiresAt: row.expiresAt,
      isActive: row.isActive,
      usable,
      createdAt: row.createdAt,
    };
  });
}

export async function revokeClientIntakeLink(
  ctx: OrganizationContext,
  linkId: string,
) {
  const link = await prisma.intakeLink.findFirst({
    where: { id: linkId, organizationId: ctx.organizationId },
  });
  if (!link) throw new DomainError("Enlace no encontrado.");
  if (!link.isActive) throw new DomainError("El enlace ya está desactivado.");

  const updated = await prisma.intakeLink.update({
    where: { id: link.id },
    data: { isActive: false },
  });

  await writeAuditLog(toAuditContext(ctx), {
    action: "INTAKE_LINK_REVOKED",
    entityType: "IntakeLink",
    entityId: link.id,
    metadata: { clientId: link.clientId },
  });

  return updated;
}
