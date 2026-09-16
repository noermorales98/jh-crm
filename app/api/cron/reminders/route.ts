import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { safeEqual } from "@/src/lib/security/tokens";
import { createNotification } from "@/src/server/notifications";

/**
 * GET /api/cron/reminders — cron-job.org cada 15 minutos.
 *
 * Protección: Authorization: Bearer <CRON_SECRET> (comparación timing-safe).
 * Idempotente: cada Notification lleva dedupeKey único (upsert), por lo que
 * ejecutar el endpoint varias veces no duplica notificaciones.
 *
 * Revisa:
 *   - tareas con reminderAt <= now            → task:<id>:due
 *   - tareas vencidas (dueAt < now)           → task:<id>:overdue
 *   - CreditCase.nextReviewAt hoy/vencida     → case:<id>:review:<YYYY-MM-DD>
 *   - CreditRound.expectedReviewAt hoy/vencida → round:<id>:review:<YYYY-MM-DD>
 *   - pagos PENDING con dueAt <= hoy          → payment:<id>:due
 *   - cuotas PENDING vencidas                 → status OVERDUE
 *   - intake activos sin uso >48 h            → tarea FOLLOW_UP
 *   - casos DOCUMENTS_PENDING                 → tarea REQUEST_DOCUMENT
 */

