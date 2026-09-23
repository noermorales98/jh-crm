import { z } from "zod";
import { zonedDateAtHour } from "@/src/lib/format/dates";

/** Esquemas Zod compartidos entre Server Actions y Route Handlers. */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Ingresa un correo electrónico válido."));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Ingresa tu contraseña."),
  /** Código TOTP o de recuperación (paso 2 si MFA está activo). */
  mfaCode: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
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

/**
 * @deprecated para fechas de solo día: "YYYY-MM-DD" queda a medianoche UTC
 * (el día anterior en America/Chicago). Usa orgDateInputSchema.
 */
export const optionalDateSchema = z.coerce.date().optional().nullable();

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fecha capturada por el usuario: YYYY-MM-DD se deja string (se convierte a
 * la TZ de la organización con resolveOrgDateInput); instante completo →
 * Date; null / ausente OK.
 */
export const orgDateInputSchema = z
  .union([z.null(), z.string().regex(YMD_RE), z.coerce.date()])
  .optional();

export type OrgDateInput = z.infer<typeof orgDateInputSchema>;

/**
 * YYYY-MM-DD → instante a `hour` en `timezone`; Date se respeta.
 * undefined (sin cambio) y null (borrar) pasan tal cual.
 */
export function resolveOrgDateInput(
  value: OrgDateInput,
  timezone: string,
  hour: number,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return zonedDateAtHour(value, timezone, hour);
  return value;
}

export const cuidSchema = z.string().min(1, "Identificador requerido.");
