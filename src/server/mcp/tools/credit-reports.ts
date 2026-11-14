import { z } from "zod";
import { cuidSchema } from "@/src/lib/validation/common";
import {
  addCreditItemSchema,
  bureauSnapshotInputSchema,
  createCreditReportSchema,
  updateCreditItemSchema,
  updateCreditReportSchema,
} from "@/src/lib/validation/credit-reports";
import { CASE_ROUTE_PATTERN, creditAnalysisHref } from "@/src/lib/routes/case-routes";
import { DomainError, NotFoundError } from "@/src/server/errors";
import * as creditReportService from "@/src/server/credit-reports";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Escritura de reportes de crédito y sus partidas (tanda 2). Cada herramienta replica su
 * action de `src/actions/credit-reports.ts`: mismo permiso, mismo esquema, mismo servicio y
 * las mismas rutas refrescadas. No hay herramienta de borrado: `deleteCreditItem` borra de
 * verdad y el proyecto solo permite borrados lógicos (ver decisions.md). Por la misma razón,
 * `editar_reporte_credito` no acepta `snapshots`: el servicio los reemplaza con `deleteMany`.
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

/** Igual que `revalidateCredit` de la action. */
function creditRoutes(clientId: string): RevalidateTarget[] {
  return [
    { path: CASE_ROUTE_PATTERN, type: "layout" },
    `/crm/clientes/${clientId}`,
    `/crm/clientes/${clientId}/reportes`,
    "/crm/dashboard",
  ];
}

/** Aplica una descripción en español a cada campo de una forma de esquema. */
function describeShape<T extends z.ZodRawShape>(shape: T, desc: Record<keyof T, string>): T {
  return Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => [key, (schema as z.ZodType).describe(desc[key as keyof T])]),
  ) as unknown as T;
}

const itemFields = describeShape(addCreditItemSchema.shape, {
  reportId: "Identificador del reporte de crédito al que se agrega la partida.",
  creditorName: "Nombre del acreedor (obligatorio, máximo 200 caracteres).",
  accountNumberMasked: "Número de cuenta enmascarado, solo dígitos, asteriscos o X (por ejemplo ****1234). Nunca el número completo.",
  accountType: "Tipo de cuenta (por ejemplo tarjeta, préstamo de auto).",
  bureau: "Buró que reporta la partida: EXPERIAN, EQUIFAX o TRANSUNION.",
  balance: "Saldo actual.",
  creditLimit: "Límite de crédito.",
  monthlyPayment: "Pago mensual.",
  dateOpened: "Fecha de apertura de la cuenta.",
  dateReported: "Fecha del último reporte de la cuenta.",
  accountStatus: "Estado de la cuenta según el buró.",
  paymentStatus: "Estado de pago según el buró.",
  openClosedStatus: "Si la cuenta está abierta o cerrada.",
  negativeType:
    "Tipo de negativo: COLLECTION, CHARGE_OFF, LATE_PAYMENT, REPOSSESSION, BANKRUPTCY, HARD_INQUIRY, FORECLOSURE u OTHER.",
  remarks: "Observaciones de la partida.",
  isNegative: "Si la partida es un negativo.",
  disputeEligible: "Si la partida puede disputarse.",
  lifecycleStatus: "Estado de trabajo: IDENTIFIED, UNDER_REVIEW, SELECTED, DISPUTED, RESOLVED o EXCLUDED.",
  responsibility: "Responsabilidad sobre la cuenta (titular, autorizado, etc.).",
  sourcePage: "Página del documento de origen donde aparece la partida.",
  sourceWindow: "Ventana del documento de origen donde aparece la partida.",
  fieldQuality: "Calidad de los campos leídos del documento (uso interno de la importación).",
});

const { reportId: _reportIdField, ...newItemFields } = itemFields;
void _reportIdField;
const itemDesc = Object.fromEntries(
  Object.entries(itemFields).map(([key, schema]) => [key, schema.description ?? ""]),
) as Record<keyof typeof itemFields, string>;

