import { z } from "zod";
import { cuidSchema } from "@/src/lib/validation/common";
import { createQuoteSchema, updateQuoteSchema } from "@/src/lib/validation/quotes-actions";
import * as quoteService from "@/src/server/quotes";
import { defineTool, type Tool } from "./types";

/**
 * Herramientas de escritura de cotizaciones (espejo de src/actions/quotes.ts).
 * Los importes los calcula el servicio; aquí solo se pasan las entradas tal cual.
 */

const cotizacionId = cuidSchema.describe("Identificador de la cotización.");

const quoteHref = (id: string) => `/crm/cotizaciones/${id}`;
const quoteRoutes = (id: string) => ["/crm/cotizaciones", "/crm/dashboard", quoteHref(id)];
const resultId = (result: unknown) => (result as { id: string }).id;
const auditQuote = (_input: unknown, result: unknown) => ({ entityType: "Quote", entityId: resultId(result) });

const createInput = createQuoteSchema.extend({
  clientId: cuidSchema.describe("Identificador del cliente al que se le cotiza."),
  caseId: cuidSchema.nullish().describe("Caso del cliente al que se enlaza la cotización (opcional)."),
  items: createQuoteSchema.shape.items.describe(
    "Ítems de la cotización: kind service/package/manual, cantidad y, si aplica, precio y descuento. El CRM calcula los importes.",
  ),
  validUntil: createQuoteSchema.shape.validUntil.describe("Fecha hasta la que vale la cotización (opcional)."),
  notes: createQuoteSchema.shape.notes.describe("Notas visibles en la cotización (opcional)."),
  terms: createQuoteSchema.shape.terms.describe("Términos y condiciones (opcional)."),
  taxRate: createQuoteSchema.shape.taxRate.describe("Porcentaje de impuesto, de 0 a 100 (opcional)."),
});

const updateInput = updateQuoteSchema.extend({ cotizacionId });

const idOnly = z.object({ cotizacionId });

function transitionTool(
  name: string,
  title: string,
  description: string,
  run: (ctx: Parameters<typeof quoteService.markQuoteSent>[0], id: string) => Promise<{ id: string; folio: string; status: string }>,
  kind: "write" | "destructive" = "write",
): Tool {
  return defineTool({
    name,
    title,
    description,
    kind,
    permission: "quotes.manage",
    inputSchema: idOnly,
    async run(ctx, input) {
      const quote = await run(ctx, input.cotizacionId);
      return { id: quote.id, folio: quote.folio, status: quote.status, href: quoteHref(quote.id) };
    },
    audit: auditQuote,
    revalidate: (result) => quoteRoutes(resultId(result)),
  });
}

export const quotesTools: Tool[] = [
  defineTool({
    name: "crear_cotizacion",
    title: "Crear cotización",
    description:
      "Crea una cotización en borrador para un cliente con uno o más ítems (servicio, paquete o manual). Úsala cuando la persona pida cotizar o presupuestar algo; el CRM calcula subtotal, impuesto y total, no los calcules tú.",
    kind: "write",
    permission: "quotes.manage",
    inputSchema: createInput,
    async run(ctx, input) {
      const quote = await quoteService.createQuote(ctx, input);
      return { id: quote.id, folio: quote.folio, total: quote.total.toString(), href: quoteHref(quote.id) };
    },
    audit: auditQuote,
    revalidate: (result) => quoteRoutes(resultId(result)),
  }),
  defineTool({
    name: "editar_cotizacion",
    title: "Editar cotización",
    description:
      "Cambia ítems, vigencia, notas, términos o impuesto de una cotización que sigue en borrador. Úsala para corregir una cotización antes de enviarla; si cambias los ítems, envía la lista completa. El CRM recalcula el total.",
    kind: "write",
    permission: "quotes.manage",
    inputSchema: updateInput,
    async run(ctx, input) {
      const { cotizacionId: id, ...data } = input;
      const quote = await quoteService.updateQuote(ctx, id, data);
      return { id: quote.id, total: quote.total.toString(), href: quoteHref(quote.id) };
    },
    audit: auditQuote,
    revalidate: (result) => quoteRoutes(resultId(result)),
  }),
  transitionTool(
    "marcar_cotizacion_enviada",
    "Marcar cotización como enviada",
    "Pasa una cotización en borrador a enviada y avisa al cliente por los canales que la organización tenga activos. Úsala cuando la persona confirme que la cotización ya se mandó al cliente.",
    quoteService.markQuoteSent,
  ),
  transitionTool(
    "marcar_cotizacion_aceptada",
    "Marcar cotización como aceptada",
    "Marca como aceptada una cotización en borrador o enviada. Úsala cuando el cliente haya dicho que sí a la cotización.",
    quoteService.markQuoteAccepted,
  ),
  transitionTool(
    "marcar_cotizacion_rechazada",
    "Marcar cotización como rechazada",
    "Marca como rechazada una cotización enviada. Úsala cuando el cliente haya dicho que no a la cotización.",
    quoteService.markQuoteRejected,
  ),
  transitionTool(
    "cancelar_cotizacion",
    "Cancelar cotización",
    "Cancela una cotización que no esté pagada ni cancelada. Es una cancelación lógica y reversible en la práctica: la cotización queda en el historial con estado cancelada, no se borra. Pide confirmación a la persona antes de usarla.",
    quoteService.cancelQuote,
    "destructive",
  ),
];
