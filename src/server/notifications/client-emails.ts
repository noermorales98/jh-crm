/**
 * AU-001 — Correos automáticos al cliente (texto plano).
 * Toggles en OrganizationSettings; dedupe vía Notification al OWNER.
 */
import { prisma } from "@/src/lib/db";
import { createNotification } from "@/src/server/notifications";
import { isSmtpConfigured, sendSmtpMail } from "@/src/server/notifications/smtp";

function ymd(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function clientGreeting(firstName: string | null | undefined, legalName: string) {
  const name = firstName?.trim() || "hola";
  return `Hola ${name},\n\nTe escribimos de ${legalName}.\n\n`;
}

function clientFooter(legalName: string, phone: string | null | undefined) {
  return `\n\n${legalName}${phone ? `\n${phone}` : ""}`;
}

async function firstOwnerUserId(organizationId: string): Promise<string | null> {
  const owner = await prisma.organizationMember.findFirst({
    where: { organizationId, role: "OWNER", user: { isActive: true } },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  return owner?.userId ?? null;
}

async function claimAndSend(params: {
  organizationId: string;
  ownerUserId: string;
  dedupeKey: string;
  smtp: {
    smtpHost: string | null;
    smtpPort: number | null;
    smtpUser: string | null;
    smtpPasswordEncrypted: string | null;
    smtpFrom: string | null;
    smtpSecure: boolean;
  };
  to: string;
  subject: string;
  text: string;
  title: string;
}): Promise<"sent" | "skipped"> {
  const existing = await prisma.notification.findUnique({
    where: { dedupeKey: params.dedupeKey },
  });
  if (existing) return "skipped";

  await sendSmtpMail(params.smtp, {
    to: params.to,
    subject: params.subject,
    text: params.text,
  });

  await createNotification({
    organizationId: params.organizationId,
    userId: params.ownerUserId,
    type: "SYSTEM",
    title: params.title,
    body: `Destinatario: ${params.to}`,
    dedupeKey: params.dedupeKey,
    skipWhatsapp: true,
    skipEmail: true,
  });

  return "sent";
}

/** Disparo inmediato al marcar cotización enviada (mismo dedupe que el cron). */
export async function notifyClientQuoteSent(
  organizationId: string,
  quoteId: string,
): Promise<"sent" | "skipped"> {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });
  if (!settings?.emailClientQuoteSent || !isSmtpConfigured(settings)) {
    return "skipped";
  }

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, organizationId, status: "SENT" },
    include: {
      client: { select: { id: true, firstName: true, email: true } },
    },
  });
  if (!quote?.client.email?.trim()) return "skipped";

  const ownerUserId = await firstOwnerUserId(organizationId);
  if (!ownerUserId) return "skipped";

  const legalName = settings.legalName || "J&H Multiservices LLC";
  const body =
    clientGreeting(quote.client.firstName, legalName) +
    `Te enviamos la cotización ${quote.folio}` +
    (quote.total != null ? ` por ${quote.total.toString()} ${quote.currency}.` : ".") +
    `\n\nSi tienes dudas, responde a este correo o llámanos.` +
    clientFooter(legalName, settings.phone);

  return claimAndSend({
    organizationId,
    ownerUserId,
    dedupeKey: `email:client:${quote.clientId}:quote:${quote.id}:sent`,
    smtp: settings,
    to: quote.client.email.trim(),
    subject: `Cotización ${quote.folio} — ${legalName}`,
    text: body,
    title: `Correo enviado: cotización ${quote.folio}`,
  });
}

