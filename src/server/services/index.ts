import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import type { OrganizationContext } from "@/src/server/auth/guards";
import {
  isServiceCode,
  type ServiceCode,
} from "@/src/server/services/codes";

export type { ServiceCode } from "@/src/server/services/codes";
export { SERVICE_CODES, isServiceCode } from "@/src/server/services/codes";

/**
 * Catálogo de servicios y paquetes. Las cotizaciones guardan SNAPSHOTS
 * de descripción/precio: cambiar el catálogo no altera cotizaciones
 * históricas. Archivar = isActive=false (sin hard delete).
 */

export interface ServiceData {
  name: string;
  description?: string | null;
  defaultPrice: Prisma.Decimal | number | string;
  currency?: string;
  /** Vertical estable (opcional). Null/omitido = ítem comercial sin vertical. */
  code?: ServiceCode | null;
}

function normalizeOptionalCode(code: ServiceCode | null | undefined): string | null {
  if (code === undefined || code === null) return null;
  if (!isServiceCode(code)) {
    throw new DomainError(`Código de servicio inválido: ${code}`);
  }
  return code;
}

function mapServiceWriteError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    const target = error.meta?.target;
    const fields = Array.isArray(target) ? target.join(",") : String(target ?? "");
    if (fields.includes("code")) {
      throw new DomainError("Ya existe un servicio con ese código en la organización.");
    }
    if (fields.includes("name")) {
      throw new DomainError("Ya existe un servicio con ese nombre en la organización.");
    }
    throw new DomainError("Conflicto de unicidad al guardar el servicio.");
  }
  throw error;
}

export interface PackageItemInput {
  serviceId: string;
  quantity: number;
}

export interface PackageData {
  name: string;
  description?: string | null;
  defaultPrice: Prisma.Decimal | number | string;
  currency?: string;
  items: PackageItemInput[];
}

async function assertActiveServices(ctx: OrganizationContext, items: PackageItemInput[]) {
  if (items.length === 0) {
    throw new DomainError("El paquete debe incluir al menos un servicio.");
  }
  const ids = [...new Set(items.map((item) => item.serviceId))];
  const services = await prisma.service.findMany({
    where: { id: { in: ids }, organizationId: ctx.organizationId, isActive: true },
    select: { id: true },
  });
  if (services.length !== ids.length) {
    throw new DomainError("Uno o más servicios del paquete no existen o están archivados.");
  }
}

export async function createService(ctx: OrganizationContext, data: ServiceData) {
  const code = normalizeOptionalCode(data.code);
  try {
    return await prisma.service.create({
      data: {
        organizationId: ctx.organizationId,
        code,
        name: data.name,
        description: data.description ?? null,
        defaultPrice: new Prisma.Decimal(data.defaultPrice),
        currency: data.currency ?? "USD",
      },
    });
  } catch (error) {
    mapServiceWriteError(error);
  }
}

export async function updateService(
  ctx: OrganizationContext,
  serviceId: string,
  data: Partial<ServiceData>,
) {
  const existing = await prisma.service.findFirst({
    where: { id: serviceId, organizationId: ctx.organizationId },
  });
  if (!existing) throw new DomainError("Servicio no encontrado.");

  let codeUpdate: { code?: string | null } = {};
  if (data.code !== undefined) {
    codeUpdate = { code: normalizeOptionalCode(data.code) };
  }

  try {
    return await prisma.service.update({
      where: { id: existing.id },
      data: {
        ...codeUpdate,
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.defaultPrice !== undefined
          ? { defaultPrice: new Prisma.Decimal(data.defaultPrice) }
          : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
      },
    });
  } catch (error) {
    mapServiceWriteError(error);
  }
}