const snapshotFields = describeShape(bureauSnapshotInputSchema.shape, {
  bureau: "Buró del resumen: EXPERIAN, EQUIFAX o TRANSUNION.",
  score: "Puntaje de crédito (300 a 900).",
  totalAccounts: "Total de cuentas.",
  openAccounts: "Cuentas abiertas.",
  closedAccounts: "Cuentas cerradas.",
  negativeAccounts: "Cuentas negativas.",
  collections: "Cuentas en cobranza.",
  inquiries: "Consultas.",
  modelFamily: "Familia del modelo de puntaje.",
  modelVersion: "Versión del modelo de puntaje.",
  reasonCodes: "Códigos de razón del puntaje (máximo 8).",
  totalBalance: "Saldo total.",
  utilization: "Utilización de crédito en porcentaje (0 a 100).",
});
const snapshots = z.array(z.object(snapshotFields)).max(3);

const createShape = createCreditReportSchema.shape;
const updateShape = updateCreditReportSchema.shape;

/** Resumen del reporte: solo lo necesario, sin datos de cuentas. */
function reportResult(report: { id: string; caseId: string; clientId: string; type: string }) {
  return {
    id: report.id,
    caseId: report.caseId,
    clientId: report.clientId,
    type: report.type,
    href: creditAnalysisHref(report.id),
  };
}

/** Resumen de la partida: nunca devuelve el número de cuenta. */
function itemResult(item: {
  id: string;
  reportId: string;
  clientId: string;
  creditorName: string;
  bureau: string;
  lifecycleStatus: string;
}) {
  return {
    id: item.id,
    reportId: item.reportId,
    clientId: item.clientId,
    creditorName: item.creditorName,
    bureau: item.bureau,
    lifecycleStatus: item.lifecycleStatus,
    href: creditAnalysisHref(item.reportId),
  };
}

const reportAudit = (_input: unknown, result: unknown) => ({
  entityType: "CreditReport",
  entityId: (result as { id: string }).id,
});
const itemAudit = (_input: unknown, result: unknown) => ({
  entityType: "CreditItem",
  entityId: (result as { id: string }).id,
});
const revalidateResult = (result: unknown) => creditRoutes((result as { clientId: string }).clientId);

const crearReporte = defineTool({
  name: "crear_reporte_credito",
  title: "Crear reporte de crédito",
  description:
    "Crea un reporte de crédito en un caso de crédito existente, con fecha, proveedor, notas y, si se dan, resúmenes por buró y partidas. Úsala cuando la persona pida registrar un reporte de crédito nuevo de un cliente.",
  kind: "write",
  permission: "creditReports.manage",
  inputSchema: z.object({
    caseId: createShape.caseId.describe("Identificador del caso de crédito al que pertenece el reporte."),
    type: createShape.type.describe("Tipo de reporte: INITIAL, UPDATE o MANUAL (por defecto MANUAL)."),
    reportDate: createShape.reportDate.describe("Fecha del reporte (AAAA-MM-DD)."),
    provider: createShape.provider.describe("Proveedor o fuente del reporte."),
    externalReportId: createShape.externalReportId.describe("Identificador del reporte en el proveedor."),
    documentId: createShape.documentId.describe("Identificador de un documento del mismo caso o cliente con el reporte original."),
    notes: createShape.notes.describe("Notas del reporte (máximo 5000 caracteres)."),
    snapshots: snapshots.optional().describe("Resúmenes por buró (máximo 3)."),
    items: z.array(z.object(newItemFields)).max(200).optional().describe("Partidas del reporte (máximo 200)."),
  }),
  run: (ctx, data) => orNotFound(async () => reportResult(await creditReportService.createCreditReport(ctx, data))),
  audit: reportAudit,
  revalidate: revalidateResult,
});

