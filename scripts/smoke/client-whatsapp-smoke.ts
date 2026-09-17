/**
 * Smoke AU-004: WhatsApp a clientes (Whapi) — normalización, skip sin config.
 * Uso: npx tsx --env-file=.env.local scripts/smoke/client-whatsapp-smoke.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  notifyClientQuoteSentWhatsapp,
  sendClientWhatsappForOrg,
} from "../../src/server/notifications/client-whatsapp";
import {
  assertWhapiTo,
  isWhapiConfigured,
  normalizeWhapiTo,
} from "../../src/server/notifications/whapi";
import { createQuote } from "../../src/server/quotes";
import { createServiceCase } from "../../src/server/cases";
import { DomainError } from "../../src/server/errors";
import type { OrganizationContext } from "../../src/server/auth/guards";

const MARK = `au004-${Date.now()}`;
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
  let previousEnabled = false;
  let previousToggle = false;
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

    console.log("\n[AU-004] WhatsApp clientes Whapi");

    check(
      "normalize +1 (713) 555-1212 → 17135551212",
      normalizeWhapiTo("+1 (713) 555-1212") === "17135551212",
    );
    check(
      "assertWhapiTo acepta 17135551212",
      assertWhapiTo("17135551212") === "17135551212",
    );
    try {
      assertWhapiTo("123");
      throw new Error("debía fallar");
    } catch (error) {
      check("assertWhapiTo rechaza corto", error instanceof DomainError);
    }

    const settings = await prisma.organizationSettings.findUniqueOrThrow({
      where: { organizationId: ctx.organizationId },
    });
    previousEnabled = settings.whapiEnabled;
    previousToggle = settings.whatsappClientQuoteSent;

    check(
      "sin enable+token → no configurado",
      !isWhapiConfigured({
        whapiEnabled: false,
        whapiTokenEncrypted: null,
      }),
    );

    const baseline = await sendClientWhatsappForOrg(
      ctx.organizationId,
      new Date(),
    );
    check(
      "sendClientWhatsappForOrg retorna contadores",
      typeof baseline.sent === "number" && typeof baseline.skipped === "number",
    );

    const client = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: `C-${MARK}`.slice(0, 20),
        firstName: "AU004",
        lastName: MARK,
        phone: `+1713555${String(Date.now()).slice(-4)}`,
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
          description: `Smoke AU004 ${MARK}`,
          quantity: 1,
          unitPrice: 10,
        },
      ],
    });
    quoteId = quote.id;
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: "SENT", sentAt: new Date() },
    });

    await prisma.organizationSettings.update({
      where: { organizationId: ctx.organizationId },
      data: { whatsappClientQuoteSent: true, whapiEnabled: false },
    });
    toggled = true;
    const skipped = await notifyClientQuoteSentWhatsapp(
      ctx.organizationId,
      quote.id,
    );
    check("sin Whapi configurado → skipped", skipped === "skipped");

    console.log(`AU-004: ${checks}/${checks} OK`);
  } finally {
    console.log("\n[cleanup]");
    if (toggled && orgId) {
      await prisma.organizationSettings
        .update({
          where: { organizationId: orgId },
          data: {
            whapiEnabled: previousEnabled,
            whatsappClientQuoteSent: previousToggle,
          },
        })
        .catch(() => undefined);
    }
    if (quoteId) {
      await prisma.quoteEvent
        .deleteMany({ where: { quoteId } })
        .catch(() => undefined);
      await prisma.quoteItem
        .deleteMany({ where: { quoteId } })
        .catch(() => undefined);
      await prisma.quote
        .deleteMany({ where: { id: quoteId } })
        .catch(() => undefined);
    }
    if (clientId) {
      const cases = await prisma.creditCase.findMany({
        where: { clientId },
        select: { id: true, serviceCaseId: true },
      });
      for (const row of cases) {
        await prisma.creditCase
          .delete({ where: { id: row.id } })
          .catch(() => undefined);
        if (row.serviceCaseId) {
          await prisma.serviceCaseStageHistory
            .deleteMany({ where: { serviceCaseId: row.serviceCaseId } })
            .catch(() => undefined);
          await prisma.serviceCase
            .delete({ where: { id: row.serviceCaseId } })
            .catch(() => undefined);
        }
      }
      await prisma.client
        .deleteMany({ where: { id: clientId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
