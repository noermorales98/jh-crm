import { z } from "zod";
import { cuidSchema, emailSchema } from "./common";

export const PORTAL_UPLOAD_CATEGORIES = [
  "IDENTITY",
  "PROOF_OF_ADDRESS",
  "OTHER",
  "PAYMENT_PROOF",
  "CREDIT_REPORT",
] as const;

export const invitePortalAccessSchema = z.object({
  clientId: cuidSchema,
  email: emailSchema,
  temporaryPassword: z
    .string()
    .min(8, "La contraseña temporal debe tener al menos 8 caracteres.")
    .max(128),
});

export const revokePortalAccessSchema = z.object({
  clientId: cuidSchema,
});

export const portalUploadRequestSchema = z.object({
  category: z.enum(PORTAL_UPLOAD_CATEGORIES),
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  caseId: cuidSchema.optional().nullable(),
  sensitivity: z.enum(["INTERNAL", "CONFIDENTIAL"]).optional(),
});

export const portalUploadConfirmSchema = portalUploadRequestSchema.extend({
  storageKey: z.string().min(1),
  displayName: z.string().trim().max(255).optional().nullable(),
  checksumSha256: z.string().trim().max(128).optional().nullable(),
});

export type InvitePortalAccessInput = z.infer<typeof invitePortalAccessSchema>;