function ymd(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Destinatarios: el asignado, o OWNER/ADMINs activos de la org si no hay. */
async function resolveRecipients(
  organizationId: string,
  assignedToId: string | null | undefined,
): Promise<string[]> {
  if (assignedToId) return [assignedToId];
  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      role: { in: ["OWNER", "ADMIN"] },
      user: { isActive: true },
    },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !safeEqual(token, secret)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const now = new Date();
  const endOfTodayUtc = new Date(now);
  endOfTodayUtc.setUTCHours(23, 59, 59, 999);

  const timezoneByOrg = new Map<string, string>();
  const settings = await prisma.organizationSettings.findMany({
    select: { organizationId: true, timezone: true },
  });
  for (const s of settings) timezoneByOrg.set(s.organizationId, s.timezone);
  const tzOf = (orgId: string) => timezoneByOrg.get(orgId) ?? "America/Chicago";

  let created = 0;
  const errors: string[] = [];
  const notify = async (input: Parameters<typeof createNotification>[0]) => {
    try {
      await createNotification(input);
      created += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "error desconocido");
    }
  };

  // 1. Tareas con recordatorio programado
  const tasksWithReminder = await prisma.task.findMany({
    where: {
      reminderAt: { lte: now },
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    select: { id: true, organizationId: true, title: true, assignedToId: true, clientId: true, caseId: true },
  });
  for (const task of tasksWithReminder) {
    for (const userId of await resolveRecipients(task.organizationId, task.assignedToId)) {
      await notify({
        organizationId: task.organizationId,
        userId,
        type: "TASK_DUE",
        title: "Recordatorio de tarea",
        body: task.title,
        link: "/crm/tareas",
        dedupeKey: `task:${task.id}:due`,
      });
    }
  }

  // 2. Tareas vencidas
  const overdueTasks = await prisma.task.findMany({
    where: {
      dueAt: { lt: now },
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
    select: { id: true, organizationId: true, title: true, assignedToId: true, dueAt: true },
  });
  for (const task of overdueTasks) {
    for (const userId of await resolveRecipients(task.organizationId, task.assignedToId)) {
      await notify({
        organizationId: task.organizationId,
        userId,
        type: "TASK_OVERDUE",
        title: "Tarea vencida",
        body: task.title,
        link: "/crm/tareas?due=overdue",
        dedupeKey: `task:${task.id}:overdue`,
      });
    }
  }

  // 3. Casos con próxima revisión hoy o vencida
  const casesToReview = await prisma.creditCase.findMany({
    where: { state: "OPEN", nextReviewAt: { lte: endOfTodayUtc } },
    select: {
      id: true, organizationId: true, caseCode: true, nextReviewAt: true, assignedToId: true,
    },
  });
  for (const creditCase of casesToReview) {
    const day = ymd(creditCase.nextReviewAt ?? now, tzOf(creditCase.organizationId));
    for (const userId of await resolveRecipients(creditCase.organizationId, creditCase.assignedToId)) {
      await notify({
        organizationId: creditCase.organizationId,
        userId,
        type: "CASE_REVIEW_DUE",
        title: "Revisión de caso pendiente",
        body: `El caso ${creditCase.caseCode} requiere revisión.`,
        link: `/crm/casos/${creditCase.id}`,
        dedupeKey: `case:${creditCase.id}:review:${day}`,
      });
    }
  }

  // 4. Rondas con revisión esperada hoy o vencida
  const roundsToReview = await prisma.creditRound.findMany({
    where: {
      status: { in: ["SENT", "WAITING_UPDATE"] },
      expectedReviewAt: { lte: endOfTodayUtc },
    },
    select: {
      id: true, organizationId: true, roundNumber: true, expectedReviewAt: true,
      case: { select: { id: true, caseCode: true, assignedToId: true } },
    },
  });
  for (const round of roundsToReview) {
    const day = ymd(round.expectedReviewAt ?? now, tzOf(round.organizationId));
    for (const userId of await resolveRecipients(round.organizationId, round.case.assignedToId)) {
      await notify({
        organizationId: round.organizationId,
        userId,
        type: "ROUND_REVIEW_DUE",
        title: "Revisión de ronda pendiente",
        body: `La ronda ${round.roundNumber} del caso ${round.case.caseCode} espera actualización.`,
        link: `/crm/casos/${round.case.id}/rondas`,
        dedupeKey: `round:${round.id}:review:${day}`,
      });
    }
  }

  // 5. Pagos pendientes con vencimiento hoy o vencido
  const duePayments = await prisma.payment.findMany({
    where: { status: "PENDING", dueAt: { lte: endOfTodayUtc } },
    select: {
      id: true, organizationId: true, amount: true, currency: true, createdById: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });
  for (const payment of duePayments) {
    for (const userId of await resolveRecipients(payment.organizationId, payment.createdById)) {
      await notify({
        organizationId: payment.organizationId,
        userId,
        type: "PAYMENT_DUE",
        title: "Pago pendiente por cobrar",
        body: `Pago de ${payment.amount.toString()} ${payment.currency} de ${payment.client.firstName} ${payment.client.lastName ?? ""}`.trim(),
        link: "/crm/pagos?status=PENDING",
        dedupeKey: `payment:${payment.id}:due`,
      });
    }
  }

  // 6. Cuotas de plan vencidas → OVERDUE
  let overdueInstallments = 0;
  try {
    const { markOverdueInstallments } = await import("@/src/server/payment-plans");
    overdueInstallments = await markOverdueInstallments(now);
  } catch (error) {
    errors.push(
      error instanceof Error
        ? `overdueInstallments: ${error.message}`
        : "overdueInstallments: error",
    );
  }

  // 7. Intake sin completar (>48 h) → tareas FOLLOW_UP
  let intakeFollowUps = { scanned: 0, created: 0 };
  try {
    const { scanIncompleteIntakeFollowUps } = await import("@/src/server/automations");
    intakeFollowUps = await scanIncompleteIntakeFollowUps(now);
  } catch (error) {
    errors.push(
      error instanceof Error
        ? `intakeFollowUps: ${error.message}`
        : "intakeFollowUps: error",
    );
  }

  // 8. Casos DOCUMENTS_PENDING sin tarea REQUEST_DOCUMENT
  let docsPending = { scanned: 0, created: 0 };
  try {
    const { ensureDocsPendingTask } = await import("@/src/server/automations");
    docsPending = await ensureDocsPendingTask();
  } catch (error) {
    errors.push(
      error instanceof Error
        ? `docsPending: ${error.message}`
        : "docsPending: error",
    );
  }

  // 9. Correos automáticos al cliente (AU-001)
  let clientEmails = { scanned: 0, sent: 0, skipped: 0 };
  try {
    const { sendClientEmailsAllOrgs } = await import(
      "@/src/server/notifications/client-emails"
    );
    clientEmails = await sendClientEmailsAllOrgs(now);
  } catch (error) {
    errors.push(
      error instanceof Error
        ? `clientEmails: ${error.message}`
        : "clientEmails: error",
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      scanned: {
        tasksWithReminder: tasksWithReminder.length,
        overdueTasks: overdueTasks.length,
        casesToReview: casesToReview.length,
        roundsToReview: roundsToReview.length,
        duePayments: duePayments.length,
        overdueInstallments,
        intakeFollowUps,
        docsPending,
        clientEmails,
      },
      notificationsWritten: created,
      errors,
    },
  });
}
