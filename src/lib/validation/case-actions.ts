import { z } from "zod";
import { cuidSchema, orgDateInputSchema } from "./common";

/**
 * Entradas de las acciones de casos (crédito y de servicio). Viven aquí, fuera de los
 * archivos "use server", para que la acción y la herramienta del conector usen el mismo
 * esquema. Las descripciones son las que lee Claude; no cambian el comportamiento.
 */

const moneyField = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Monto inválido (máx. 2 decimales).")
  .nullish();

export const createCaseSchema = z.object({
  clientId: cuidSchema.describe("Id del cliente al que pertenece el caso."),
  stageId: cuidSchema.optional().describe("Id de la etapa inicial. Si se omite, se usa la primera etapa activa."),
  assignedToId: cuidSchema.nullish().describe("Id del miembro responsable del caso, o nulo para dejarlo sin asignar."),
  summary: z.string().trim().max(5000).nullish().describe("Resumen del caso (máximo 5000 caracteres)."),
  nextActionAt: orgDateInputSchema.describe(
    "Fecha de la próxima acción: AAAA-MM-DD (se toma al mediodía en la zona horaria de la organización) o una fecha y hora completa.",
  ),
});

export const updateCaseSchema = z.object({
  assignedToId: cuidSchema.nullish().describe("Id del nuevo responsable, o nulo para quitar la asignación."),
  summary: z.string().trim().max(5000).nullish().describe("Nuevo resumen del caso (máximo 5000 caracteres)."),
});

export const caseAmountsSchema = z.object({
  quotedAmount: moneyField.describe("Monto cotizado como texto con hasta 2 decimales, por ejemplo \"1500.00\". Nulo lo borra; omitirlo lo deja como está."),
  agreedAmount: moneyField.describe("Monto acordado como texto con hasta 2 decimales, por ejemplo \"1200.00\". Nulo lo borra; omitirlo lo deja como está."),
});

export const nextActionSchema = z.object({
  nextActionAt: orgDateInputSchema.describe(
    "Fecha de la próxima acción: AAAA-MM-DD (mediodía en la zona horaria de la organización) o fecha y hora completa. Nulo o ausente la borra.",
  ),
});

export const createServiceCaseSchema = z.object({
  clientId: cuidSchema.describe("Id del cliente al que pertenece el expediente."),
  serviceCode: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Código del servicio: CREDIT_REPAIR, HOME_BUYER, BUSINESS_CREDIT, PERSONAL_LOAN, WEB_DEVELOPMENT o CRM_DEVELOPMENT.",
    ),
  stageId: cuidSchema.optional().describe("Id de la etapa inicial. Si se omite, se usa la primera etapa activa del servicio."),
  assignedToId: cuidSchema.nullish().describe("Id del miembro responsable, o nulo para dejarlo sin asignar."),
  summary: z.string().trim().max(5000).nullish().describe("Resumen del expediente (máximo 5000 caracteres)."),
  nextActionAt: orgDateInputSchema.describe(
    "Fecha de la próxima acción: AAAA-MM-DD (mediodía en la zona horaria de la organización) o fecha y hora completa.",
  ),
});

export const serviceCaseTransitionSchema = z
  .enum(["OPEN", "ON_HOLD", "COMPLETED", "CANCELED"])
  .describe("Estado destino: OPEN (abierto), ON_HOLD (en pausa), COMPLETED (completado) o CANCELED (cancelado).");
