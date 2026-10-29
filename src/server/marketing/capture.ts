import { prisma } from "@/src/lib/db";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { appBaseUrl } from "@/src/server/org-share";
import { CAPTURE_MEDIUM } from "@/src/lib/marketing/capture-links";

export type CaptureChannelStat = { source: string; leads: number; clients: number };

export type CaptureOverview = {
  baseUrl: string;
  days: number;
  total: number;
  converted: number;
  byChannel: CaptureChannelStat[];
};

const WINDOW_DAYS = 30;

/** Prospectos que llegaron por /empieza en los últimos 30 días, por canal. */
export async function getCaptureOverview(ctx: OrganizationContext): Promise<CaptureOverview> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.client.findMany({
    where: {
      organizationId: ctx.organizationId,
      createdAt: { gte: since },
      attribution: { path: "$.utm_medium", equals: CAPTURE_MEDIUM },
    },
    select: { status: true, attribution: true },
    take: 2000,
  });

  const map = new Map<string, CaptureChannelStat>();
  let converted = 0;
  for (const row of rows) {
    const attr = (row.attribution ?? {}) as Record<string, unknown>;
    const source = typeof attr.utm_source === "string" && attr.utm_source.trim() ? attr.utm_source.trim() : "";
    const stat = map.get(source) ?? { source, leads: 0, clients: 0 };
    stat.leads += 1;
    if (row.status !== "LEAD" && row.status !== "ARCHIVED") {
      stat.clients += 1;
      converted += 1;
    }
    map.set(source, stat);
  }

  return {
    baseUrl: appBaseUrl(),
    days: WINDOW_DAYS,
    total: rows.length,
    converted,
    byChannel: [...map.values()].sort((a, b) => b.leads - a.leads),
  };
}
