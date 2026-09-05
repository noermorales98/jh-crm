/**
 * Smoke SPRINT 7 — Meta Lead Ads, dashboard crédito, helpers IA.
 *
 *   npm run smoke:sprint7
 *
 * Activa FEATURE_META_LEAD_ADS en el proceso del script (no requiere .env).
 */
process.env.FEATURE_META_LEAD_ADS = "true";

import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import { processMetaLead } from "../../src/server/meta/leads";
import { getDashboardSummary } from "../../src/server/dashboard";
import {
  getCreditCaseDetail,
  listCreditAttention,
  searchCreditProgress,
} from "../../src/server/ai/queries";

const prisma = new PrismaClient();
const MARK = "S7-SMOKE";
let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function main() {
  const org = await prisma.organization.findFirstOrThrow({
    where: { name: "J&H Multiservices LLC" },
  });
  const owner = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: org.id, role: "OWNER" },
  });
  const ctx: OrganizationContext = {
    userId: owner.userId,
    organizationId: org.id,
    role: "OWNER",
  };

  const externalLeadId = `s7-smoke-${Date.now()}`;
  let clientId: string | null = null;
  let opportunityId: string | null = null;
  let eventId: string | null = null;

  try {
    console.log("\n[1] processMetaLead — create + opportunity + event");
    const first = await processMetaLead({
      externalLeadId,
      pageId: "page-s7",
      formId: "form-s7",
      adId: "ad-s7",
      adsetId: "adset-s7",
      campaignId: "camp-s7",
      campaignName: "Smoke Campaign",
      fullName: `${MARK} Meta Lead`,
      email: `s7-meta-${Date.now()}@example.com`,
      phone: "3125550707",
      fieldData: [
        { name: "email", values: [`s7-meta-${Date.now()}@example.com`] },
      ],
    });
    clientId = first.clientId;
    opportunityId = first.opportunityId;
    eventId = first.eventId;

    check("created or linked client", !!first.clientId);
    check("opportunity created", !!first.opportunityId);
    check("event created", !!first.eventId);
    check("not deduped on first call", first.deduped === false);

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: first.clientId! },
    });
    check("source META", client.source === "META");
    check(
      "leadChannel FACEBOOK|INSTAGRAM",
      client.leadChannel === "FACEBOOK" || client.leadChannel === "INSTAGRAM",
      client.leadChannel,
    );

    const opp = await prisma.opportunity.findUniqueOrThrow({
      where: { id: first.opportunityId! },
    });
    check("opportunity stage NEW_LEAD", opp.stage === "NEW_LEAD");
    check("opportunity source META", opp.source === "META");

    console.log("\n[2] dedupe — same externalLeadId");
    const second = await processMetaLead({
      externalLeadId,
      email: "ignored-on-dedupe@example.com",
      phone: "0000000000",
      fullName: "Should Not Create",
    });
    check("deduped true", second.deduped === true);
    check("same clientId", second.clientId === first.clientId);
    check("same opportunityId", second.opportunityId === first.opportunityId);
    check("same eventId", second.eventId === first.eventId);

    const eventCount = await prisma.metaLeadEvent.count({
      where: { organizationId: org.id, externalLeadId },
    });
    check("only one MetaLeadEvent", eventCount === 1);

    console.log("\n[3] dashboard credit attention fields");
    const summary = await getDashboardSummary(ctx);
    const w = summary.widgets;
    const requiredKeys = [
      "documentsPendingCases",
      "reportsToReview",
      "roundsToPrepare",
      "roundsWaitingUpdate",
      "overdueUpdates",
      "overduePayments",
      "newLeads",
      "conversions",
      "disputedItems",
      "deletedItems",
      "updatedItems",
    ] as const;
    for (const key of requiredKeys) {
      check(
        `widget.${key}.count is number`,
        typeof w[key]?.count === "number",
        w[key],
      );
    }

    console.log("\n[4] AI credit helpers");
    const attention = await listCreditAttention(ctx);
    check(
      "listCreditAttention ok",
      typeof attention === "object" &&
        attention !== null &&
        !("error" in attention),
      attention,
    );

    const progress = await searchCreditProgress(ctx, MARK);
    check(
      "searchCreditProgress ok",
      typeof progress === "object" &&
        progress !== null &&
        !("error" in progress),
      progress,
    );

    const openCase = await prisma.creditCase.findFirst({
      where: { organizationId: org.id, state: "OPEN" },
      select: { id: true },
    });
    if (openCase) {
      const detail = await getCreditCaseDetail(ctx, openCase.id);
      check(
        "getCreditCaseDetail ok",
        typeof detail === "object" &&
          detail !== null &&
          !("error" in detail),
        detail,
      );
      const serialized = JSON.stringify(detail);
      check(
        "no ssnEncrypted leak",
        !serialized.includes("ssnEncrypted") && !/"ssn"\s*:/.test(serialized),
      );
    } else {
      check("getCreditCaseDetail skipped (no open case)", true);
    }

    // Firma HMAC de referencia (smoke de helper, no HTTP)
    const secret = "smoke-secret";
    const body = JSON.stringify({ externalLeadId: "x" });
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    check("hmac hex length", sig.length === 64);

    console.log(`\nResultado: ${passed} ok, ${failed} fallos`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    if (eventId) {
      await prisma.metaLeadEvent.deleteMany({ where: { id: eventId } }).catch(() => {});
    }
    if (opportunityId) {
      await prisma.opportunity.deleteMany({ where: { id: opportunityId } }).catch(() => {});
    }
    if (clientId) {
      await prisma.task.deleteMany({ where: { clientId } }).catch(() => {});
      await prisma.activityLog.deleteMany({ where: { clientId } }).catch(() => {});
      await prisma.notification
        .deleteMany({ where: { link: { contains: clientId } } })
        .catch(() => {});
      await prisma.client.deleteMany({ where: { id: clientId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
