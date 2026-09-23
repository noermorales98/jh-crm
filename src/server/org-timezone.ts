import { cache } from "react";
import { prisma } from "@/src/lib/db";
import { DEFAULT_TIMEZONE } from "@/src/lib/format/dates";

/**
 * Zona horaria operativa de la organización (OrganizationSettings).
 * cache() evita repetir la consulta dentro de la misma petición RSC/action.
 */
export const getOrganizationTimezone = cache(
  async (organizationId: string): Promise<string> => {
    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { timezone: true },
    });
    return settings?.timezone ?? DEFAULT_TIMEZONE;
  },
);
