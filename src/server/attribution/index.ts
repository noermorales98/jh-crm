import type { ClientStatus, LeadChannel } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { LEAD_CHANNEL_LABELS, labelFor } from "@/src/lib/labels";

export type ChannelCount = {
  channel: LeadChannel | "UNKNOWN";
  label: string;
  count: number;
};

export type CampaignCount = {
  campaign: string;
  count: number;
};

export type ConversionByChannel = {
  channel: LeadChannel | "UNKNOWN";
  label: string;
  leads: number;
  active: number;
};

function campaignFromAttribution(attribution: unknown): string | null {
  if (!attribution || typeof attribution !== "object" || Array.isArray(attribution)) {
    return null;
  }
  const raw = (attribution as Record<string, unknown>).utm_campaign;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length ? t : null;
}

function channelLabel(channel: LeadChannel | "UNKNOWN"): string {
  return channel === "UNKNOWN"
    ? "Sin canal"
    : labelFor(LEAD_CHANNEL_LABELS, channel);
}

/**
 * Agregados en memoria (evita groupBy frágil con clientes Prisma stale
 * tras migraciones que añaden columnas como leadChannel).
 */
async function loadClientsForAttribution(ctx: OrganizationContext) {
  return prisma.client.findMany({
    where: {
      organizationId: ctx.organizationId,
      archivedAt: null,
    },
    select: {
      leadChannel: true,
      status: true,
      attribution: true,
    },
    take: 8000,
  });
}

/** Conteos de clientes por canal de lead. */
export async function leadsByChannel(
  ctx: OrganizationContext,
): Promise<ChannelCount[]> {
  const clients = await loadClientsForAttribution(ctx);
  const map = new Map<LeadChannel | "UNKNOWN", number>();

  for (const c of clients) {
    const channel = (c.leadChannel ?? "UNKNOWN") as LeadChannel | "UNKNOWN";
    map.set(channel, (map.get(channel) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([channel, count]) => ({
      channel,
      label: channelLabel(channel),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Top campañas desde Client.attribution.utm_campaign. */
export async function leadsByCampaign(
  ctx: OrganizationContext,
  limit = 20,
): Promise<CampaignCount[]> {
  const clients = await loadClientsForAttribution(ctx);
  const map = new Map<string, number>();

  for (const c of clients) {
    const campaign = campaignFromAttribution(c.attribution);
    if (!campaign) continue;
    map.set(campaign, (map.get(campaign) ?? 0) + 1);
  }

  return [...map.entries()]
    .map(([campaign, count]) => ({ campaign, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Conversión simple: LEAD vs ACTIVE por canal
 * (otros estados se ignoran en el ratio).
 */
export async function conversionByChannel(
  ctx: OrganizationContext,
): Promise<ConversionByChannel[]> {
  const clients = await loadClientsForAttribution(ctx);
  const map = new Map<
    LeadChannel | "UNKNOWN",
    { leads: number; active: number }
  >();

  for (const c of clients) {
    const status = c.status as ClientStatus;
    if (status !== "LEAD" && status !== "ACTIVE") continue;
    const channel = (c.leadChannel ?? "UNKNOWN") as LeadChannel | "UNKNOWN";
    const entry = map.get(channel) ?? { leads: 0, active: 0 };
    if (status === "LEAD") entry.leads += 1;
    if (status === "ACTIVE") entry.active += 1;
    map.set(channel, entry);
  }

  return [...map.entries()]
    .map(([channel, counts]) => ({
      channel,
      label: channelLabel(channel),
      ...counts,
    }))
    .sort((a, b) => b.leads + b.active - (a.leads + a.active));
}

export async function getAttributionDashboard(ctx: OrganizationContext) {
  // Una sola lectura; reutilizada por los tres agregados.
  const clients = await loadClientsForAttribution(ctx);

  const byChannelMap = new Map<LeadChannel | "UNKNOWN", number>();
  const campaignMap = new Map<string, number>();
  const conversionMap = new Map<
    LeadChannel | "UNKNOWN",
    { leads: number; active: number }
  >();

  for (const c of clients) {
    const channel = (c.leadChannel ?? "UNKNOWN") as LeadChannel | "UNKNOWN";
    byChannelMap.set(channel, (byChannelMap.get(channel) ?? 0) + 1);

    const campaign = campaignFromAttribution(c.attribution);
    if (campaign) {
      campaignMap.set(campaign, (campaignMap.get(campaign) ?? 0) + 1);
    }

    if (c.status === "LEAD" || c.status === "ACTIVE") {
      const entry = conversionMap.get(channel) ?? { leads: 0, active: 0 };
      if (c.status === "LEAD") entry.leads += 1;
      if (c.status === "ACTIVE") entry.active += 1;
      conversionMap.set(channel, entry);
    }
  }

  const byChannel: ChannelCount[] = [...byChannelMap.entries()]
    .map(([channel, count]) => ({
      channel,
      label: channelLabel(channel),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const byCampaign: CampaignCount[] = [...campaignMap.entries()]
    .map(([campaign, count]) => ({ campaign, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const conversion: ConversionByChannel[] = [...conversionMap.entries()]
    .map(([channel, counts]) => ({
      channel,
      label: channelLabel(channel),
      ...counts,
    }))
    .sort((a, b) => b.leads + b.active - (a.leads + a.active));

  return { byChannel, byCampaign, conversion };
}
