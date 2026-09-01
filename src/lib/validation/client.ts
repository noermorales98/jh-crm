import { z } from "zod";
import { emailSchema, usPhoneSchema, usStateSchema, postalCodeSchema } from "./common";

/** Cliente: datos NO sensibles. El SSN vive en ClientSensitiveProfile. */
export const clientCreateSchema = z.object({
  firstName: z.string().trim().min(1, "El nombre es obligatorio.").max(100),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  email: emailSchema.optional().or(z.literal("")),
  phone: usPhoneSchema,
  addressLine1: z.string().trim().max(200).optional().or(z.literal("")),
  addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  state: usStateSchema,
  postalCode: postalCodeSchema,
  source: z.string().trim().max(100).optional().or(z.literal("")),
});

export const clientUpdateSchema = clientCreateSchema.partial();

/** Datos sensibles: solo SPECIALIST/ADMIN/OWNER (ver permissions.ts). */
export const sensitiveProfileSchema = z.object({
  ssn: z
    .string()
    .regex(/^\d{3}-?\d{2}-?\d{4}$/, "SSN inválido (formato 123-45-6789).")
    .optional()
    .or(z.literal("")),
  dateOfBirth: z.coerce.date().optional(),
  driversLicenseNumber: z.string().trim().max(50).optional().or(z.literal("")),
  sensitiveNotes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
