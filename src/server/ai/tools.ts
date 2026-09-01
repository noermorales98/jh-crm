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
    getDashboard: tool({
      description:
        "Resumen operativo actual: conteos de clientes, casos, tareas vencidas, cotizaciones pendientes y pagos. Incluye enlaces a cada lista.",
      inputSchema: z.object({
        reason: z.string().optional().describe("Por qué se pide el dashboard."),
      }),
      execute: async () => getDashboardSnapshot(ctx),
    }),
    searchCrm: tool({
      description:
        "Busca a la vez en clientes, casos, cotizaciones, pagos, tareas, rondas y recibos de la organización. Usa nombres, códigos (CL-0001, CASE-0001), folios, correo o teléfono.",
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