/** Resuelve el Service de vertical por code dentro de la org. */
export async function getServiceByCode(
  organizationId: string,
  code: ServiceCode,
  tx?: Prisma.TransactionClient,
) {
  if (!isServiceCode(code)) {
    throw new DomainError(`Código de servicio inválido: ${code}`);
  }
  const db = tx ?? prisma;
  return db.service.findFirst({
    where: { organizationId, code },
  });
}

/** Garantiza Service CREDIT_REPAIR en la org (idempotente). */
export async function ensureCreditRepairService(
  organizationId: string,
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? prisma;
  const existing = await getServiceByCode(organizationId, "CREDIT_REPAIR", db);
  if (existing) return existing;

  const nameTaken = await db.service.findFirst({
    where: { organizationId, name: "Credit Repair" },
    select: { id: true },
  });
  return db.service.create({
    data: {
      organizationId,
      code: "CREDIT_REPAIR",
      name: nameTaken
        ? `Credit Repair [${organizationId.slice(0, 8)}]`
        : "Credit Repair",
      defaultPrice: 0,
      currency: "USD",
      isActive: true,
    },
  });
}

export async function archiveService(ctx: OrganizationContext, serviceId: string) {
  const existing = await prisma.service.findFirst({
    where: { id: serviceId, organizationId: ctx.organizationId },
  });
  if (!existing) throw new DomainError("Servicio no encontrado.");
  return prisma.service.update({
    where: { id: existing.id },
    data: { isActive: false },
  });
}

export async function createPackage(ctx: OrganizationContext, data: PackageData) {
  await assertActiveServices(ctx, data.items);
  return prisma.$transaction(async (tx) => {
    const pkg = await tx.servicePackage.create({
      data: {
        organizationId: ctx.organizationId,
        name: data.name,
        description: data.description ?? null,
        defaultPrice: new Prisma.Decimal(data.defaultPrice),
        currency: data.currency ?? "USD",
        items: {
          create: data.items.map((item) => ({
            serviceId: item.serviceId,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: { include: { service: { select: { id: true, name: true } } } },
      },
    });
    return pkg;
  });
}

export async function updatePackage(
  ctx: OrganizationContext,
  packageId: string,
  data: Partial<PackageData>,
) {
  const existing = await prisma.servicePackage.findFirst({
    where: { id: packageId, organizationId: ctx.organizationId },
  });
  if (!existing) throw new DomainError("Paquete no encontrado.");
  if (data.items) await assertActiveServices(ctx, data.items);

  return prisma.$transaction(async (tx) => {
    if (data.items) {
      // Reemplazo completo de los ítems del paquete.
      await tx.servicePackageItem.deleteMany({ where: { packageId: existing.id } });
      await tx.servicePackageItem.createMany({
        data: data.items.map((item) => ({
          packageId: existing.id,
          serviceId: item.serviceId,
          quantity: item.quantity,
        })),
      });
    }
    return tx.servicePackage.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.defaultPrice !== undefined
          ? { defaultPrice: new Prisma.Decimal(data.defaultPrice) }
          : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
      },
      include: {
        items: { include: { service: { select: { id: true, name: true } } } },
      },
    });
  });
}

export async function archivePackage(ctx: OrganizationContext, packageId: string) {
  const existing = await prisma.servicePackage.findFirst({
    where: { id: packageId, organizationId: ctx.organizationId },
  });
  if (!existing) throw new DomainError("Paquete no encontrado.");
  return prisma.servicePackage.update({
    where: { id: existing.id },
    data: { isActive: false },
  });
}

export async function listServices(ctx: OrganizationContext, includeArchived = false) {
  return prisma.service.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(includeArchived ? {} : { isActive: true }),
    },
    orderBy: { name: "asc" },
  });
}

export async function listPackages(ctx: OrganizationContext, includeArchived = false) {
  return prisma.servicePackage.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(includeArchived ? {} : { isActive: true }),
    },
    include: {
      items: { include: { service: { select: { id: true, name: true, defaultPrice: true } } } },
    },
    orderBy: { name: "asc" },
  });
}
