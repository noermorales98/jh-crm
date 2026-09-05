import { prisma } from "@/src/lib/db";
import { purgeDocumentRecord } from "@/src/server/documents";

/**
 * Retención de documentos: purga S3 + marca hardDeletedAt.
 * Idempotente: re-ejecutar no vuelve a tocar registros ya hard-deleted.
 */

export type PurgeDueResult = {
  scanned: number;
  purged: number;
  errors: number;
};

/**
 * Encuentra documentos con purgeAfter vencido (soft-delete) o que
 * superan documentMaxRetentionDays de la organización, y los hard-deletea.
 */
export async function purgeDueDocuments(now = new Date()): Promise<PurgeDueResult> {
  const settingsRows = await prisma.organizationSettings.findMany({
    select: {
      organizationId: true,
      documentMaxRetentionDays: true,
    },
  });
  const maxByOrg = new Map(
    settingsRows.map((s) => [s.organizationId, s.documentMaxRetentionDays]),
  );

  const softDue = await prisma.document.findMany({
    where: {
      hardDeletedAt: null,
      deletedAt: { not: null },
      purgeAfter: { lte: now },
    },
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      caseId: true,
      roundId: true,
      storageKey: true,
      displayName: true,
      originalName: true,
      category: true,
      sensitivity: true,
    },
  });

  const maxDue: typeof softDue = [];
  for (const [organizationId, days] of maxByOrg) {
    if (typeof days !== "number" || days <= 0) continue;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const rows = await prisma.document.findMany({
      where: {
        organizationId,
        hardDeletedAt: null,
        createdAt: { lte: cutoff },
      },
      select: {
        id: true,
        organizationId: true,
        clientId: true,
        caseId: true,
        roundId: true,
        storageKey: true,
        displayName: true,
        originalName: true,
        category: true,
        sensitivity: true,
      },
    });
    maxDue.push(...rows);
  }

  const byId = new Map<string, (typeof softDue)[number]>();
  for (const doc of [...softDue, ...maxDue]) {
    byId.set(doc.id, doc);
  }
  const candidates = [...byId.values()];

  let purged = 0;
  let errors = 0;
  for (const doc of candidates) {
    try {
      await purgeDocumentRecord(doc, {
        organizationId: doc.organizationId,
        actorUserId: null,
      });
      purged += 1;
    } catch (error) {
      errors += 1;
      console.error("[retention] purge falló:", doc.id, error);
    }
  }

  return { scanned: candidates.length, purged, errors };
}
