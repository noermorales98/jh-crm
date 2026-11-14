import { z } from "zod";
import { ForbiddenError } from "@/src/server/auth/guards";
import { DomainError, NotFoundError } from "@/src/server/errors";
import { getCaseBrief, getClientBrief, listCrm, searchCrm } from "@/src/server/ai/queries";
import {
  getConsultationDetail,
  getCreditReportDetail,
  getLetterDetail,
  getOpportunityDetail,
  getRoundDetail,
  getQuoteBrief,
  getServiceCaseBrief,
  getTaskBrief,
  listConsultationsMcp,
  listCreditReports,
  listLetters,
  listOpportunities,
  listRounds,
  listServiceCases,
} from "@/src/server/mcp/queries";
import { isSensitiveNumberQuery } from "@/src/server/mcp/redact";
import { defineTool, type McpContext, type Tool } from "./types";

/**
 * Lectura genérica: `listar`, `ver` y `buscar`, con una sección como parámetro.
 * Cada sección comprueba su propio permiso `*.view`; todos los roles leen.
 */

export const READ_SECTIONS = [
  "clientes",
  "casos",
  "casos_servicio",
  "tareas",
  "oportunidades",
  "cotizaciones",
  "rondas",
  "cartas",
  "reportes_credito",
  "consultas",
] as const;
export type ReadSection = (typeof READ_SECTIONS)[number];

const seccion = z
  .enum(READ_SECTIONS)
  .describe("Sección del CRM: clientes, casos (crédito), casos_servicio, tareas, oportunidades, cotizaciones, rondas (con sus ítems de disputa), cartas, reportes_credito o consultas.");

/**
 * Las consultas del asistente interno devuelven `{ error }` en lugar de lanzar.
 * Aquí se traduce a los errores del conector (Sin permiso / No encontrado).
 */
function unwrap<T>(result: T): T {
  if (result && typeof result === "object" && "error" in result) {
    const message = String((result as { error: unknown }).error ?? "");
    if (/permiso/i.test(message)) throw new ForbiddenError("Sin permiso para esta acción.");
    if (/no encontrad/i.test(message)) throw new NotFoundError();
    throw new DomainError(message);
  }
  return result;
}

function found<T>(value: T | null): T {
  if (value === null) throw new NotFoundError();
  return value;
}

/** Los servicios del CRM lanzan DomainError("… no encontrado") con ids ajenos. */
async function orNotFound<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return unwrap(await fn());
  } catch (error) {
    if (error instanceof DomainError && /no encontrad/i.test(error.message)) throw new NotFoundError();
    throw error;
  }
}

/** Recorta `items` al límite pedido (las consultas del asistente traen hasta 50). */
function limitItems<T>(result: T, limite?: number): T {
  const max = Math.min(Math.max(limite ?? 20, 1), 50);
  if (result && typeof result === "object" && Array.isArray((result as { items?: unknown }).items)) {
    const items = (result as unknown as { items: unknown[] }).items;
    return { ...result, items: items.slice(0, max) };
  }
  return result;
}

/**
 * En el conector, los nombres de documentos muy sensibles nunca salen, aunque el rol
 * pueda verlos en la app (spec: nada sensible en claro, aunque el rol lo vea).
 */
function hideSensitiveDocumentNames<T>(result: T): T {
  const docs = (result as { documents?: unknown })?.documents;
  if (!Array.isArray(docs)) return result;
  return {
    ...result,
    documents: docs.map((doc) =>
      (doc as { sensitivity?: string }).sensitivity === "HIGHLY_SENSITIVE"
        ? { ...(doc as object), name: "[documento sensible]" }
        : doc,
    ),
  };
}

