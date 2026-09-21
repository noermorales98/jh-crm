import type { DocumentCategory } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import type { OrganizationContext } from "@/src/server/auth/guards";

/**
 * DC-005 — Checklist de documentos por servicio (vertical).
 *
 * Config en código (sin tabla de config): usa DocumentCategory.
 * Categorías aditivas DC-005 (CONTRACT, INVOICE, …) van en optional.
 *
 * Cuenta documentos del CreditCase, del ServiceCase del expediente, o
 * generales del cliente (caseId y serviceCaseId null — p.ej. la ID en ficha).
 * No cuenta docs con caseId null ligados a otro ServiceCase.
 */

interface ChecklistSpec {
  required: DocumentCategory[];
  optional: DocumentCategory[];
}

const CHECKLISTS: Record<string, ChecklistSpec> = {
  CREDIT_REPAIR: {
    required: ["IDENTITY", "PROOF_OF_ADDRESS", "SSN_DOCUMENT", "CREDIT_REPORT"],
    optional: [
      "DISPUTE_LETTER",
      "UPDATE_REPORT",
      "PAYMENT_PROOF",
      "CONTRACT",
      "INVOICE",
      "RECEIPT",
      "BANK_DOCUMENT",
      "BUSINESS_DOCUMENT",
    ],
  },
};

const DEFAULT_CHECKLIST: ChecklistSpec = {
  required: ["IDENTITY"],
  optional: [],
};

export function getChecklistForService(
  serviceCode: string | null | undefined,
): ChecklistSpec {
  if (serviceCode && CHECKLISTS[serviceCode]) return CHECKLISTS[serviceCode];
  return DEFAULT_CHECKLIST;
}

export interface DocumentChecklistRow {
  category: DocumentCategory;
  required: boolean;
  count: number;
  present: boolean;
}

/** Resumen ligero para Client 360 (sin URLs ni filas de Document). */
export type DocumentsChecklistSummary = {
  complete: number;
  pending: number;
  /** Categorías requeridas faltantes (máx 3). */
  missing: { category: DocumentCategory }[];
  /** Total de documentos en el scope (todas las categorías). */
  count: number;
};

export function summarizeChecklistFromCounts(
  serviceCode: string | null | undefined,
  countByCategory: Map<DocumentCategory, number>,
): DocumentsChecklistSummary {
  const spec = getChecklistForService(serviceCode);
  let complete = 0;
  let pending = 0;
  const missing: { category: DocumentCategory }[] = [];
  for (const category of spec.required) {
    const present = (countByCategory.get(category) ?? 0) > 0;
    if (present) complete += 1;
    else {
      pending += 1;
      if (missing.length < 3) missing.push({ category });
    }
  }
  let count = 0;
  for (const n of countByCategory.values()) count += n;
  return { complete, pending, missing, count };
}

export async function getCaseDocumentChecklist(
  ctx: OrganizationContext,
  caseId: string,
) {
  const creditCase = await prisma.creditCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: {
      id: true,
      clientId: true,
      serviceCaseId: true,
      serviceCase: {
        select: { service: { select: { code: true, name: true } } },
      },
    },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");

  const spec = getChecklistForService(creditCase.serviceCase?.service?.code);

  // Caso legacy (caseId), generales del cliente (ambos null) y docs del
  // propio ServiceCase. No contar docs de otro expediente con caseId null.
  const grouped = await prisma.document.groupBy({
    by: ["category"],
    where: {
      organizationId: ctx.organizationId,
      clientId: creditCase.clientId,
      deletedAt: null,
      hardDeletedAt: null,
      OR: [
        { caseId: creditCase.id },
        { caseId: null, serviceCaseId: null },
        { caseId: null, serviceCaseId: creditCase.serviceCaseId },
      ],
    },
    _count: { _all: true },
  });
  const countByCategory = new Map<DocumentCategory, number>(
    grouped.map((row) => [row.category, row._count._all]),
  );

  const ordered: Array<{ category: DocumentCategory; required: boolean }> = [
    ...spec.required.map((category) => ({ category, required: true })),
    ...spec.optional.map((category) => ({ category, required: false })),
  ];

  const rows: DocumentChecklistRow[] = ordered.map(({ category, required }) => {
    const count = countByCategory.get(category) ?? 0;
    return { category, required, count, present: count > 0 };
  });

  return {
    serviceCode: creditCase.serviceCase?.service?.code ?? null,
    serviceName: creditCase.serviceCase?.service?.name ?? null,
    rows,
    missingRequired: rows.filter((row) => row.required && !row.present),
  };
}
