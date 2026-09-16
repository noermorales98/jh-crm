import { FundingApplicationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { ForbiddenError, type OrganizationContext } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { writeActivityLog } from "@/src/server/activity";
import { writeAuditLog } from "@/src/server/audit";
import { toActivityContext, toAuditContext } from "@/src/server/context";

export interface FundingApplicationInput {
  lenderName: string;
  requestedAmount?: string | null;
  approvedAmount?: string | null;
  status: FundingApplicationStatus;
  submittedAt?: Date | null;
  decisionAt?: Date | null;
  notes?: string | null;
}
function normalize(input: FundingApplicationInput) {
  const lenderName = input.lenderName.trim();
  if (!lenderName || lenderName.length > 191) throw new DomainError("Indica el prestamista (máximo 191 caracteres).");
  if (!Object.values(FundingApplicationStatus).includes(input.status)) throw new DomainError("Estado de aplicación inválido.");
  const money = (value?: string | null) => {
    if (value == null || value === "") return null;
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(value.trim())) throw new DomainError("Monto inválido: debe ser no negativo, con máximo 2 decimales.");
    return new Prisma.Decimal(value.trim());
  };
  for (const value of [input.submittedAt, input.decisionAt]) if (value && (!(value instanceof Date) || !Number.isFinite(value.getTime()))) throw new DomainError("Fecha inválida.");
  if (input.submittedAt && input.decisionAt && input.decisionAt < input.submittedAt) throw new DomainError("La decisión no puede ser anterior al envío.");
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 5000) throw new DomainError("Las notas admiten máximo 5000 caracteres.");
  return { lenderName, requestedAmount: money(input.requestedAmount), approvedAmount: money(input.approvedAmount), status: input.status, submittedAt: input.submittedAt ?? null, decisionAt: input.decisionAt ?? null, notes };
}
async function getFundingCase(tx: Prisma.TransactionClient, ctx: OrganizationContext, serviceCaseId: string) {
  if (!can(ctx.role, "cases.manage")) throw new ForbiddenError();
  await tx.$queryRaw`SELECT id FROM ServiceCase WHERE id = ${serviceCaseId} AND organizationId = ${ctx.organizationId} FOR UPDATE`;
  const serviceCase = await tx.serviceCase.findFirst({ where: { id: serviceCaseId, organizationId: ctx.organizationId }, include: { fundingCase: true, service: { select: { code: true } } } });
  if (!serviceCase || !serviceCase.fundingCase || serviceCase.service.code !== "BUSINESS_CREDIT" || serviceCase.fundingCase.organizationId !== ctx.organizationId) throw new DomainError("Expediente de financiamiento no encontrado.");
  if (serviceCase.archivedAt || !["OPEN", "ON_HOLD"].includes(serviceCase.status)) throw new DomainError("No se pueden modificar aplicaciones de un expediente cerrado o archivado.");
  return serviceCase;
}
async function log(tx: Prisma.TransactionClient, ctx: OrganizationContext, serviceCase: { id: string; clientId: string }, applicationId: string, kind: "create" | "update", status: FundingApplicationStatus, previousStatus?: FundingApplicationStatus) {
  await writeActivityLog(toActivityContext(ctx), { type: "OTHER", clientId: serviceCase.clientId, serviceCaseId: serviceCase.id, description: kind === "create" ? "Aplicación a prestamista registrada." : "Aplicación a prestamista actualizada.", metadata: { applicationId, status, previousStatus: previousStatus ?? null } }, tx);
  await writeAuditLog(toAuditContext(ctx), { action: `funding.application.${kind}`, entityType: "FundingApplication", entityId: applicationId, metadata: { serviceCaseId: serviceCase.id, status, previousStatus: previousStatus ?? null } }, tx);
}
export async function createFundingApplication(ctx: OrganizationContext, serviceCaseId: string, input: FundingApplicationInput) {
  const data = normalize(input);
  return prisma.$transaction(async tx => {
    const serviceCase = await getFundingCase(tx, ctx, serviceCaseId);
    const row = await tx.fundingApplication.create({ data: { ...data, organizationId: ctx.organizationId, fundingCaseId: serviceCase.fundingCase!.id } });
    await log(tx, ctx, serviceCase, row.id, "create", row.status);
    return { ...row, clientId: serviceCase.clientId };
  }, { timeout: 15000 });
}
export async function updateFundingApplication(ctx: OrganizationContext, serviceCaseId: string, id: string, expectedUpdatedAt: Date, input: FundingApplicationInput) {
  const data = normalize(input);
  return prisma.$transaction(async tx => {
    const serviceCase = await getFundingCase(tx, ctx, serviceCaseId);
    const current = await tx.fundingApplication.findFirst({ where: { id, organizationId: ctx.organizationId, fundingCaseId: serviceCase.fundingCase!.id } });
    if (!current) throw new DomainError("Aplicación no encontrada en este expediente.");
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new DomainError("La aplicación cambió. Actualiza la página antes de editarla.");
    const row = await tx.fundingApplication.update({ where: { id: current.id }, data: { ...data, updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) } });
    await log(tx, ctx, serviceCase, row.id, "update", row.status, current.status);
    return { ...row, clientId: serviceCase.clientId };
  }, { timeout: 15000 });
}