async function listSection(ctx: McpContext, input: { seccion: ReadSection; estado?: string; texto?: string; limite?: number }) {
  const filters = { status: input.estado, q: input.texto };
  switch (input.seccion) {
    case "clientes":
      return limitItems(unwrap(await listCrm(ctx, "clients", filters)), input.limite);
    case "casos":
      return limitItems(unwrap(await listCrm(ctx, "cases", filters)), input.limite);
    case "tareas":
      return limitItems(unwrap(await listCrm(ctx, "tasks", filters)), input.limite);
    case "cotizaciones":
      return limitItems(unwrap(await listCrm(ctx, "quotes", filters)), input.limite);
    case "casos_servicio":
      return listServiceCases(ctx, input);
    case "oportunidades":
      return listOpportunities(ctx, input);
    case "rondas":
      return listRounds(ctx, input);
    case "cartas":
      return listLetters(ctx, input);
    case "reportes_credito":
      return listCreditReports(ctx, input);
    case "consultas":
      return listConsultationsMcp(ctx, input);
  }
}

async function viewSection(ctx: McpContext, input: { seccion: ReadSection; id: string }) {
  switch (input.seccion) {
    case "clientes":
      return hideSensitiveDocumentNames(await orNotFound(() => getClientBrief(ctx, input.id)));
    case "casos":
      return hideSensitiveDocumentNames(await orNotFound(() => getCaseBrief(ctx, input.id)));
    case "tareas":
      return found(await getTaskBrief(ctx, input.id));
    case "cotizaciones":
      return found(await getQuoteBrief(ctx, input.id));
    case "casos_servicio":
      return found(await getServiceCaseBrief(ctx, input.id));
    case "oportunidades":
      return found(await getOpportunityDetail(ctx, input.id));
    case "rondas":
      return found(await getRoundDetail(ctx, input.id));
    case "cartas":
      return found(await getLetterDetail(ctx, input.id));
    case "reportes_credito":
      return found(await getCreditReportDetail(ctx, input.id));
    case "consultas":
      return found(await getConsultationDetail(ctx, input.id));
  }
}

export const readTools: Tool[] = [
  defineTool({
    name: "listar",
    title: "Listar registros",
    description:
      "Lista registros de una sección del CRM con su estado y enlace. Filtra por estado o por texto (nombre, código). Úsala para ver «todos», «los pendientes», «los de Ana», etc.",
    inputSchema: z.object({
      seccion,
      estado: z.string().trim().max(40).optional().describe("Estado o etapa (opcional)."),
      texto: z.string().trim().max(100).optional().describe("Texto a buscar dentro de la sección (opcional)."),
      limite: z.number().int().min(1).max(50).optional().describe("Máximo de resultados (1–50, por defecto 20)."),
    }),
    permission: "dashboard.view",
    kind: "read",
    run: (ctx, input) => listSection(ctx, input),
  }),
  defineTool({
    name: "ver",
    title: "Ver un registro",
    description:
      "Muestra el detalle de un registro del CRM por su id: datos, estado, notas recientes y enlace. Saca el id de `listar` o `buscar`.",
    inputSchema: z.object({
      seccion,
      id: z.string().trim().min(1).max(64).describe("Id del registro."),
    }),
    permission: "dashboard.view",
    kind: "read",
    run: (ctx, input) => viewSection(ctx, input),
  }),
  defineTool({
    name: "buscar",
    title: "Buscar en el CRM",
    description:
      "Busca en todo el CRM (clientes, casos, cotizaciones, pagos, tareas) por nombre, código, correo o teléfono. Devuelve coincidencias con enlace.",
    inputSchema: z.object({
      texto: z.string().trim().min(2).max(100).describe("Texto a buscar (mínimo 2 caracteres)."),
    }),
    permission: "dashboard.view",
    kind: "read",
    run: async (ctx, input) => {
      if (isSensitiveNumberQuery(input.texto)) {
        throw new DomainError(
          "No se puede buscar por números largos (podrían ser SSN o cuentas). Busca por nombre, código o teléfono.",
        );
      }
      return unwrap(await searchCrm(ctx, input.texto));
    },
  }),
];
