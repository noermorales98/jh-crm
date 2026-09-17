/**
 * AU-004 — WhatsApp automático al cliente vía Whapi (paridad AU-001).
 * CallMeBot del equipo no se usa aquí.
 */
import { prisma } from "@/src/lib/db";
import { decrypt } from "@/src/lib/security/encryption";
import { createNotification } from "@/src/server/notifications";
import {
  formatClientWhatsappMessage,
  isWhapiConfigured,
  sendWhapiText,
} from "@/src/server/notifications/whapi";

const SEND_GAP_MS = 1500;

function ymd(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  token: string;
  baseUrl: string | null;
  to: string;
  text: string;
  title: string;
  pace: boolean;
}): Promise<"sent" | "skipped"> {
  const existing = await prisma.notification.findUnique({
    where: { dedupeKey: params.dedupeKey },
  });
  if (existing) return "skipped";

  await sendWhapiText({
    token: params.token,
    baseUrl: params.baseUrl,
    to: params.to,
    body: params.text,
  });

  await createNotification({
    organizationId: params.organizationId,
    userId: params.ownerUserId,
    type: "SYSTEM",
    title: params.title,
    body: `WhatsApp cliente: ${params.to}`,
    dedupeKey: params.dedupeKey,
    skipWhatsapp: true,
    skipEmail: true,
  });

  if (params.pace) await sleep(SEND_GAP_MS);
  return "sent";
}

/** Disparo inmediato al marcar cotización enviada. */
export async function notifyClientQuoteSentWhatsapp(
  organizationId: string,
  quoteId: string,
): Promise<"sent" | "skipped"> {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });
  if (!settings?.whatsappClientQuoteSent || !isWhapiConfigured(settings)) {
    return "skipped";
  }

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, organizationId, status: "SENT" },
    include: {
      client: { select: { id: true, firstName: true, phone: true } },
    },
  });
  if (!quote?.client.phone?.trim()) return "skipped";

  const ownerUserId = await firstOwnerUserId(organizationId);
  if (!ownerUserId) return "skipped";

  const legalName = settings.legalName || "J&H Multiservices LLC";
  const text = formatClientWhatsappMessage({
    legalName,
    firstName: quote.client.firstName,
    body:
      `Te enviamos la cotización ${quote.folio}` +
      (quote.total != null
        ? ` por ${quote.total.toString()} ${quote.currency}.`
        : ".") +
      `\n\nSi tienes dudas, responde a este WhatsApp o llámanos.`,
    companyPhone: settings.phone,
  });

  return claimAndSend({
    organizationId,
    ownerUserId,
    dedupeKey: `wa:client:${quote.clientId}:quote:${quote.id}:sent`,
    token: decrypt(settings.whapiTokenEncrypted!),
    baseUrl: settings.whapiBaseUrl,
    to: quote.client.phone,
    text,
    title: `WhatsApp enviado: cotización ${quote.folio}`,
    pace: false,
  });
}

