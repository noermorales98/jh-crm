import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { safeEqual } from "@/src/lib/security/tokens";
import { digestDedupeKey, isDigestHour } from "@/src/lib/digest-hour";
import { createNotification } from "@/src/server/notifications";
import { getDashboardSummary } from "@/src/server/dashboard";

/**
 * GET /api/cron/digest — cron cada hora.
 * Solo envía si digestEnabled y la hora local de la org coincide con digestHour.
 */

function formatDigest(summary: Awaited<ReturnType<typeof getDashboardSummary>>) {
  const w = summary.widgets;
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: summary.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(summary.generatedAt);
  return [
    `Resumen ${day}`,
    "",
    `Clientes activos: ${w.activeClients.count}`,
    `Casos abiertos: ${w.openCases.count}`,
    `Tareas de hoy: ${w.tasksToday.count}`,
    `Tareas vencidas: ${w.overdueTasks.count}`,
    `Pagos pendientes: ${w.pendingPayments.count} (USD ${w.pendingPayments.totalAmount})`,
    `Revisiones próximas: ${w.upcomingReviews.count}`,
  ].join("\n");
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !safeEqual(token, secret)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const now = new Date();
  const orgs = await prisma.organizationSettings.findMany({
    select: {
      organizationId: true,
      timezone: true,
      digestEnabled: true,
      digestHour: true,
    },
  });

  let sent = 0;
  const errors: string[] = [];

  for (const org of orgs) {
    if (!org.digestEnabled) continue;
    if (!isDigestHour(now, org.timezone, org.digestHour)) continue;

    const recipients = await prisma.organizationMember.findMany({
      where: {
        organizationId: org.organizationId,
        role: { in: ["OWNER", "ADMIN"] },
        user: { isActive: true },
      },
      select: { userId: true, role: true },
    });
    if (recipients.length === 0) continue;

    const summary = await getDashboardSummary({
      organizationId: org.organizationId,
      userId: recipients[0].userId,
      role: recipients[0].role as Role,
    });
    const body = formatDigest(summary);

    for (const member of recipients) {
      try {
        await createNotification({
          organizationId: org.organizationId,
          userId: member.userId,
          type: "DAILY_DIGEST",
          title: "Resumen diario del CRM",
          body,
          link: "/crm/dashboard",
          dedupeKey: digestDedupeKey(
            org.organizationId,
            member.userId,
            now,
            org.timezone,
          ),
        });
        sent += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "error");
      }
    }
  }

  return NextResponse.json({ ok: true, sent, errors });
}
