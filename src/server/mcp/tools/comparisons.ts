import { z } from "zod";
import { prisma } from "@/src/lib/db";
import { CASE_ROUTE_PATTERN, caseHref } from "@/src/lib/routes/case-routes";
import { cuidSchema } from "@/src/lib/validation/common";
import { createComparisonSchema, overrideComparisonItemSchema } from "@/src/lib/validation/comparisons";
import { DomainError, NotFoundError } from "@/src/server/errors";
import * as comparisonService from "@/src/server/comparisons";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Escritura de comparaciones entre reportes de crédito. Cada herramienta replica su action
 * de `src/actions/comparisons.ts`: mismo permiso (`comparisons.manage`), mismo esquema y
 * mismo servicio. Corregir un resultado a mano no borra el automático: se guarda aparte.
 */

/** Los servicios lanzan DomainError("… no encontrado") con ids ajenos: es "no existe". */
async function orNotFound<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DomainError && /no encontrad/i.test(error.message)) throw new NotFoundError();
    throw error;
  }
}

/** Igual que `revalidateComparisons` de la action. */
function comparisonRoutes(): RevalidateTarget[] {
  return [{ path: CASE_ROUTE_PATTERN, type: "layout" }];
}

/** Enlace a la ficha del caso donde vive la comparación (el CRM no tiene página propia). */
async function caseLink(caseId: string): Promise<string> {
  const creditCase = await prisma.creditCase.findUnique({ where: { id: caseId }, select: { clientId: true } });
  return creditCase ? caseHref(creditCase.clientId, caseId) : "/crm/clientes";
}

const reporteDesc = "Identificador de un reporte de crédito de ese mismo caso (se obtiene con `listar` en la sección reportes_credito).";

const crearComparacion = defineTool({
  name: "crear_comparacion",
  title: "Comparar dos reportes de crédito",
  description:
    "Compara dos reportes de crédito de un mismo caso (uno base y uno posterior) y deja el resultado por partida: eliminada, actualizada, verificada, sin cambios o nueva. Los dos reportes tienen que ser distintos y del caso indicado.",
  kind: "write",
  permission: "comparisons.manage",
  inputSchema: z.object({
    caseId: createComparisonSchema.shape.caseId.describe("Identificador del caso de crédito."),
    baseReportId: createComparisonSchema.shape.baseReportId.describe(`Reporte base (el más antiguo). ${reporteDesc}`),
    compareReportId: createComparisonSchema.shape.compareReportId.describe(`Reporte a comparar (el más reciente). ${reporteDesc}`),
    notes: createComparisonSchema.shape.notes.describe("Notas de la comparación (máximo 5000 caracteres)."),
  }),
  async run(ctx, input) {
    const comparison = await orNotFound(() => comparisonService.createComparison(ctx, createComparisonSchema.parse(input)));
    return { id: comparison.id, caseId: comparison.caseId, href: await caseLink(comparison.caseId) };
  },
  audit: (_input, result) => ({ entityType: "ReportComparison", entityId: (result as { id: string }).id }),
  revalidate: () => comparisonRoutes(),
});

const ajustarResultadoComparacion = defineTool({
  name: "ajustar_resultado_comparacion",
  title: "Corregir un resultado de comparación",
  description:
    "Corrige a mano el resultado de una partida de una comparación (DELETED, UPDATED, VERIFIED, UNCHANGED o NEW) o quita la corrección con null; el resultado automático se conserva. Las notas reemplazan a las anteriores.",
  kind: "write",
  permission: "comparisons.manage",
  inputSchema: z.object({
    itemId: cuidSchema.describe("Identificador de la partida de la comparación (se obtiene con `ver` en la sección comparaciones)."),
    manualResult: overrideComparisonItemSchema.shape.manualResult.describe("Resultado corregido a mano: DELETED, UPDATED, VERIFIED, UNCHANGED o NEW; null quita la corrección."),
    notes: overrideComparisonItemSchema.shape.notes.describe("Notas de la corrección (máximo 5000 caracteres); si se omiten, las notas no cambian."),
  }),
  async run(ctx, { itemId, ...rest }) {
    const comparison = await orNotFound(() =>
      comparisonService.overrideComparisonItem(ctx, itemId, overrideComparisonItemSchema.parse(rest)),
    );
    return { comparisonId: comparison.id, itemId, caseId: comparison.caseId, href: await caseLink(comparison.caseId) };
  },
  audit: (input, result) => ({
    entityType: "ReportComparisonItem",
    entityId: (result as { itemId?: string } | null)?.itemId ?? input.itemId,
  }),
  revalidate: () => comparisonRoutes(),
});

/** Herramientas de escritura de comparaciones. */
export const comparisonsTools: Tool[] = [crearComparacion, ajustarResultadoComparacion] as Tool[];
