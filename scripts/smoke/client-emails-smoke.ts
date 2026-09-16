/**
 * Smoke AU-001: correos a cliente — skip sin SMTP, dedupe, quote-sent hook.
 * Uso: npx tsx --env-file=.env.local scripts/smoke/client-emails-smoke.ts
 */
import { PrismaClient } from "@prisma/client";
import { createServiceCase } from "../../src/server/cases";
import { createQuote, markQuoteSent } from "../../src/server/quotes";
import {
  notifyClientQuoteSent,
  sendClientEmailsForOrg,
} from "../../src/server/notifications/client-emails";
import { isSmtpConfigured } from "../../src/server/notifications/smtp";
import type { OrganizationContext } from "../../src/server/auth/guards";

const MARK = `au001-${Date.now()}`;
let checks = 0;
function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  checks++;
  console.log(`  ✓ ${label}`);
}

async function main() {
  const prisma = new PrismaClient();
  let clientId: string | null = null;
  let quoteId: string | null = null;
  let orgId: string | null = null;
  let previousQuoteSentToggle = false;
  let toggled = false;

  try {
    const member = await prisma.organizationMember.findFirstOrThrow({
      where: { role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });
    orgId = member.organizationId;
    const ctx: OrganizationContext = {
      userId: member.userId,
      organizationId: member.organizationId,
      role: "OWNER",
    };

    console.log("\n[AU-001] Correos a clientes");

    const settings = await prisma.organizationSettings.findUniqueOrThrow({
      where: { organizationId: ctx.organizationId },
    });
    previousQuoteSentToggle = settings.emailClientQuoteSent;

    // Org sin forzar envíos: sendClientEmailsForOrg no debe romper.
    const baseline = await sendClientEmailsForOrg(ctx.organizationId, new Date());
    check(
      "sendClientEmailsForOrg retorna contadores",
      typeof baseline.sent === "number" && typeof baseline.skipped === "number",
    );

    const client = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: `C-${MARK}`.slice(0, 20),
        firstName: "AU001",
        lastName: MARK,
        email: `au001-${Date.now()}@example.com`,
        status: "ACTIVE",
        assignedToId: member.userId,
      },
    });
    clientId = client.id;

    await createServiceCase(ctx, {
      clientId: client.id,
      serviceCode: "CREDIT_REPAIR",
      assignedToId: member.userId,
    });

    const quote = await createQuote(ctx, {
      clientId: client.id,
      items: [
        {
          kind: "manual",
          description: `Smoke AU001 ${MARK}`,
          quantity: 1,
          unitPrice: "50.00",
        },
      ],
      taxRate: 0,
    });
    quoteId = quote.id;

    await prisma.organizationSettings.update({
      where: { organizationId: ctx.organizationId },
      data: { emailClientQuoteSent: true },
    });
    toggled = true;

    if (!isSmtpConfigured(settings)) {
      const skipped = await notifyClientQuoteSent(ctx.organizationId, quote.id);
      check("sin SMTP → notifyClientQuoteSent skipped", skipped === "skipped");
      await markQuoteSent(ctx, quote.id);
      check("markQuoteSent funciona sin SMTP", true);
    } else {
      await markQuoteSent(ctx, quote.id);
      const dedupeKey = `email:client:${client.id}:quote:${quote.id}:sent`;
      const notif = await prisma.notification.findUnique({
        where: { dedupeKey },
      });
      check("quote sent crea dedupe Notification", Boolean(notif));
      const again = await notifyClientQuoteSent(ctx.organizationId, quote.id);
      check("segunda llamada es idempotente (skipped)", again === "skipped");
      if (notif) {
        await prisma.notification.delete({ where: { id: notif.id } }).catch(() => undefined);
      }
    }

    await prisma.organizationSettings.update({
      where: { organizationId: ctx.organizationId },
      data: { emailClientQuoteSent: false },
    });
    const off = await notifyClientQuoteSent(ctx.organizationId, quote.id);
    check("toggle off → skipped", off === "skipped");

    console.log(`AU-001: ${checks}/${checks} OK`);
  } finally {
    console.log("\n[cleanup]");
    if (toggled && orgId) {
      await prisma.organizationSettings
        .update({
          where: { organizationId: orgId },
          data: { emailClientQuoteSent: previousQuoteSentToggle },
        })
        .catch(() => undefined);
    }
    if (quoteId) {
      await prisma.quoteEvent.deleteMany({ where: { quoteId } }).catch(() => undefined);
      await prisma.quoteItem.deleteMany({ where: { quoteId } }).catch(() => undefined);
      await prisma.quote.deleteMany({ where: { id: quoteId } }).catch(() => undefined);
    }
    if (clientId) {
      await prisma.notification
        .deleteMany({ where: { dedupeKey: { startsWith: `email:client:${clientId}:` } } })
        .catch(() => undefined);
      await prisma.activityLog.deleteMany({ where: { clientId } }).catch(() => undefined);
      await prisma.task.deleteMany({ where: { clientId } }).catch(() => undefined);
      const sc = await prisma.serviceCase.findMany({ where: { clientId } });
      const scIds = sc.map((s) => s.id);
      if (scIds.length) {
        await prisma.creditCase.deleteMany({ where: { serviceCaseId: { in: scIds } } }).catch(() => undefined);
        await prisma.serviceCaseStageHistory
          .deleteMany({ where: { serviceCaseId: { in: scIds } } })
          .catch(() => undefined);
        await prisma.serviceCase.deleteMany({ where: { id: { in: scIds } } }).catch(() => undefined);
      }
      await prisma.client.deleteMany({ where: { id: clientId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
