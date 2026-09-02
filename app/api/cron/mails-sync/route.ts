import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { safeEqual } from "@/src/lib/security/tokens";
import { imapHostForSmtp } from "@/src/server/mails/imap";
import { syncInboundForOrganization } from "@/src/server/mails";
import { isSmtpConfigured } from "@/src/server/notifications/smtp";

/**
 * GET /api/cron/mails-sync — pensado para cron-job.org cada minuto.
 * Sincroniza IMAP de cada org con SMTP propio (no transaccional).
 * Los correos nuevos disparan notificación in-app + WhatsApp.
 */
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !safeEqual(token, secret)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const orgs = await prisma.organizationSettings.findMany({
    select: {
      organizationId: true,
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpPasswordEncrypted: true,
      smtpFrom: true,
      smtpSecure: true,
      email: true,
    },
  });

  let fetched = 0;
  let created = 0;
  let synced = 0;
  const errors: string[] = [];

  for (const org of orgs) {
    if (!isSmtpConfigured(org) || !org.smtpUser || !org.smtpHost) continue;
    if (!imapHostForSmtp(org.smtpHost)) continue;
    try {
      const result = await syncInboundForOrganization(org.organizationId);
      fetched += result.fetched;
      created += result.created;
      synced += 1;
    } catch (error) {
      errors.push(
        `${org.organizationId}: ${error instanceof Error ? error.message : "error"}`,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    data: { synced, fetched, created, errors },
  });
}
