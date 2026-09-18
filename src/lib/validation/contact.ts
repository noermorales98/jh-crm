import { z } from "zod";
import { emailSchema } from "./common";

const optionalAttr = z.string().trim().max(500).optional().or(z.literal(""));

/** Formulario público de contacto en `/`. */
export const contactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre es obligatorio.")
    .max(120, "El nombre es demasiado largo."),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s()+.-]{8,22}$/, "Teléfono inválido."),
  message: z
    .string()
    .trim()
    .min(10, "Cuéntanos un poco más (mínimo 10 caracteres).")
    .max(2000, "El mensaje es demasiado largo."),
  challengeToken: z.string().trim().min(1, "Recarga la página e inténtalo de nuevo."),
  challengeAnswer: z
    .string()
    .trim()
    .min(1, "Confirma el envío para continuar."),
  /** Honeypot: los bots suelen rellenarlo; los humanos no lo ven. */
  website: z.string().max(200).optional().or(z.literal("")),
  /** Obligatorio: aceptación de política de privacidad. */
  privacyAccepted: z.boolean().refine((v) => v === true, {
    message: "Debes aceptar la política de privacidad para continuar.",
  }),
  /** Opcional e independiente: consentimiento SMS. */
  smsConsent: z.boolean().optional().default(false),
  serviceRequested: z.string().trim().max(150).optional().or(z.literal("")),
  state: z.string().trim().max(2).optional().or(z.literal("")),
  preferredContactMethod: z.string().trim().max(50).optional().or(z.literal("")),
  preferredContactTime: z.string().trim().max(100).optional().or(z.literal("")),
  utm_source: optionalAttr,
  utm_medium: optionalAttr,
  utm_campaign: optionalAttr,
  utm_content: optionalAttr,
  utm_term: optionalAttr,
  fbclid: optionalAttr,
  gclid: optionalAttr,
  landingPage: optionalAttr,
  referrer: optionalAttr,
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;
