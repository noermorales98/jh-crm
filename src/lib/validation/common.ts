import { z } from "zod";

/** Esquemas Zod compartidos entre Server Actions y Route Handlers. */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Ingresa un correo electrónico válido."));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Ingresa tu contraseña."),
});

export const usPhoneSchema = z
  .string()
  .trim()
  .regex(/^[\d\s()+.-]{7,20}$/, "Teléfono inválido.")
  .optional()
  .or(z.literal(""));

export const usStateSchema = z
  .string()
  .trim()
  .length(2, "Usa la abreviatura de 2 letras (ej. TX).")
  .toUpperCase()
  .optional()
  .or(z.literal(""));

export const postalCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{5}(-\d{4})?$/, "Código postal inválido.")
  .optional()
  .or(z.literal(""));

/** Dinero: acepta string o number; los servicios convierten a Decimal. */
export const moneySchema = z
  .union([z.string(), z.number()])
  .refine((v) => Number.isFinite(Number(v)), "Monto inválido.");

export const optionalDateSchema = z.coerce.date().optional().nullable();

export const cuidSchema = z.string().min(1, "Identificador requerido.");
