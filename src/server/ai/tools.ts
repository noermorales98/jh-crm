import { z } from "zod";
import { tool } from "@ai-sdk/provider-utils";
import type { OrganizationContext } from "@/src/server/auth/guards";
import {
  getCaseBrief,
  getCatalogSnapshot,
  getClientBrief,
  getCompanySnapshot,
  getCreditCaseDetail,
  getDashboardSnapshot,
  getMailSnapshot,
  getRoutesAndHowTo,
  draftMailHelp,
  listCreditAttention,
  listCrm,
  listMailsSnapshot,
  searchCreditProgress,
  searchCrm,
} from "./queries";

/**
 * Herramientas de solo lectura, siempre scopeadas a organizationId.
 * Nunca exponen SSN descifrado, API keys ni SQL.
 */
export function buildCrmTools(ctx: OrganizationContext) {
  return {
    getCompanyInfo: tool({
      description:
        "Datos de la empresa y configuración de la organización: nombre legal, teléfono, correo, web, dirección, moneda, zona horaria y prefijos. No incluye secretos.",
      inputSchema: z.object({
        includeTerms: z
          .boolean()
          .optional()
          .describe("Si true, incluye los términos por defecto de las cotizaciones."),
      }),
      execute: async () => getCompanySnapshot(ctx),
    }),
    listCrm: tool({
      description:
        "Lista registros del CRM con nombres, códigos, estados y enlaces. Úsala cuando pidan la lista, inventario, todos los clientes, prospectos, pagos, casos, tareas, cotizaciones, rondas o recibos. Sin status incluye TODOS los estados (LEAD/Prospecto y ACTIVE/Activo). No uses searchCrm ni getDashboard para esto.",
      inputSchema: z.object({
        entity: z
          .enum([
            "clients",
            "cases",
            "payments",
            "tasks",
            "quotes",
            "rounds",
            "receipts",
          ])
          .describe(
            "Qué listar. clients = clientes y prospectos. payments = pagos. cases = casos.",
          ),
        status: z
          .string()
          .optional()
          .describe(
            "Filtro opcional. Clientes: LEAD (prospecto), ACTIVE, PAUSED, COMPLETED, CANCELLED, ARCHIVED. Omite el campo o usa all para incluir todos, incluidos prospectos.",
          ),
        q: z
          .string()
          .optional()
          .describe("Filtro opcional por nombre, código, folio o correo."),
      }),
      execute: async ({ entity, status, q }) => listCrm(ctx, entity, { status, q }),
    }),
    searchCrm: tool({
      description:
        "Busca un registro concreto por nombre, código (CL-0001, CASE-0001), folio, correo o teléfono. No la uses para listar todos los clientes o pagos; para eso usa listCrm.",
      inputSchema: z.object({
        query: z
          .string()
          .trim()
          .min(2)
          .max(120)
          .describe("Texto a buscar: nombre, código, folio, correo o teléfono."),
      }),
      execute: async ({ query }) => searchCrm(ctx, query),
    }),
    getDashboard: tool({
      description:
        "Solo conteos y pendientes del tablero. activeClients cuenta únicamente clientes ACTIVE (no prospectos LEAD). Incluye widgets de atención crédito. NO sirve para listar nombres: usa listCrm o listCreditAttention.",
      inputSchema: z.object({
        reason: z.string().optional().describe("Por qué se pide el dashboard."),
      }),
      execute: async () => getDashboardSnapshot(ctx),
    }),
    getClient: tool({
      description:
        "Detalle de un cliente por id: contacto, casos, tareas abiertas, cotizaciones, pagos, documentos (sin SSN) y enlaces a su ficha y expediente.",
      inputSchema: z.object({
        clientId: z.string().min(1).describe("Id interno del cliente."),
      }),
      execute: async ({ clientId }) => getClientBrief(ctx, clientId),
    }),
    getCase: tool({
      description:
        "Detalle de un caso de crédito por id: etapa, cliente, rondas, tareas, cotizaciones, pagos y enlaces a cada pestaña.",
      inputSchema: z.object({
        caseId: z.string().min(1).describe("Id interno del caso."),
      }),
      execute: async ({ caseId }) => getCaseBrief(ctx, caseId),
    }),
    getCreditCaseDetail: tool({
      description:
        "Detalle crediticio de un caso: último CreditReport con scores por buró, resumen de DisputeItems de la ronda activa y última comparación de reportes. Nunca incluye SSN.",
      inputSchema: z.object({
        caseId: z.string().min(1).describe("Id interno del caso de crédito."),
      }),
      execute: async ({ caseId }) => getCreditCaseDetail(ctx, caseId),
    }),
    listCreditAttention: tool({
      description:
        "Lista atención crediticia: rondas WAITING_UPDATE vencidas, revisiones de esta semana (nextReviewAt), casos en documentos pendientes y rondas por preparar.",
      inputSchema: z.object({
        reason: z.string().optional().describe("Por qué se pide la lista."),
      }),
      execute: async () => listCreditAttention(ctx),
    }),
    searchCreditProgress: tool({
      description:
        "Progreso crediticio por nombre de cliente: outcomes reales (DELETED/UPDATED/etc.), disputas activas y última comparación. Nunca inventa eliminaciones.",
      inputSchema: z.object({
        clientName: z
          .string()
          .trim()
          .min(2)
          .max(120)
          .describe("Nombre o código del cliente."),
      }),
      execute: async ({ clientName }) => searchCreditProgress(ctx, clientName),
    }),
    getCatalog: tool({
      description:
        "Catálogo de servicios y paquetes con precios. Útil para explicar cómo armar una cotización.",
      inputSchema: z.object({
        reason: z.string().optional(),
      }),
      execute: async () => getCatalogSnapshot(ctx),
    }),
    getHowTo: tool({
      description:
        "Rutas del CRM y pasos para agregar o editar clientes, casos, cotizaciones, pagos, documentos, usuarios y configuración. Devuelve enlaces clicables /crm/...",
      inputSchema: z.object({
        topic: z
          .string()
          .optional()
          .describe(
            "Tema: cliente, caso, ronda, tarea, cotización, pago, recibo, documento, usuario, etapa, configuración, crédito, portal, contratos, correo, mails.",
          ),
      }),
      execute: async ({ topic }) => getRoutesAndHowTo(topic),
    }),
    listMails: tool({
      description:
        "Lista correos del CRM (bandeja, enviados, borradores, etc.). Úsala cuando pidan leer, revisar o resumir correos. No inventes mensajes.",
      inputSchema: z.object({
        folder: z
          .enum(["inbox", "sent", "drafts", "archive", "spam", "trash"])
          .optional()
          .describe("Carpeta. Por defecto inbox."),
        q: z
          .string()
          .optional()
          .describe("Filtro opcional por asunto, remitente o texto."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe("Cuántos correos devolver (máx 30)."),
      }),
      execute: async ({ folder, q, limit }) =>
        listMailsSnapshot(ctx, { folder, q, limit }),
    }),
    getMail: tool({
      description:
        "Lee el detalle y cuerpo de un correo por id. Úsala después de listMails cuando necesites el texto completo para resumir o responder.",
      inputSchema: z.object({
        mailId: z.string().min(1).describe("Id interno del correo."),
      }),
      execute: async ({ mailId }) => getMailSnapshot(ctx, mailId),
    }),
    draftMail: tool({
      description:
        "Prepara contexto para redactar un correo (nuevo o respuesta). NO envía el mensaje: solo ayuda a escribir asunto y cuerpo. Pasa intent claro; opcional to, clientName, tone, inReplyToId.",
      inputSchema: z.object({
        intent: z
          .string()
          .trim()
          .min(3)
          .max(500)
          .describe(
            "Qué debe decir el correo (ej. recordar pago, pedir documentos, responder duda).",
          ),
        to: z.string().optional().describe("Destinatario si se conoce."),
        clientName: z
          .string()
          .optional()
          .describe("Nombre o código del cliente para buscar su correo."),
        tone: z
          .string()
          .optional()
          .describe("Tono deseado: formal, amable, breve, etc."),
        inReplyToId: z
          .string()
          .optional()
          .describe("Id del correo al que se responde."),
      }),
      execute: async (input) => draftMailHelp(ctx, input),
    }),
  };
}

export type CrmTools = ReturnType<typeof buildCrmTools>;
