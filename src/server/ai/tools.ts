import { z } from "zod";
import { tool } from "@ai-sdk/provider-utils";
import type { OrganizationContext } from "@/src/server/auth/guards";
import {
  getCaseBrief,
  getCatalogSnapshot,
  getClientBrief,
  getCompanySnapshot,
  getDashboardSnapshot,
  getRoutesAndHowTo,
  listCrm,
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
        "Solo conteos y pendientes del tablero. activeClients cuenta únicamente clientes ACTIVE (no prospectos LEAD). NO sirve para listar nombres: usa listCrm.",
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
            "Tema: cliente, caso, ronda, tarea, cotización, pago, recibo, documento, usuario, etapa, configuración.",
          ),
      }),
      execute: async ({ topic }) => getRoutesAndHowTo(topic),
    }),
  };
}

export type CrmTools = ReturnType<typeof buildCrmTools>;
