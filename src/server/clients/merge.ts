import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import { writeAuditLog } from "@/src/server/audit";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext, toAuditContext } from "@/src/server/context";

/**
 * Inventario de FKs hacia Client (schema.prisma) usadas en el merge:
 *
 * Reasignadas (clientId origen → destino):
 *   ServiceCase, CreditCase, Document, Note, Task, Quote, Payment, Receipt,
 *   PaymentPlan, Consultation, ClientContract, CreditReport, CreditItem,
 *   CreditPdfImportJob, Opportunity, ClientProcessorAccount, ConsentRecord,
 *   ExternalReference, IntakeSubmission, Testimonial, ActivityLog, IntakeLink,
 *   MailMessage, MetaLeadEvent (string sin relación Prisma).
 *
 * No reasignadas:
 *   ClientSensitiveProfile (1:1, queda en el archivado),
 *   ClientPortalAccess (se elimina del origen).
 */

export type MergeClientsInput = {
  sourceClientId: string;
  destinationClientId: string;
  confirmDestinationName: string;
};

function normalizePersonName(firstName: string, lastName: string | null): string {
  return `${firstName} ${lastName ?? ""}`.trim().replace(/\s+/g, " ").toLowerCase();
}

export function destinationDisplayName(
  firstName: string,
  lastName: string | null,
): string {
  return `${firstName} ${lastName ?? ""}`.trim().replace(/\s+/g, " ");
}

export async function mergeClients(
  ctx: OrganizationContext,
  input: MergeClientsInput,
): Promise<{ destinationClientId: string; sourceClientId: string }> {
  const sourceId = input.sourceClientId.trim();
  const destId = input.destinationClientId.trim();
  const confirm = input.confirmDestinationName.trim().replace(/\s+/g, " ");

  if (!sourceId || !destId) {
    throw new DomainError("Debes indicar el cliente origen y el destino.");
  }
  if (sourceId === destId) {
    throw new DomainError("El origen y el destino no pueden ser el mismo cliente.");
  }
  if (!confirm) {
    throw new DomainError(
      "Escribe el nombre completo del destino para confirmar la unión.",
    );
  }

  const [source, destination] = await Promise.all([
    prisma.client.findFirst({
      where: { id: sourceId, organizationId: ctx.organizationId },
      select: {
        id: true,
        organizationId: true,
        clientCode: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    }),
    prisma.client.findFirst({
      where: { id: destId, organizationId: ctx.organizationId },
      select: {
        id: true,
        organizationId: true,
        clientCode: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    }),
  ]);

  if (!source) {
    throw new DomainError("Cliente origen no encontrado en esta organización.");
  }
  if (!destination) {
    throw new DomainError("Cliente destino no encontrado en esta organización.");
  }
  if (source.organizationId !== destination.organizationId) {
    throw new DomainError("No se pueden unir clientes de organizaciones distintas.");
  }
  if (source.status === "ARCHIVED") {
    throw new DomainError("El cliente origen ya está archivado.");
  }
  if (destination.status === "ARCHIVED") {
    throw new DomainError("El cliente destino está archivado.");
  }

  const expected = normalizePersonName(destination.firstName, destination.lastName);
  if (confirm.toLowerCase() !== expected) {
    throw new DomainError(
      "El nombre de confirmación no coincide con el del cliente destino.",
    );
  }

  const orgId = ctx.organizationId;
  const from = { organizationId: orgId, clientId: source.id };
  const toClientId = destination.id;

  await prisma.$transaction(async (tx) => {
    await tx.serviceCase.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.creditCase.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.document.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.note.updateMany({
      where: { clientId: source.id },
      data: { clientId: toClientId },
    });
    await tx.task.updateMany({
      where: { clientId: source.id },
      data: { clientId: toClientId },
    });
    await tx.quote.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.payment.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.receipt.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.paymentPlan.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.consultation.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.clientContract.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.creditReport.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.creditItem.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.creditPdfImportJob.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.opportunity.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.clientProcessorAccount.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.consentRecord.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.externalReference.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.intakeSubmission.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.testimonial.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.activityLog.updateMany({
      where: from,
      data: { clientId: toClientId },
    });
    await tx.intakeLink.updateMany({
      where: { clientId: source.id },
      data: { clientId: toClientId },
    });
    await tx.mailMessage.updateMany({
      where: { clientId: source.id },
      data: { clientId: toClientId },
    });
    await tx.metaLeadEvent.updateMany({
      where: { organizationId: orgId, clientId: source.id },
      data: { clientId: toClientId },
    });

    await tx.clientPortalAccess.deleteMany({
      where: { organizationId: orgId, clientId: source.id },
    });

    await tx.client.update({
      where: { id: source.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "STATUS_CHANGE",
        description: `Cliente ${source.clientCode} archivado tras unir con ${destination.clientCode}.`,
        clientId: source.id,
        metadata: {
          mergedIntoClientId: destination.id,
          sourceClientCode: source.clientCode,
          destinationClientCode: destination.clientCode,
        },
      },
      tx,
    );

    const sourceLabel =
      `${source.firstName} ${source.lastName ?? ""}`.trim() || source.clientCode;
    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "NOTE",
        description: `Expediente unificado: se incorporó ${source.clientCode} (${sourceLabel}).`,
        clientId: destination.id,
        metadata: {
          mergedFromClientId: source.id,
          sourceClientCode: source.clientCode,
        },
      },
      tx,
    );

    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "CLIENT_MERGED",
        entityType: "Client",
        entityId: destination.id,
        metadata: {
          sourceClientId: source.id,
          destinationClientId: destination.id,
          sourceClientCode: source.clientCode,
          destinationClientCode: destination.clientCode,
        },
      },
      tx,
    );
  });

  return {
    destinationClientId: destination.id,
    sourceClientId: source.id,
  };
}
