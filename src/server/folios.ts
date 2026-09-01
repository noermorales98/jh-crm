import type { Prisma } from "@prisma/client";
import {
  buildCaseCode,
  buildClientCode,
  buildQuoteFolio,
  buildReceiptFolio,
} from "@/src/lib/format";

/**
 * Folios transaccionales: incrementan el contador de OrganizationSettings
 * DENTRO de la misma transacción que crea la entidad (ver 02-arquitectura).
 * El `update` con `increment` es atómico en MySQL, por lo que dos requests
 * concurrentes nunca obtienen el mismo número.
 *
 * Formatos:
 *   cliente    CL-0001        (prefijo-número)
 *   caso       CASE-0001      (prefijo-número)
 *   cotización Q-2026-0001    (prefijo-año-número)
 *   recibo     REC-2026-0001  (prefijo-año-número)
 */

export async function nextClientCode(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<{ code: string; sequence: number }> {
  const settings = await tx.organizationSettings.update({
    where: { organizationId },
    data: { clientCounter: { increment: 1 } },
    select: { clientCounter: true, clientPrefix: true },
  });
  return {
    code: buildClientCode(settings.clientPrefix, settings.clientCounter),
    sequence: settings.clientCounter,
  };
}

export async function nextCaseCode(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<{ code: string; sequence: number }> {
  const settings = await tx.organizationSettings.update({
    where: { organizationId },
    data: { caseCounter: { increment: 1 } },
    select: { caseCounter: true, casePrefix: true },
  });
  return {
    code: buildCaseCode(settings.casePrefix, settings.caseCounter),
    sequence: settings.caseCounter,
  };
}

export async function nextQuoteFolio(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<{ folio: string; folioNumber: number }> {
  const settings = await tx.organizationSettings.update({
    where: { organizationId },
    data: { quoteCounter: { increment: 1 } },
    select: { quoteCounter: true, quotePrefix: true },
  });
  return {
    folio: buildQuoteFolio(settings.quotePrefix, settings.quoteCounter),
    folioNumber: settings.quoteCounter,
  };
}

export async function nextReceiptFolio(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<{ folio: string; folioNumber: number }> {
  const settings = await tx.organizationSettings.update({
    where: { organizationId },
    data: { receiptCounter: { increment: 1 } },
    select: { receiptCounter: true, receiptPrefix: true },
  });
  return {
    folio: buildReceiptFolio(settings.receiptPrefix, settings.receiptCounter),
    folioNumber: settings.receiptCounter,
  };
}
