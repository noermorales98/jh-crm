import { z } from "zod";
import { emailSchema } from "./common";

/** Separa destinatarios por coma o punto y coma y valida cada correo. */
export function parseAddressList(raw: string): string[] {
  const parts = raw
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const addresses: string[] = [];
  for (const part of parts) {
    const email = emailSchema.parse(part);
    if (seen.has(email)) continue;
    seen.add(email);
    addresses.push(email);
  }
  return addresses;
}

export const mailComposeSchema = z.object({
  to: z.string().trim().min(1, "Indica al menos un destinatario.").max(2000),
  cc: z.string().trim().max(2000).optional().or(z.literal("")),
  subject: z.string().trim().min(1, "El asunto es obligatorio.").max(500),
  body: z
    .string()
    .trim()
    .min(1, "El mensaje no puede estar vacío.")
    .max(50_000),
  clientId: z.string().trim().min(1).optional().or(z.literal("")),
  draftId: z.string().trim().min(1).optional(),
  inReplyToId: z.string().trim().min(1).optional(),
});

export const mailDraftSchema = z.object({
  to: z.string().trim().max(2000).optional().or(z.literal("")),
  cc: z.string().trim().max(2000).optional().or(z.literal("")),
  subject: z.string().trim().max(500).optional().or(z.literal("")),
  body: z.string().max(50_000).optional().or(z.literal("")),
  clientId: z.string().trim().min(1).optional().or(z.literal("")),
  draftId: z.string().trim().min(1).optional(),
});

export type MailComposeInput = z.infer<typeof mailComposeSchema>;
export type MailDraftInput = z.infer<typeof mailDraftSchema>;
