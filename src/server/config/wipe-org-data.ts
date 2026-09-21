import { prisma } from "@/src/lib/db";
import {
  WIPE_CONFIRMATION_PHRASE,
  type WipePreviewCounts,
} from "@/src/lib/config/wipe-constants";
import { deleteObject, isStorageConfigured } from "@/src/lib/storage/s3";
import { writeAuditLog } from "@/src/server/audit";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toAuditContext } from "@/src/server/context";
import { DomainError } from "@/src/server/errors";

export { WIPE_CONFIRMATION_PHRASE, type WipePreviewCounts };

export type WipeResult = WipePreviewCounts & {
  storageObjectsPurged: number;
};

/**
 * Conteos de datos operativos que se eliminarían. No incluye usuarios,
 * catálogo, etapas, plantillas ni la configuración de la empresa.
 */
export async function getWipePreview(
  ctx: OrganizationContext,
): Promise<WipePreviewCounts> {
  const org = { organizationId: ctx.organizationId };
  const [
    clients,
    opportunities,
    serviceCases,
    creditCases,
    quotes,
    payments,
    documents,
    mails,
    tasks,
    chats,
  ] = await Promise.all([
    prisma.client.count({ where: org }),
    prisma.opportunity.count({ where: org }),
    prisma.serviceCase.count({ where: org }),
    prisma.creditCase.count({ where: org }),
    prisma.quote.count({ where: org }),
    prisma.payment.count({ where: org }),
    prisma.document.count({ where: org }),
    prisma.mailMessage.count({ where: org }),
    prisma.task.count({ where: org }),
    prisma.aiChat.count({ where: org }),
  ]);

  return {
    clients,
    opportunities,
    serviceCases,
    creditCases,
    quotes,
    payments,
    documents,
    mails,
    tasks,
    chats,
  };
}

function countsAreEmpty(counts: WipePreviewCounts): boolean {
  return Object.values(counts).every((value) => value === 0);
}

/**
 * Borra el contenido operativo de la organización (clientes, leads, casos,
 * pagos, correos, etc.). Conserva usuarios, membresías, catálogo, etapas,
 * plantillas, procesadores y la configuración de la empresa.
 */
export async function wipeOrganizationData(
  ctx: OrganizationContext,
  confirmation: string,
): Promise<WipeResult> {
  if (confirmation.trim() !== WIPE_CONFIRMATION_PHRASE) {
    throw new DomainError(
      `Escribe ${WIPE_CONFIRMATION_PHRASE} para confirmar. Esta acción no se puede deshacer.`,
    );
  }

  const preview = await getWipePreview(ctx);
  const storageObjectsPurged = await purgeStorageObjects(ctx.organizationId);

  await prisma.$transaction(
    async (tx) => {
      const org = { organizationId: ctx.organizationId };

      await tx.reportComparisonItem.deleteMany({
        where: { comparison: org },
      });
      await tx.disputeLetterItem.deleteMany({ where: { letter: org } });
      await tx.quoteItem.deleteMany({ where: { quote: org } });
      await tx.paymentInstallment.deleteMany({ where: { plan: org } });
      await tx.serviceCaseStageHistory.deleteMany({
        where: { serviceCase: org },
      });

      await tx.reportComparison.deleteMany({ where: org });
      await tx.disputeLetter.deleteMany({ where: org });
      await tx.disputeItem.deleteMany({ where: org });
      await tx.creditItem.deleteMany({ where: org });
      await tx.creditPdfImportJob.deleteMany({ where: org });
      await tx.creditReport.deleteMany({ where: org });
      await tx.clientProgressReport.deleteMany({ where: org });
      await tx.receipt.deleteMany({ where: org });
      await tx.clientContract.deleteMany({ where: org });
      await tx.document.deleteMany({ where: org });
      await tx.clientPortalAccess.deleteMany({ where: org });
      await tx.consultation.deleteMany({ where: org });
      await tx.payment.deleteMany({ where: org });
      await tx.paymentPlan.deleteMany({ where: org });
      await tx.quoteEvent.deleteMany({ where: org });
      await tx.quote.deleteMany({ where: org });
      await tx.opportunity.deleteMany({ where: org });
      await tx.metaLeadEvent.deleteMany({ where: org });
      await tx.clientProcessorAccount.deleteMany({ where: org });
      await tx.intakeSubmission.deleteMany({ where: org });
      await tx.intakeLink.deleteMany({ where: org });
      await tx.consentRecord.deleteMany({ where: org });
      await tx.externalReference.deleteMany({ where: org });
      await tx.note.deleteMany({ where: org });
      await tx.task.deleteMany({ where: org });
      await tx.activityLog.deleteMany({ where: org });
      await tx.mailMessage.updateMany({
        where: org,
        data: { inReplyToId: null },
      });
      await tx.mailMessage.deleteMany({ where: org });
      await tx.aiChat.deleteMany({ where: org });
      await tx.notification.deleteMany({ where: org });
      await tx.testimonial.deleteMany({ where: org });
      await tx.creditRound.deleteMany({ where: org });
      // CreditCase.serviceCaseId es Restrict: hay que borrar el caso de crédito primero.
      await tx.creditCase.deleteMany({ where: org });
      await tx.fundingApplication.deleteMany({ where: org });
      await tx.fundingCase.deleteMany({ where: org });
      await tx.homeBuyerCase.deleteMany({ where: org });
      await tx.personalLoanCase.deleteMany({ where: org });
      await tx.projectCase.deleteMany({ where: org });
      await tx.serviceCase.deleteMany({ where: org });
      await tx.clientSensitiveProfile.deleteMany({ where: org });
      await tx.client.deleteMany({ where: org });
      await tx.auditLog.deleteMany({ where: org });
      await tx.organizationSettings.updateMany({
        where: org,
        data: {
          clientCounter: 0,
          quoteCounter: 0,
          receiptCounter: 0,
          caseCounter: 0,
        },
      });
    },
    { maxWait: 15_000, timeout: 120_000 },
  );

  await writeAuditLog(toAuditContext(ctx), {
    action: "ORG_DATA_WIPED",
    entityType: "Organization",
    entityId: ctx.organizationId,
    metadata: {
      ...preview,
      storageObjectsPurged,
      empty: countsAreEmpty(preview),
    },
  });

  return { ...preview, storageObjectsPurged };
}

async function purgeStorageObjects(organizationId: string): Promise<number> {
  if (!isStorageConfigured()) return 0;

  const documents = await prisma.document.findMany({
    where: {
      organizationId,
      hardDeletedAt: null,
      NOT: { storageKey: { startsWith: "purged/" } },
    },
    select: { storageKey: true },
  });

  let purged = 0;
  for (const document of documents) {
    if (!document.storageKey) continue;
    try {
      await deleteObject(document.storageKey);
      purged += 1;
    } catch (error) {
      console.error("[wipe] deleteObject falló:", error);
    }
  }
  return purged;
}
