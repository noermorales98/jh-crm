import { z } from "zod";
import { emailSchema } from "./common";

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
    .regex(/^[\d\s()+.-]{7,20}$/, "Teléfono inválido."),
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
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;
