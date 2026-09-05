import { Prisma, type ProcessorAccountStatus } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { writeActivityLog } from "@/src/server/activity";
import { toActivityContext } from "@/src/server/context";

export interface ProcessorData {
  name: string;
  type?: string;
  websiteUrl?: string | null;
  affiliateUrl?: string | null;
  monthlyPrice?: Prisma.Decimal | number | string | null;
  commission?: Prisma.Decimal | number | string | null;
  instructions?: string | null;
  active?: boolean;
}

export interface LinkAccountData {
  processorId: string;
  clientId: string;
  caseId?: string | null;
  externalMemberId?: string | null;
  externalUrl?: string | null;
  status?: ProcessorAccountStatus;
  startedAt?: Date | null;
  expiresAt?: Date | null;
  notes?: string | null;
}

export interface UpdateAccountData {
  externalMemberId?: string | null;
  externalUrl?: string | null;
  status?: ProcessorAccountStatus;
  startedAt?: Date | null;
  expiresAt?: Date | null;
  notes?: string | null;
  caseId?: string | null;
}

function emptyToNull(v?: string | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

function toDecimal(
  v: Prisma.Decimal | number | string | null | undefined,
): Prisma.Decimal | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return new Prisma.Decimal(v);
}

export async function listProcessors(
  ctx: OrganizationContext,
  includeInactive = false,
) {
  return prisma.creditProcessor.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(includeInactive ? {} : { active: true }),
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function createProcessor(ctx: OrganizationContext, data: ProcessorData) {
  return prisma.creditProcessor.create({
    data: {
      organizationId: ctx.organizationId,
      name: data.name.trim(),
      type: data.type?.trim() || "CREDIT_MONITOR",
      websiteUrl: emptyToNull(data.websiteUrl),
      affiliateUrl: emptyToNull(data.affiliateUrl),
      monthlyPrice: toDecimal(data.monthlyPrice) ?? null,
      commission: toDecimal(data.commission) ?? null,
      instructions: emptyToNull(data.instructions),
      active: data.active ?? true,
    },
  });
}

export async function updateProcessor(
  ctx: OrganizationContext,
  processorId: string,
  data: Partial<ProcessorData>,
) {
  const existing = await prisma.creditProcessor.findFirst({
    where: { id: processorId, organizationId: ctx.organizationId },
  });
  if (!existing) throw new DomainError("Procesador no encontrado.");

  return prisma.creditProcessor.update({
    where: { id: existing.id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.type !== undefined ? { type: data.type.trim() || "CREDIT_MONITOR" } : {}),
      ...(data.websiteUrl !== undefined
        ? { websiteUrl: emptyToNull(data.websiteUrl) }
        : {}),
      ...(data.affiliateUrl !== undefined
        ? { affiliateUrl: emptyToNull(data.affiliateUrl) }
        : {}),
      ...(data.monthlyPrice !== undefined
        ? { monthlyPrice: toDecimal(data.monthlyPrice) ?? null }
        : {}),
      ...(data.commission !== undefined
        ? { commission: toDecimal(data.commission) ?? null }
        : {}),
      ...(data.instructions !== undefined
        ? { instructions: emptyToNull(data.instructions) }
        : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  });
}

export async function listAccountsForClient(
  ctx: OrganizationContext,
  clientId: string,
) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  return prisma.clientProcessorAccount.findMany({
    where: { organizationId: ctx.organizationId, clientId },
    include: {
      processor: {
        select: { id: true, name: true, type: true, websiteUrl: true, active: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function linkAccount(ctx: OrganizationContext, data: LinkAccountData) {
  const [processor, client] = await Promise.all([
    prisma.creditProcessor.findFirst({
      where: { id: data.processorId, organizationId: ctx.organizationId },
    }),
    prisma.client.findFirst({
      where: { id: data.clientId, organizationId: ctx.organizationId },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  if (!processor) throw new DomainError("Procesador no encontrado.");
  if (!client) throw new DomainError("Cliente no encontrado.");

  if (data.caseId) {
    const creditCase = await prisma.creditCase.findFirst({
      where: {
        id: data.caseId,
        organizationId: ctx.organizationId,
        clientId: client.id,
      },
      select: { id: true },
    });
    if (!creditCase) throw new DomainError("Caso no encontrado para este cliente.");
  }

  return prisma.$transaction(async (tx) => {
    const account = await tx.clientProcessorAccount.create({
      data: {
        organizationId: ctx.organizationId,
        processorId: processor.id,
        clientId: client.id,
        caseId: data.caseId ?? null,
        externalMemberId: emptyToNull(data.externalMemberId),
        externalUrl: emptyToNull(data.externalUrl),
        status: data.status ?? "PLANNED",
        startedAt: data.startedAt ?? null,
        expiresAt: data.expiresAt ?? null,
        notes: emptyToNull(data.notes),
      },
      include: {
        processor: { select: { id: true, name: true } },
      },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "PROCESSOR_LINKED",
        description: `Procesador "${processor.name}" vinculado al cliente.`,
        clientId: client.id,
        caseId: data.caseId ?? null,
        metadata: {
          processorId: processor.id,
          accountId: account.id,
          status: account.status,
        },
      },
      tx,
    );

    return account;
  });
}

export async function updateAccount(
  ctx: OrganizationContext,
  accountId: string,
  data: UpdateAccountData,
) {
  const existing = await prisma.clientProcessorAccount.findFirst({
    where: { id: accountId, organizationId: ctx.organizationId },
  });
  if (!existing) throw new DomainError("Cuenta de procesador no encontrada.");

  if (data.caseId) {
    const creditCase = await prisma.creditCase.findFirst({
      where: {
        id: data.caseId,
        organizationId: ctx.organizationId,
        clientId: existing.clientId,
      },
      select: { id: true },
    });
    if (!creditCase) throw new DomainError("Caso no encontrado para este cliente.");
  }

  return prisma.clientProcessorAccount.update({
    where: { id: existing.id },
    data: {
      ...(data.externalMemberId !== undefined
        ? { externalMemberId: emptyToNull(data.externalMemberId) }
        : {}),
      ...(data.externalUrl !== undefined
        ? { externalUrl: emptyToNull(data.externalUrl) }
        : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.startedAt !== undefined ? { startedAt: data.startedAt } : {}),
      ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
      ...(data.notes !== undefined ? { notes: emptyToNull(data.notes) } : {}),
      ...(data.caseId !== undefined ? { caseId: data.caseId } : {}),
    },
    include: {
      processor: { select: { id: true, name: true } },
    },
  });
}
