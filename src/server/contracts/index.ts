import type { ContractStatus, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import { writeAuditLog } from "@/src/server/audit";
import type { OrganizationContext } from "@/src/server/auth/guards";
import type { PortalContext } from "@/src/server/portal";
import { toActivityContext, toAuditContext } from "@/src/server/context";
import { clientFullName } from "@/src/server/page-helpers";

/**
 * Contratos de servicio: plantillas + emisión + firma (CRM o portal).
 */

function emptyToNull(v?: string | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

function addDays(from: Date, days: number) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

export async function listTemplates(
  ctx: OrganizationContext,
  includeInactive = false,
) {
  return prisma.contractTemplate.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(includeInactive ? {} : { active: true }),
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function upsertTemplate(
  ctx: OrganizationContext,
  data: {
    id?: string;
    name: string;
    version?: string;
    contentHtml: string;
    active?: boolean;
  },
) {
  const name = data.name.trim();
  const contentHtml = data.contentHtml.trim();
  if (!name) throw new DomainError("El nombre de la plantilla es obligatorio.");
  if (!contentHtml) throw new DomainError("El contenido HTML es obligatorio.");

  if (data.id) {
    const existing = await prisma.contractTemplate.findFirst({
      where: { id: data.id, organizationId: ctx.organizationId },
    });
    if (!existing) throw new DomainError("Plantilla no encontrada.");
    return prisma.contractTemplate.update({
      where: { id: existing.id },
      data: {
        name,
        contentHtml,
        ...(data.version !== undefined
          ? { version: data.version.trim() || existing.version }
          : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });
  }

  return prisma.contractTemplate.create({
    data: {
      organizationId: ctx.organizationId,
      name,
      version: data.version?.trim() || "1.0",
      contentHtml,
      active: data.active ?? true,
    },
  });
}

export async function createContractFromTemplate(
  ctx: OrganizationContext,
  data: {
    clientId: string;
    caseId?: string | null;
    templateId: string;
    cancellationDeadlineDays?: number | null;
  },
) {
  const client = await prisma.client.findFirst({
    where: { id: data.clientId, organizationId: ctx.organizationId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  const template = await prisma.contractTemplate.findFirst({
    where: {
      id: data.templateId,
      organizationId: ctx.organizationId,
      active: true,
    },
  });
  if (!template) throw new DomainError("Plantilla no encontrada o inactiva.");

  if (data.caseId) {
    const creditCase = await prisma.creditCase.findFirst({
      where: {
        id: data.caseId,
        clientId: client.id,
        organizationId: ctx.organizationId,
      },
      select: { id: true },
    });
    if (!creditCase) {
      throw new DomainError("El caso enlazado no existe o no pertenece al cliente.");
    }
  }

  const days = data.cancellationDeadlineDays;
  const cancellationDeadline =
    days != null && Number.isFinite(days) && days > 0
      ? addDays(new Date(), Math.floor(days))
      : null;

  const contentSnapshot = template.contentHtml
    .replaceAll("{{clientName}}", clientFullName(client))
    .replaceAll("{{clientFullName}}", clientFullName(client));

  return prisma.$transaction(async (tx) => {
    const contract = await tx.clientContract.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: client.id,
        caseId: data.caseId ?? null,
        templateId: template.id,
        title: template.name,
        version: template.version,
        contentSnapshot,
        status: "DRAFT",
        cancellationDeadline,
        createdById: ctx.userId,
      },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "CONTRACT_CREATED",
        description: `Contrato creado: ${contract.title} (v${contract.version}).`,
        clientId: client.id,
        caseId: data.caseId ?? null,
        metadata: { contractId: contract.id, templateId: template.id },
      },
      tx,
    );
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "CONTRACT_CREATED",
        entityType: "ClientContract",
        entityId: contract.id,
        metadata: { clientId: client.id, status: contract.status },
      },
      tx,
    );

    return contract;
  });
}

export interface ContractListFilters {
  clientId?: string;
  status?: ContractStatus;
  cursor?: string;
  limit?: number;
}

export async function listContracts(
  ctx: OrganizationContext,
  filters: ContractListFilters = {},
) {
  const limit = Math.min(filters.limit ?? 50, 100);
  const where: Prisma.ClientContractWhereInput = {
    organizationId: ctx.organizationId,
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };

  const rows = await prisma.clientContract.findMany({
    where,
    select: {
      id: true,
      title: true,
      version: true,
      status: true,
      signedAt: true,
      createdAt: true,
      cancellationDeadline: true,
      client: {
        select: {
          id: true,
          clientCode: true,
          firstName: true,
          lastName: true,
        },
      },
      case: { select: { id: true, caseCode: true } },
      template: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function getContract(ctx: OrganizationContext, contractId: string) {
  const contract = await prisma.clientContract.findFirst({
    where: { id: contractId, organizationId: ctx.organizationId },
    include: {
      client: {
        select: {
          id: true,
          clientCode: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      case: { select: { id: true, caseCode: true } },
      template: { select: { id: true, name: true, version: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!contract) throw new DomainError("Contrato no encontrado.");
  return contract;
}

export async function markSent(ctx: OrganizationContext, contractId: string) {
  const contract = await prisma.clientContract.findFirst({
    where: { id: contractId, organizationId: ctx.organizationId },
  });
  if (!contract) throw new DomainError("Contrato no encontrado.");
  if (contract.status !== "DRAFT") {
    throw new DomainError("Solo se pueden enviar contratos en borrador.");
  }

  return prisma.clientContract.update({
    where: { id: contract.id },
    data: { status: "SENT" },
  });
}

export async function cancelContract(
  ctx: OrganizationContext,
  contractId: string,
) {
  const contract = await prisma.clientContract.findFirst({
    where: { id: contractId, organizationId: ctx.organizationId },
  });
  if (!contract) throw new DomainError("Contrato no encontrado.");
  if (contract.status === "SIGNED") {
    throw new DomainError("No se puede cancelar un contrato ya firmado.");
  }
  if (contract.status === "CANCELLED") {
    throw new DomainError("El contrato ya está cancelado.");
  }

  return prisma.clientContract.update({
    where: { id: contract.id },
    data: { status: "CANCELLED" },
  });
}

export interface SignContractData {
  contractId: string;
  signerName: string;
  signatureData: string;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Firma un contrato SENT → SIGNED.
 * Acepta contexto CRM (staff) o portal (cliente).
 */
export async function signContract(
  ctx: OrganizationContext | PortalContext,
  data: SignContractData,
) {
  const signerName = data.signerName.trim();
  const signatureData = data.signatureData.trim();
  if (!signerName) throw new DomainError("El nombre del firmante es obligatorio.");
  if (!signatureData.startsWith("data:image/")) {
    throw new DomainError("La firma debe ser una imagen en formato data URL.");
  }

  const organizationId = ctx.organizationId;
  const isPortal = "accessId" in ctx && "clientId" in ctx;

  const contract = await prisma.clientContract.findFirst({
    where: {
      id: data.contractId,
      organizationId,
      ...(isPortal ? { clientId: (ctx as PortalContext).clientId } : {}),
    },
  });
  if (!contract) throw new DomainError("Contrato no encontrado.");
  if (contract.status !== "SENT") {
    throw new DomainError("Solo se pueden firmar contratos en estado Enviado.");
  }

  const actorUserId = isPortal ? null : (ctx as OrganizationContext).userId;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.clientContract.update({
      where: { id: contract.id },
      data: {
        status: "SIGNED",
        signerName,
        signatureData,
        signedAt: new Date(),
        signerIp: emptyToNull(data.ip),
        userAgent: emptyToNull(data.userAgent),
      },
    });

    await writeActivityLog(
      { organizationId, actorUserId },
      {
        type: "CONTRACT_SIGNED",
        description: `Contrato firmado: ${contract.title} por ${signerName}.`,
        clientId: contract.clientId,
        caseId: contract.caseId,
        metadata: {
          contractId: contract.id,
          source: isPortal ? "portal" : "crm",
          ...(isPortal
            ? { portalAccessId: (ctx as PortalContext).accessId }
            : {}),
        },
      },
      tx,
    );
    await writeAuditLog(
      {
        organizationId,
        actorUserId,
        ipAddress: data.ip ?? null,
        userAgent: data.userAgent ?? null,
      },
      {
        action: "CONTRACT_SIGNED",
        entityType: "ClientContract",
        entityId: contract.id,
        metadata: { clientId: contract.clientId },
      },
      tx,
    );

    // PDF del contrato firmado: stub — se puede generar on-demand más adelante.
    return updated;
  });
}