const editarReporte = defineTool({
  name: "editar_reporte_credito",
  title: "Editar reporte de crédito",
  description:
    "Cambia el tipo, fecha, proveedor, notas o documento de un reporte de crédito. No toca los resúmenes por buró ni las partidas. Úsala cuando la persona quiera corregir un reporte ya registrado.",
  kind: "write",
  permission: "creditReports.manage",
  inputSchema: z.object({
    reportId: cuidSchema.describe("Identificador del reporte de crédito."),
    type: updateShape.type.describe("Nuevo tipo: INITIAL, UPDATE o MANUAL."),
    reportDate: updateShape.reportDate.describe("Nueva fecha del reporte (AAAA-MM-DD)."),
    provider: updateShape.provider.describe("Nuevo proveedor; vacío o null lo quita."),
    externalReportId: updateShape.externalReportId.describe("Nuevo identificador externo; vacío o null lo quita."),
    documentId: updateShape.documentId.describe("Nuevo documento ligado al reporte; null lo quita."),
    notes: updateShape.notes.describe("Nuevas notas; vacío o null las borra."),
  }),
  run: (ctx, { reportId, ...data }) =>
    orNotFound(async () => reportResult(await creditReportService.updateCreditReport(ctx, reportId, data))),
  audit: reportAudit,
  revalidate: revalidateResult,
});

const agregarPartida = defineTool({
  name: "agregar_partida_credito",
  title: "Agregar partida de crédito",
  description:
    "Agrega una partida (cuenta, negativo o consulta) a un reporte de crédito existente. Úsala cuando la persona pida añadir una cuenta o un negativo a un reporte. Usa solo números de cuenta enmascarados.",
  kind: "write",
  permission: "creditItems.manage",
  inputSchema: z.object(itemFields),
  run: (ctx, data) =>
    orNotFound(async () => {
      const { reportId, ...item } = data;
      return itemResult(await creditReportService.addCreditItem(ctx, reportId, item));
    }),
  audit: itemAudit,
  revalidate: revalidateResult,
});

const editarPartida = defineTool({
  name: "editar_partida_credito",
  title: "Editar partida de crédito",
  description:
    "Cambia los datos de una partida de un reporte de crédito (acreedor, saldos, estado, tipo de negativo, estado de trabajo). Úsala cuando la persona quiera corregir o avanzar una partida. No borra partidas.",
  kind: "write",
  permission: "creditItems.manage",
  inputSchema: z.object({
    itemId: cuidSchema.describe("Identificador de la partida de crédito."),
    ...describeShape(updateCreditItemSchema.shape, {
      creditorName: itemDesc.creditorName,
      accountNumberMasked: itemDesc.accountNumberMasked,
      accountType: itemDesc.accountType,
      bureau: itemDesc.bureau,
      balance: itemDesc.balance,
      creditLimit: itemDesc.creditLimit,
      monthlyPayment: itemDesc.monthlyPayment,
      dateOpened: itemDesc.dateOpened,
      dateReported: itemDesc.dateReported,
      accountStatus: itemDesc.accountStatus,
      paymentStatus: itemDesc.paymentStatus,
      openClosedStatus: itemDesc.openClosedStatus,
      negativeType: itemDesc.negativeType,
      remarks: itemDesc.remarks,
      isNegative: itemDesc.isNegative,
      disputeEligible: itemDesc.disputeEligible,
      lifecycleStatus: itemDesc.lifecycleStatus,
      responsibility: itemDesc.responsibility,
      sourcePage: itemDesc.sourcePage,
      sourceWindow: itemDesc.sourceWindow,
      fieldQuality: itemDesc.fieldQuality,
    }),
  }),
  run: (ctx, { itemId, ...data }) =>
    orNotFound(async () => itemResult(await creditReportService.updateCreditItem(ctx, itemId, data))),
  audit: itemAudit,
  revalidate: revalidateResult,
});

export const creditReportsTools: Tool[] = [crearReporte, editarReporte, agregarPartida, editarPartida] as Tool[];