export async function sendClientEmailsForOrg(
  organizationId: string,
  now: Date,
): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;
  const bump = (result: "sent" | "skipped") => {
    if (result === "sent") sent += 1;
    else skipped += 1;
  };

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });
  if (!settings || !isSmtpConfigured(settings)) {
    return { sent: 0, skipped: 0 };
  }

  const ownerUserId = await firstOwnerUserId(organizationId);
  if (!ownerUserId) return { sent: 0, skipped: 0 };

  const legalName = settings.legalName || "J&H Multiservices LLC";
  const day = ymd(now, settings.timezone || "America/Chicago");
  const endOfToday = new Date(now);
  endOfToday.setUTCHours(23, 59, 59, 999);

  const send = async (args: {
    clientId: string;
    email: string;
    firstName: string | null;
    dedupeKey: string;
    subject: string;
    cuerpo: string;
    title: string;
  }) => {
    const text =
      clientGreeting(args.firstName, legalName) +
      args.cuerpo +
      clientFooter(legalName, settings.phone);
    bump(
      await claimAndSend({
        organizationId,
        ownerUserId,
        dedupeKey: args.dedupeKey,
        smtp: settings,
        to: args.email,
        subject: args.subject,
        text,
        title: args.title,
      }),
    );
  };

  if (settings.emailClientPaymentDue) {
    const payments = await prisma.payment.findMany({
      where: {
        organizationId,
        status: "PENDING",
        dueAt: { lte: endOfToday },
        client: { email: { not: null }, archivedAt: null },
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        dueAt: true,
        clientId: true,
        client: { select: { firstName: true, email: true } },
      },
      take: 100,
    });
    for (const payment of payments) {
      const email = payment.client.email?.trim();
      if (!email) {
        skipped += 1;
        continue;
      }
      await send({
        clientId: payment.clientId,
        email,
        firstName: payment.client.firstName,
        dedupeKey: `email:client:${payment.clientId}:payment:${payment.id}:due`,
        subject: `Recordatorio de pago — ${legalName}`,
        cuerpo: `Tienes un pago pendiente de ${payment.amount.toString()} ${payment.currency}${
          payment.dueAt ? ` con vencimiento el ${payment.dueAt.toISOString().slice(0, 10)}` : ""
        }.`,
        title: `Correo enviado: pago pendiente`,
      });
    }
  }

  if (settings.emailClientDocsPending) {
    const cases = await prisma.creditCase.findMany({
      where: {
        organizationId,
        state: "OPEN",
        stage: { key: "DOCUMENTS_PENDING" },
        serviceCase: { archivedAt: null, status: "OPEN" },
        client: { email: { not: null }, archivedAt: null },
      },
      select: {
        id: true,
        caseCode: true,
        clientId: true,
        client: { select: { firstName: true, email: true } },
      },
      take: 100,
    });
    for (const creditCase of cases) {
      const email = creditCase.client.email?.trim();
      if (!email) {
        skipped += 1;
        continue;
      }
      await send({
        clientId: creditCase.clientId,
        email,
        firstName: creditCase.client.firstName,
        dedupeKey: `email:client:${creditCase.clientId}:case:${creditCase.id}:docs:${day}`,
        subject: `Documentos pendientes — ${legalName}`,
        cuerpo: `Tu expediente ${creditCase.caseCode} necesita documentos para continuar. Súbelos por el portal o responde a este correo.`,
        title: `Correo enviado: documentos pendientes ${creditCase.caseCode}`,
      });
    }

    const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const links = await prisma.intakeLink.findMany({
      where: {
        organizationId,
        isActive: true,
        useCount: 0,
        clientId: { not: null },
        createdAt: { lt: cutoff },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        client: { email: { not: null }, archivedAt: null },
      },
      select: {
        id: true,
        clientId: true,
        client: { select: { firstName: true, email: true } },
      },
      take: 100,
    });
    for (const link of links) {
      if (!link.clientId) continue;
      const email = link.client?.email?.trim();
      if (!email) {
        skipped += 1;
        continue;
      }
      await send({
        clientId: link.clientId,
        email,
        firstName: link.client?.firstName ?? null,
        dedupeKey: `email:client:${link.clientId}:intake:${link.id}:pending`,
        subject: `Formulario pendiente — ${legalName}`,
        cuerpo:
          "Tienes un formulario de ingreso pendiente. Completarlo nos ayuda a avanzar con tu caso.",
        title: `Correo enviado: intake pendiente`,
      });
    }
  }

  if (settings.emailClientQuoteSent) {
    const quotes = await prisma.quote.findMany({
      where: {
        organizationId,
        status: "SENT",
        client: { email: { not: null }, archivedAt: null },
      },
      select: {
        id: true,
        folio: true,
        total: true,
        currency: true,
        clientId: true,
        client: { select: { firstName: true, email: true } },
      },
      take: 100,
    });
    for (const quote of quotes) {
      const email = quote.client.email?.trim();
      if (!email) {
        skipped += 1;
        continue;
      }
      await send({
        clientId: quote.clientId,
        email,
        firstName: quote.client.firstName,
        dedupeKey: `email:client:${quote.clientId}:quote:${quote.id}:sent`,
        subject: `Cotización ${quote.folio} — ${legalName}`,
        cuerpo: `Te enviamos la cotización ${quote.folio} por ${quote.total.toString()} ${quote.currency}.`,
        title: `Correo enviado: cotización ${quote.folio}`,
      });
    }
  }

  if (settings.emailClientQuoteExpiring) {
    const quotes = await prisma.quote.findMany({
      where: {
        organizationId,
        status: "SENT",
        validUntil: { lte: endOfToday, gte: new Date(now.getTime() - 7 * 86400000) },
        client: { email: { not: null }, archivedAt: null },
      },
      select: {
        id: true,
        folio: true,
        validUntil: true,
        clientId: true,
        client: { select: { firstName: true, email: true } },
      },
      take: 100,
    });
    for (const quote of quotes) {
      const email = quote.client.email?.trim();
      if (!email) {
        skipped += 1;
        continue;
      }
      await send({
        clientId: quote.clientId,
        email,
        firstName: quote.client.firstName,
        dedupeKey: `email:client:${quote.clientId}:quote:${quote.id}:expiring:${day}`,
        subject: `Cotización por vencer — ${legalName}`,
        cuerpo: `La cotización ${quote.folio} vence pronto${
          quote.validUntil
            ? ` (${quote.validUntil.toISOString().slice(0, 10)})`
            : ""
        }. Contáctanos si deseas aceptarla.`,
        title: `Correo enviado: cotización por vencer ${quote.folio}`,
      });
    }
  }

  if (settings.emailClientCaseReview) {
    const cases = await prisma.serviceCase.findMany({
      where: {
        organizationId,
        status: { in: ["OPEN", "ON_HOLD"] },
        archivedAt: null,
        nextActionAt: { lte: endOfToday },
        client: { email: { not: null }, archivedAt: null },
      },
      select: {
        id: true,
        caseNumber: true,
        clientId: true,
        client: { select: { firstName: true, email: true } },
      },
      take: 100,
    });
    for (const serviceCase of cases) {
      const email = serviceCase.client.email?.trim();
      if (!email) {
        skipped += 1;
        continue;
      }
      await send({
        clientId: serviceCase.clientId,
        email,
        firstName: serviceCase.client.firstName,
        dedupeKey: `email:client:${serviceCase.clientId}:case:${serviceCase.id}:review:${day}`,
        subject: `Revisión de tu caso — ${legalName}`,
        cuerpo: `Es momento de revisar tu expediente ${serviceCase.caseNumber}. Pronto te contactaremos o puedes responder a este correo.`,
        title: `Correo enviado: revisión caso ${serviceCase.caseNumber}`,
      });
    }
  }

  if (settings.emailClientRoundReview) {
    const rounds = await prisma.creditRound.findMany({
      where: {
        organizationId,
        status: { in: ["SENT", "WAITING_UPDATE"] },
        expectedReviewAt: { lte: endOfToday },
        case: {
          client: { email: { not: null }, archivedAt: null },
          serviceCase: { archivedAt: null, status: { in: ["OPEN", "ON_HOLD"] } },
        },
      },
      select: {
        id: true,
        roundNumber: true,
        case: {
          select: {
            clientId: true,
            caseCode: true,
            client: { select: { firstName: true, email: true } },
          },
        },
      },
      take: 100,
    });
    for (const round of rounds) {
      const email = round.case.client.email?.trim();
      if (!email) {
        skipped += 1;
        continue;
      }
      await send({
        clientId: round.case.clientId,
        email,
        firstName: round.case.client.firstName,
        dedupeKey: `email:client:${round.case.clientId}:round:${round.id}:review:${day}`,
        subject: `Revisión de ronda — ${legalName}`,
        cuerpo: `Estamos listos para revisar el resultado de la ronda ${round.roundNumber} de tu expediente ${round.case.caseCode}.`,
        title: `Correo enviado: revisión ronda ${round.roundNumber}`,
      });
    }
  }

  return { sent, skipped };
}

/** Recorre todas las orgs (cron). */
export async function sendClientEmailsAllOrgs(now = new Date()) {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let sent = 0;
  let skipped = 0;
  for (const org of orgs) {
    const result = await sendClientEmailsForOrg(org.id, now);
    sent += result.sent;
    skipped += result.skipped;
  }
  return { scanned: orgs.length, sent, skipped };
}