export async function sendClientWhatsappForOrg(
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
  if (!settings || !isWhapiConfigured(settings)) {
    return { sent: 0, skipped: 0 };
  }

  const ownerUserId = await firstOwnerUserId(organizationId);
  if (!ownerUserId) return { sent: 0, skipped: 0 };

  const token = decrypt(settings.whapiTokenEncrypted!);
  const legalName = settings.legalName || "J&H Multiservices LLC";
  const day = ymd(now, settings.timezone || "America/Chicago");
  const endOfToday = new Date(now);
  endOfToday.setUTCHours(23, 59, 59, 999);

  const send = async (args: {
    clientId: string;
    phone: string;
    firstName: string | null;
    dedupeKey: string;
    cuerpo: string;
    title: string;
  }) => {
    const text = formatClientWhatsappMessage({
      legalName,
      firstName: args.firstName,
      body: args.cuerpo,
      companyPhone: settings.phone,
    });
    bump(
      await claimAndSend({
        organizationId,
        ownerUserId,
        dedupeKey: args.dedupeKey,
        token,
        baseUrl: settings.whapiBaseUrl,
        to: args.phone,
        text,
        title: args.title,
        pace: true,
      }),
    );
  };

  if (settings.whatsappClientPaymentDue) {
    const payments = await prisma.payment.findMany({
      where: {
        organizationId,
        status: "PENDING",
        dueAt: { lte: endOfToday },
        client: { phone: { not: null }, archivedAt: null },
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        dueAt: true,
        clientId: true,
        client: { select: { firstName: true, phone: true } },
      },
      take: 100,
    });
    for (const payment of payments) {
      const phone = payment.client.phone?.trim();
      if (!phone) {
        skipped += 1;
        continue;
      }
      await send({
        clientId: payment.clientId,
        phone,
        firstName: payment.client.firstName,
        dedupeKey: `wa:client:${payment.clientId}:payment:${payment.id}:due`,
        cuerpo: `Tienes un pago pendiente de ${payment.amount.toString()} ${payment.currency}${
          payment.dueAt
            ? ` con vencimiento el ${payment.dueAt.toISOString().slice(0, 10)}`
            : ""
        }.`,
        title: `WhatsApp enviado: pago pendiente`,
      });
    }
  }

  if (settings.whatsappClientDocsPending) {
    const cases = await prisma.creditCase.findMany({
      where: {
        organizationId,
        state: "OPEN",
        stage: { key: "DOCUMENTS_PENDING" },
        serviceCase: { archivedAt: null, status: "OPEN" },
        client: { phone: { not: null }, archivedAt: null },
      },
      select: {
        id: true,
        caseCode: true,
        clientId: true,
        client: { select: { firstName: true, phone: true } },
      },
      take: 100,
    });
    for (const creditCase of cases) {
      const phone = creditCase.client.phone?.trim();
      if (!phone) {
        skipped += 1;
        continue;
      }
      await send({
        clientId: creditCase.clientId,
        phone,
        firstName: creditCase.client.firstName,
        dedupeKey: `wa:client:${creditCase.clientId}:case:${creditCase.id}:docs:${day}`,
        cuerpo: `Tu expediente ${creditCase.caseCode} necesita documentos para continuar. Súbelos por el portal o contáctanos.`,
        title: `WhatsApp enviado: documentos pendientes ${creditCase.caseCode}`,
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
        client: { phone: { not: null }, archivedAt: null },
      },
      select: {
        id: true,
        clientId: true,
        client: { select: { firstName: true, phone: true } },
      },
      take: 100,
    });
    for (const link of links) {
      if (!link.clientId) continue;
      const phone = link.client?.phone?.trim();
      if (!phone) {
        skipped += 1;
        continue;
      }
      await send({
        clientId: link.clientId,
        phone,
        firstName: link.client?.firstName ?? null,
        dedupeKey: `wa:client:${link.clientId}:intake:${link.id}:pending`,
        cuerpo:
          "Tienes un formulario de ingreso pendiente. Completarlo nos ayuda a avanzar con tu caso.",
        title: `WhatsApp enviado: intake pendiente`,
      });
    }
  }

  if (settings.whatsappClientQuoteSent) {
    const quotes = await prisma.quote.findMany({
      where: {
        organizationId,
        status: "SENT",
        client: { phone: { not: null }, archivedAt: null },
      },
      select: {
        id: true,
        folio: true,
        total: true,
        currency: true,
        clientId: true,
        client: { select: { firstName: true, phone: true } },
      },
      take: 100,
    });
    for (const quote of quotes) {
      const phone = quote.client.phone?.trim();
      if (!phone) {
        skipped += 1;
        continue;
      }
      await send({
        clientId: quote.clientId,
        phone,
        firstName: quote.client.firstName,
        dedupeKey: `wa:client:${quote.clientId}:quote:${quote.id}:sent`,
        cuerpo: `Te enviamos la cotización ${quote.folio} por ${quote.total.toString()} ${quote.currency}.`,
        title: `WhatsApp enviado: cotización ${quote.folio}`,
      });
    }
  }

  if (settings.whatsappClientQuoteExpiring) {
    const quotes = await prisma.quote.findMany({
      where: {
        organizationId,
        status: "SENT",
        validUntil: {
          lte: endOfToday,
          gte: new Date(now.getTime() - 7 * 86400000),
        },
        client: { phone: { not: null }, archivedAt: null },
      },
      select: {
        id: true,
        folio: true,
        validUntil: true,
        clientId: true,
        client: { select: { firstName: true, phone: true } },
      },
      take: 100,
    });
    for (const quote of quotes) {
      const phone = quote.client.phone?.trim();
      if (!phone) {
        skipped += 1;
        continue;
      }
      await send({
        clientId: quote.clientId,
        phone,
        firstName: quote.client.firstName,
        dedupeKey: `wa:client:${quote.clientId}:quote:${quote.id}:expiring:${day}`,
        cuerpo: `La cotización ${quote.folio} vence pronto${
          quote.validUntil
            ? ` (${quote.validUntil.toISOString().slice(0, 10)})`
            : ""
        }. Contáctanos si deseas aceptarla.`,
        title: `WhatsApp enviado: cotización por vencer ${quote.folio}`,
      });
    }
  }

  if (settings.whatsappClientCaseReview) {
    const cases = await prisma.serviceCase.findMany({
      where: {
        organizationId,
        status: { in: ["OPEN", "ON_HOLD"] },
        archivedAt: null,
        nextActionAt: { lte: endOfToday },
        client: { phone: { not: null }, archivedAt: null },
      },
      select: {
        id: true,
        caseNumber: true,
        clientId: true,
        client: { select: { firstName: true, phone: true } },
      },
      take: 100,
    });
    for (const serviceCase of cases) {
      const phone = serviceCase.client.phone?.trim();
      if (!phone) {
        skipped += 1;
        continue;
      }
      await send({
        clientId: serviceCase.clientId,
        phone,
        firstName: serviceCase.client.firstName,
        dedupeKey: `wa:client:${serviceCase.clientId}:case:${serviceCase.id}:review:${day}`,
        cuerpo: `Es momento de revisar tu expediente ${serviceCase.caseNumber}. Pronto te contactaremos.`,
        title: `WhatsApp enviado: revisión caso ${serviceCase.caseNumber}`,
      });
    }
  }

  if (settings.whatsappClientRoundReview) {
    const rounds = await prisma.creditRound.findMany({
      where: {
        organizationId,
        status: { in: ["SENT", "WAITING_UPDATE"] },
        expectedReviewAt: { lte: endOfToday },
        case: {
          client: { phone: { not: null }, archivedAt: null },
          serviceCase: {
            archivedAt: null,
            status: { in: ["OPEN", "ON_HOLD"] },
          },
        },
      },
      select: {
        id: true,
        roundNumber: true,
        case: {
          select: {
            clientId: true,
            caseCode: true,
            client: { select: { firstName: true, phone: true } },
          },
        },
      },
      take: 100,
    });
    for (const round of rounds) {
      const phone = round.case.client.phone?.trim();
      if (!phone) {
        skipped += 1;
        continue;
      }
      await send({
        clientId: round.case.clientId,
        phone,
        firstName: round.case.client.firstName,
        dedupeKey: `wa:client:${round.case.clientId}:round:${round.id}:review:${day}`,
        cuerpo: `Estamos listos para revisar el resultado de la ronda ${round.roundNumber} de tu expediente ${round.case.caseCode}.`,
        title: `WhatsApp enviado: revisión ronda ${round.roundNumber}`,
      });
    }
  }

  return { sent, skipped };
}

export async function sendClientWhatsappAllOrgs(now = new Date()) {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let sent = 0;
  let skipped = 0;
  for (const org of orgs) {
    const result = await sendClientWhatsappForOrg(org.id, now);
    sent += result.sent;
    skipped += result.skipped;
  }
  return { scanned: orgs.length, sent, skipped };
}
