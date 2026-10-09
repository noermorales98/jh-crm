import { prisma } from "@/src/lib/db";
import { purgeDocumentRecord } from "@/src/server/documents";

/**
 * Retención de documentos: purga S3 + marca hardDeletedAt.
 * Idempotente: re-ejecutar no vuelve a tocar registros ya hard-deleted.
 *
 * PR-SEC-RET: solo documentos en papelera (deletedAt) con purgeAfter vencido.
 * No se purgan documentos vivos por antigüedad (documentMaxRetentionDays).
 */

export type PurgeDueResult = {
  scanned: number;
  purged: number;
  errors: number;
};

/**
 * Hard-deletea documentos soft-deleted cuyo purgeAfter ya venció.
 */
export async function purgeDueDocuments(now = new Date()): Promise<PurgeDueResult> {
  const candidates = await prisma.document.findMany({
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
