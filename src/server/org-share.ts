import { prisma } from "@/src/lib/db";
import type { OrganizationContext } from "@/src/server/auth/guards";

function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const looksLocal =
    !configured ||
    /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(configured);

  if (looksLocal) {
    const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    if (productionHost) {
      return `https://${productionHost.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
    }
    const deploymentHost = process.env.VERCEL_URL?.trim();
    if (deploymentHost) {
      return `https://${deploymentHost.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
    }
  }

  return (configured || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * URL pública para “Comparte tu enlace”:
 * 1) IntakeLink usable más reciente de la org
 * 2) website de OrganizationSettings
 * 3) null (UI muestra empty honesto)
 */
export async function getOrganizationShareUrl(
  ctx: OrganizationContext,
): Promise<string | null> {
  const now = new Date();
  const link = await prisma.intakeLink.findFirst({
    where: {
      organizationId: ctx.organizationId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
    select: { token: true, maxUses: true, useCount: true },
  });

  if (link && link.useCount < link.maxUses) {
    return `${appBaseUrl()}/intake/${link.token}`;
  }

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: ctx.organizationId },
    select: { website: true },
  });

  const website = settings?.website?.trim();
  if (website) {
    return website.startsWith("http") ? website : `https://${website}`;
  }

  return null;
}
