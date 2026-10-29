import type { OrganizationContext } from "@/src/server/auth/guards";
import { DomainError } from "@/src/server/errors";
import { prisma } from "@/src/lib/db";
import {
  isValidSignatureDataUrl,
  normalizeBookingUrl,
  normalizeWhatsapp,
} from "@/src/lib/brand/contact-links";

export type BrandContact = {
  whatsappNumber: string | null;
  bookingUrl: string | null;
  representativeName: string | null;
  representativeSignature: string | null;
};

export async function getBrandContact(organizationId: string): Promise<BrandContact> {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: { whatsappNumber: true, bookingUrl: true, representativeName: true, representativeSignature: true },
  });
  return {
    whatsappNumber: settings?.whatsappNumber ?? null,
    bookingUrl: settings?.bookingUrl ?? null,
    representativeName: settings?.representativeName ?? null,
    representativeSignature: settings?.representativeSignature ?? null,
  };
}

/** Guarda WhatsApp, agenda y firma. Valida y normaliza cada campo. */
export async function updateBrandContact(
  ctx: OrganizationContext,
  data: {
    whatsappNumber?: string | null;
    bookingUrl?: string | null;
    representativeName?: string | null;
    representativeSignature?: string | null;
  },
): Promise<BrandContact> {
  const patch: Partial<BrandContact> = {};
  if (data.whatsappNumber !== undefined) {
    const raw = data.whatsappNumber?.trim() ?? "";
    const digits = normalizeWhatsapp(raw);
    if (raw && !digits) throw new DomainError("El WhatsApp no parece un número válido. Incluye el código de país.");
    patch.whatsappNumber = digits;
  }
  if (data.bookingUrl !== undefined) {
    const raw = data.bookingUrl?.trim() ?? "";
    const url = normalizeBookingUrl(raw);
    if (raw && !url) throw new DomainError("El link de agenda debe ser una dirección https (Calendly, cal.com…).");
    patch.bookingUrl = url;
  }
  if (data.representativeName !== undefined) {
    patch.representativeName = data.representativeName?.trim().slice(0, 120) || null;
  }
  if (data.representativeSignature !== undefined) {
    const sig = data.representativeSignature;
    if (sig != null && !isValidSignatureDataUrl(sig)) {
      throw new DomainError("La firma debe ser una imagen PNG o JPG de menos de 200 KB.");
    }
    patch.representativeSignature = sig ?? null;
  }
  const updated = await prisma.organizationSettings.update({
    where: { organizationId: ctx.organizationId },
    data: patch,
    select: { whatsappNumber: true, bookingUrl: true, representativeName: true, representativeSignature: true },
  });
  return updated;
}
