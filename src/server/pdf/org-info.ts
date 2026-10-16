import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import type { PdfOrganizationInfo } from "@/src/lib/pdf/base";
import { fetchLogoForPdf } from "@/src/lib/pdf/logo";

export type PdfOrgBundle = {
  info: PdfOrganizationInfo;
  timezone: string;
};

function addressLineFrom(settings: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}): string | null {
  const line = [
    settings.addressLine1,
    settings.addressLine2,
    [settings.city, settings.state, settings.postalCode].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");
  return line || null;
}

/**
 * Org contact + optional logo for PDF headers (Mi Marca).
 * Soft-fails logo fetch so a bad URL still yields a usable PDF.
 */
export async function loadPdfOrganization(
  organizationId: string,
  opts?: { requireSettings?: boolean },
): Promise<PdfOrgBundle> {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });
  if (!settings) {
    if (opts?.requireSettings) {
      throw new DomainError("Configuración de la organización no encontrada.");
    }
    return {
      info: { legalName: "J&H Multiservices LLC" },
      timezone: "America/Chicago",
    };
  }

  const logo = await fetchLogoForPdf(settings.logoUrl);
  return {
    info: {
      legalName: settings.legalName,
      phone: settings.phone,
      email: settings.email,
      website: settings.website,
      addressLine: addressLineFrom(settings),
      logo,
    },
    timezone: settings.timezone,
  };
}
