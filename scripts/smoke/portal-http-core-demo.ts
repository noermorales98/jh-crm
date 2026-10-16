/**
 * Portal HTTP ACL (TEST-001) + core demo E2E in dedicated TEST JH-CRM org.
 *
 * Hard rules (option 2 / synthetic only):
 * - Only org name containing `TEST JH-CRM`; clients `TEST-*`;
 *   emails `test+jh-crm-*@example.com`. Never touches real J&H org/clients.
 * - No prisma migrate, no real letter/email/SMS/payment/S3 postal send.
 * - Always cleanup TEST leftovers to 0 (orgs/users/clients/portalAccess).
 *
 * Usage:
 *   unset DATABASE_URL
 *   # terminal A — live Next for HTTP phase (FEATURE_CLIENT_PORTAL=true):
 *   NEXT_PUBLIC_APP_URL=http://localhost:3100 npx next dev -p 3100
 *   # terminal B:
 *   BASE_URL=http://localhost:3100 npm run smoke:portal-http-core-demo
 *
 * Without a live server, DB/core steps still run; HTTP checks SKIP.
 * Optional: RESULTS_DIR=/path/to/dir writes run-<id>.json.
 */
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as cases from "../../src/server/cases";
import * as rounds from "../../src/server/rounds";
import * as creditReports from "../../src/server/credit-reports";
import * as disputes from "../../src/server/disputes";
import * as letters from "../../src/server/letters";
import * as progress from "../../src/server/progress-reports";
import { invitePortalAccess } from "../../src/server/portal";
import { ensureCreditRepairService } from "../../src/server/services";
import { buildClientActionPlanPdf } from "../../src/server/credit-reports/action-plan";
import {
  isProgressReportOwnedByPortal,
  progressReportPortalWhere,
} from "../../src/server/progress-reports/portal-acl";
import {
  evaluateContractSendReadiness,
  MIN_CANCELLATION_DEADLINE_DAYS,
} from "../../src/lib/contracts/legal-gate";
import {
  JH_SERVICE_CONTRACT_HTML,
  JH_SERVICE_CONTRACT_VERSION,
} from "../../src/lib/contracts/sanitize";

const prisma = new PrismaClient();
const RUN_ID = `m${Date.now().toString(36)}`;
const FINGERPRINT = createHash("sha256")
  .update(RUN_ID)
  .digest("hex")
  .slice(0, 16);
const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3100").replace(
  /\/$/,
  "",
);
const PORTAL_PW = `TestPortal!${randomBytes(4).toString("hex")}`;
const OWNER_PW = `TestOwner!${randomBytes(4).toString("hex")}`;

type StepResult = {
  id: string;
  result: "PASS" | "FAIL" | "SKIP";
  detail?: string;
  status?: number;
};

const results: StepResult[] = [];
const created: Record<string, unknown> = {
  runId: RUN_ID,
  fingerprint: FINGERPRINT,
  baseUrl: BASE_URL,
};

function log(msg: string) {
  console.log(msg);
}

function record(
  id: string,
  result: StepResult["result"],
  detail?: string,
  status?: number,
) {
  results.push({ id, result, detail, status });
  const mark = result === "PASS" ? "✓" : result === "SKIP" ? "⊗" : "✗";
  console.log(
    `  ${mark} ${id}${status != null ? ` HTTP ${status}` : ""}${detail ? ` — ${detail}` : ""}`,
  );
}

async function portalLogin(
  email: string,
  password: string,
): Promise<{ cookies: string; status: number; location: string | null }> {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  if (!csrfRes.ok) {
    throw new Error(`csrf failed: ${csrfRes.status}`);
  }
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const jar = (csrfRes.headers.getSetCookie?.() ?? []).map(
    (c) => c.split(";")[0],
  );

  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    audience: "portal",
    callbackUrl: `${BASE_URL}/portal`,
    json: "true",
  });

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/portal`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: jar.join("; "),
    },
    body,
    redirect: "manual",
  });

  const setCookies = loginRes.headers.getSetCookie?.() ?? [];
  const all = [
    ...jar,
    ...setCookies.map((c) => c.split(";")[0]),
  ].filter(Boolean);

  return {
    cookies: all.join("; "),
    status: loginRes.status,
    location: loginRes.headers.get("location"),
  };
}

async function fetchPdf(
  reportId: string,
  cookies: string,
): Promise<{ status: number; magic: string; bytes: number; contentType: string | null }> {
  const res = await fetch(
    `${BASE_URL}/api/progress-reports/${reportId}/pdf`,
    {
      headers: { cookie: cookies },
      redirect: "manual",
    },
  );
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    magic: buf.slice(0, 5).toString("utf8"),
    bytes: buf.byteLength,
    contentType: res.headers.get("content-type"),
  };
}

async function seedTestOrg() {
  const ownerEmail = `test+jh-crm-owner-${RUN_ID}@example.com`;
  const ownerHash = await bcrypt.hash(OWNER_PW, 10);
  const owner = await prisma.user.create({
    data: {
      email: ownerEmail,
      name: `TEST Owner ${RUN_ID}`,
      passwordHash: ownerHash,
      isActive: true,
    },
  });

  const org = await prisma.organization.create({
    data: {
      name: `TEST JH-CRM ${RUN_ID}`,
      settings: {
        create: {
          legalName: `TEST JH-CRM ${RUN_ID}`,
          timezone: "America/Chicago",
        },
      },
      members: {
        create: {
          userId: owner.id,
          role: "OWNER",
        },
      },
    },
  });

  const creditService = await ensureCreditRepairService(org.id);
  const stage = await prisma.workflowStage.create({
    data: {
      organizationId: org.id,
      serviceId: creditService.id,
      key: "ANALYSIS",
      name: "Análisis",
      order: 1,
      color: "#0A84FF",
      isActive: true,
    },
  });

  created.orgId = org.id;
  created.ownerUserId = owner.id;
  created.ownerEmail = ownerEmail;
  created.stageId = stage.id;
  created.creditServiceId = creditService.id;

  const ctx: OrganizationContext = {
    userId: owner.id,
    organizationId: org.id,
    role: "OWNER",
  };
  return { org, owner, stage, ctx };
}

async function cleanup(orgId: string, ownerUserId: string) {
  // Delete in dependency-safe order within the TEST org only.
  const caseIds = (
    await prisma.creditCase.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    })
  ).map((c) => c.id);

  if (caseIds.length) {
    await prisma.disputeLetterItem.deleteMany({
      where: { letter: { round: { caseId: { in: caseIds } } } },
    });
    await prisma.disputeLetter.deleteMany({
      where: { round: { caseId: { in: caseIds } } },
    });
    await prisma.disputeItem.deleteMany({
      where: { round: { caseId: { in: caseIds } } },
    });
    await prisma.clientProgressReport.deleteMany({
      where: { caseId: { in: caseIds } },
    });
    await prisma.document.deleteMany({
      where: { caseId: { in: caseIds } },
    });
    await prisma.creditItem.deleteMany({
      where: { caseId: { in: caseIds } },
    });
    await prisma.creditBureauSnapshot.deleteMany({
      where: { report: { caseId: { in: caseIds } } },
    });
    await prisma.creditReport.deleteMany({
      where: { caseId: { in: caseIds } },
    });
    await prisma.task.deleteMany({
      where: { caseId: { in: caseIds } },
    });
    await prisma.activityLog.deleteMany({
      where: { caseId: { in: caseIds } },
    });
    await prisma.creditRound.deleteMany({
      where: { caseId: { in: caseIds } },
    });
  }

  await prisma.clientPortalAccess.deleteMany({
    where: { organizationId: orgId },
  });
  await prisma.activityLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.task.deleteMany({ where: { organizationId: orgId } });
  await prisma.note.deleteMany({ where: { organizationId: orgId } });
  await prisma.document.deleteMany({ where: { organizationId: orgId } });
  await prisma.creditCase.deleteMany({ where: { organizationId: orgId } });
  await prisma.serviceCaseStageHistory.deleteMany({
    where: { serviceCase: { organizationId: orgId } },
  });
  await prisma.serviceCase.deleteMany({ where: { organizationId: orgId } });
  await prisma.clientSensitiveProfile.deleteMany({
    where: { organizationId: orgId },
  });
  await prisma.client.deleteMany({ where: { organizationId: orgId } });
  await prisma.workflowStage.deleteMany({ where: { organizationId: orgId } });
  await prisma.servicePackageItem.deleteMany({
    where: { package: { organizationId: orgId } },
  });
  await prisma.servicePackage.deleteMany({
    where: { organizationId: orgId },
  });
  await prisma.service.deleteMany({ where: { organizationId: orgId } });
  await prisma.disputeLetterTemplate.deleteMany({
    where: { organizationId: orgId },
  }).catch(() => undefined);
  await prisma.contractTemplate.deleteMany({
    where: { organizationId: orgId },
  }).catch(() => undefined);
  await prisma.organizationSettings.deleteMany({
    where: { organizationId: orgId },
  });
  await prisma.organizationMember.deleteMany({
    where: { organizationId: orgId },
  });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.delete({ where: { id: ownerUserId } }).catch(() => undefined);

  const leftovers = {
    orgs: await prisma.organization.count({
      where: { name: { contains: "TEST JH-CRM" } },
    }),
    users: await prisma.user.count({
      where: { email: { startsWith: "test+jh-crm-" } },
    }),
    clients: await prisma.client.count({
      where: { firstName: { startsWith: "TEST-" } },
    }),
    portalAccess: await prisma.clientPortalAccess.count({
      where: { email: { startsWith: "test+jh-crm-" } },
    }),
  };
  return leftovers;
}

async function main() {
  log(`\n[portal-http-core-demo] run=${RUN_ID} base=${BASE_URL}`);
  log(`DB host check via prisma…`);

  // Sanity: refuse if FEATURE_CLIENT_PORTAL off (HTTP would fail)
  if (process.env.FEATURE_CLIENT_PORTAL !== "true") {
    throw new Error("FEATURE_CLIENT_PORTAL must be true in .env.local");
  }

  const { org, owner, stage, ctx } = await seedTestOrg();
  log(`  org=${org.id} owner=${owner.email}`);

  let leftovers = { orgs: -1, users: -1, clients: -1, portalAccess: -1 };

  try {
    // ── B: Core demo ──────────────────────────────────────────────
    log("\n— Core demo (synthetic DB) —");

    const ownerClient = await clients.createClient(ctx, {
      firstName: `TEST-Owner-${RUN_ID}`,
      lastName: "Portal",
      email: `test+jh-crm-portal-owner-${RUN_ID}@example.com`,
      addressLine1: "100 Test St",
      city: "Houston",
      state: "TX",
      postalCode: "77002",
    });
    created.ownerClientId = ownerClient.id;

    const otherClient = await clients.createClient(ctx, {
      firstName: `TEST-Other-${RUN_ID}`,
      lastName: "Portal",
      email: `test+jh-crm-portal-other-${RUN_ID}@example.com`,
    });
    created.otherClientId = otherClient.id;
    record("core.create-clients", "PASS", `owner=${ownerClient.id}`);

    const creditCase = await cases.createCreditCase(ctx, {
      clientId: ownerClient.id,
      stageId: stage.id,
      summary: `TEST core demo ${RUN_ID}`,
    });
    created.caseId = creditCase.id;
    record("core.create-case", "PASS", creditCase.caseCode);

    const report = await creditReports.createCreditReport(ctx, {
      caseId: creditCase.id,
      type: "INITIAL",
      reportDate: new Date("2026-10-01"),
      snapshots: [
        { bureau: "EXPERIAN", score: 560 },
        { bureau: "EQUIFAX", score: 548 },
        { bureau: "TRANSUNION", score: 555 },
      ],
      items: [
        {
          creditorName: "TEST Collect Corp",
          accountNumberMasked: "****4242",
          bureau: "EXPERIAN",
          negativeType: "COLLECTION",
          isNegative: true,
          balance: 1200,
        },
      ],
    });
    created.creditReportId = report.id;
    record("core.credit-report", "PASS", report.id);

    // Action plan PDF (staff domain — no postal/S3)
    try {
      const actionPdf = await buildClientActionPlanPdf(
        ctx,
        ownerClient.id,
        report.id,
      );
      const ok =
        actionPdf.pdf.byteLength > 100 &&
        actionPdf.pdf.slice(0, 5).toString("utf8") === "%PDF-";
      created.actionPlanPdfBytes = actionPdf.pdf.byteLength;
      created.actionPlanFilename = actionPdf.filename;
      record(
        "core.action-plan-pdf",
        ok ? "PASS" : "FAIL",
        `${actionPdf.filename} ${actionPdf.pdf.byteLength}B`,
      );
    } catch (e) {
      record(
        "core.action-plan-pdf",
        "FAIL",
        e instanceof Error ? e.message : String(e),
      );
    }

    const detail = await creditReports.getReportDetail(ctx, report.id);
    const round = await rounds.createRound(ctx, {
      caseId: creditCase.id,
      notes: `TEST round ${RUN_ID}`,
    });
    created.roundId = round.id;

    await disputes.addDisputeItem(ctx, {
      roundId: round.id,
      creditItemId: detail.items[0].id,
      disputeReason: "Not mine",
      action: "Disputar",
    });
    const summary = await disputes.getRoundDisputeSummary(ctx, round.id);

    const templates = await letters.ensureDefaultTemplates(ctx);
    const preview = await letters.previewLetter(ctx, {
      roundId: round.id,
      bureau: "EXPERIAN",
      templateId: templates[0].id,
      disputeItemIds: [summary.items[0].id],
    });
    const draft = await letters.createLetterDraft(ctx, {
      roundId: round.id,
      bureau: "EXPERIAN",
      templateId: templates[0].id,
      disputeItemIds: [summary.items[0].id],
      content: preview.content,
      subject: preview.subject,
    });
    const finalized = await letters.finalizeLetter(ctx, draft.id);
    created.letterId = draft.id;
    const letterPdf = await letters.buildLetterPdf(ctx, draft.id);
    record(
      "core.letter-generate-no-send",
      finalized.letter.status === "FINAL" &&
        letterPdf.pdf.byteLength > 100 &&
        finalized.letter.documentId == null
        ? "PASS"
        : "FAIL",
      `status=${finalized.letter.status} pdf=${letterPdf.pdf.byteLength}B doc=${finalized.letter.documentId}`,
    );

    // Mark round SENT without external postal — domain only
    const sent = await rounds.markRoundSent(ctx, round.id, {
      expectedReviewAt: new Date(Date.now() + 30 * 86400_000),
      createReviewTask: true,
    });
    created.reviewTaskId = sent.reviewTask?.id ?? null;
    record(
      "core.round-sent-domain",
      sent.round.status === "SENT" ? "PASS" : "FAIL",
      `status=${sent.round.status}`,
    );

    const prog = await progress.createClientProgressReport(ctx, {
      caseId: creditCase.id,
      roundId: round.id,
      nextSteps: "TEST next steps — follow up in 30 days",
    });
    created.progressReportId = prog.id;
    const progPdf = await progress.buildProgressReportPdf(ctx, prog.id);
    record(
      "core.progress-pdf",
      progPdf.pdf.byteLength > 100 &&
        progPdf.pdf.slice(0, 5).toString("utf8") === "%PDF-"
        ? "PASS"
        : "FAIL",
      `${progPdf.filename} ${progPdf.pdf.byteLength}B`,
    );

    // Contract v1.0 gate (no DB send)
    const contractHtml = JH_SERVICE_CONTRACT_HTML.replaceAll(
      "{{clientName}}",
      `${ownerClient.firstName} ${ownerClient.lastName}`,
    ).replaceAll(
      "{{clientFullName}}",
      `${ownerClient.firstName} ${ownerClient.lastName}`,
    );
    const ready = evaluateContractSendReadiness({
      title: "TEST Servicio",
      version: JH_SERVICE_CONTRACT_VERSION,
      contentHtml: contractHtml,
      cancellationDeadline: new Date(
        Date.now() + MIN_CANCELLATION_DEADLINE_DAYS * 86400_000 + 60_000,
      ),
    });
    record(
      "core.contract-v1-ready",
      ready.ok && JH_SERVICE_CONTRACT_VERSION === "1.0" ? "PASS" : "FAIL",
      `version=${JH_SERVICE_CONTRACT_VERSION} ok=${ready.ok}`,
    );

    // DB ownership predicates (pre-HTTP)
    const ownedPred = isProgressReportOwnedByPortal({
      reportOrganizationId: org.id,
      caseClientId: ownerClient.id,
      caseOrganizationId: org.id,
      portalClientId: ownerClient.id,
      portalOrganizationId: org.id,
    });
    const denyPred = isProgressReportOwnedByPortal({
      reportOrganizationId: org.id,
      caseClientId: ownerClient.id,
      caseOrganizationId: org.id,
      portalClientId: otherClient.id,
      portalOrganizationId: org.id,
    });
    const whereOwner = await prisma.clientProgressReport.findFirst({
      where: progressReportPortalWhere({
        reportId: prog.id,
        organizationId: org.id,
        clientId: ownerClient.id,
      }),
    });
    const whereOther = await prisma.clientProgressReport.findFirst({
      where: progressReportPortalWhere({
        reportId: prog.id,
        organizationId: org.id,
        clientId: otherClient.id,
      }),
    });
    record(
      "core.portal-acl-db",
      ownedPred && !denyPred && whereOwner?.id === prog.id && !whereOther
        ? "PASS"
        : "FAIL",
    );

    // Portal invites
    const ownerPortalEmail = `test+jh-crm-portal-owner-${RUN_ID}@example.com`;
    const otherPortalEmail = `test+jh-crm-portal-other-${RUN_ID}@example.com`;
    await invitePortalAccess(ctx, {
      clientId: ownerClient.id,
      email: ownerPortalEmail,
      temporaryPassword: PORTAL_PW,
    });
    await invitePortalAccess(ctx, {
      clientId: otherClient.id,
      email: otherPortalEmail,
      temporaryPassword: PORTAL_PW,
    });
    created.ownerPortalEmail = ownerPortalEmail;
    created.otherPortalEmail = otherPortalEmail;
    record("core.portal-invite", "PASS");

    // ── A: Portal HTTP ────────────────────────────────────────────
    log("\n— Portal HTTP ACL —");
    let serverOk = false;
    try {
      const health = await fetch(`${BASE_URL}/portal/login`, {
        redirect: "manual",
      });
      serverOk = health.status > 0 && health.status < 500;
      record(
        "http.server-reachable",
        serverOk ? "PASS" : "FAIL",
        `GET /portal/login → ${health.status}`,
        health.status,
      );
    } catch (e) {
      record(
        "http.server-reachable",
        "SKIP",
        e instanceof Error ? e.message : String(e),
      );
    }

    if (!serverOk) {
      record(
        "http.owner-200",
        "SKIP",
        "No live Next at BASE_URL — start: NEXT_PUBLIC_APP_URL=$BASE_URL npx next dev -p 3100",
      );
      record("http.non-owner-deny", "SKIP", "server down");
      record("http.anon-deny", "SKIP", "server down");
    } else {
      const ownerSession = await portalLogin(ownerPortalEmail, PORTAL_PW);
      const otherSession = await portalLogin(otherPortalEmail, PORTAL_PW);
      created.ownerLoginStatus = ownerSession.status;
      created.otherLoginStatus = otherSession.status;

      const sessionCookie =
        /authjs\.session-token|next-auth\.session-token|__Secure-authjs\.session-token/;
      const ownerHasSession = sessionCookie.test(ownerSession.cookies);
      const otherHasSession = sessionCookie.test(otherSession.cookies);
      record(
        "http.portal-login-owner",
        ownerHasSession ? "PASS" : "FAIL",
        `status=${ownerSession.status} loc=${ownerSession.location}`,
        ownerSession.status,
      );
      record(
        "http.portal-login-other",
        otherHasSession ? "PASS" : "FAIL",
        `status=${otherSession.status}`,
        otherSession.status,
      );

      if (ownerHasSession) {
        const ownerPdf = await fetchPdf(prog.id, ownerSession.cookies);
        created.ownerPdf = ownerPdf;
        const ownerPass =
          ownerPdf.status === 200 &&
          ownerPdf.magic === "%PDF-" &&
          ownerPdf.bytes > 100;
        record(
          "http.owner-200",
          ownerPass ? "PASS" : "FAIL",
          `magic=${ownerPdf.magic} bytes=${ownerPdf.bytes} ct=${ownerPdf.contentType}`,
          ownerPdf.status,
        );
      } else {
        record("http.owner-200", "FAIL", "no session cookie");
      }

      if (otherHasSession) {
        const otherPdf = await fetchPdf(prog.id, otherSession.cookies);
        created.otherPdf = otherPdf;
        // JH-002: NotFoundError → HTTP 404 (no existence leak).
        const denyOk = otherPdf.status === 404;
        record(
          "http.non-owner-deny",
          denyOk ? "PASS" : "FAIL",
          `expected 404 (NotFoundError); magic=${otherPdf.magic}`,
          otherPdf.status,
        );
      } else {
        record("http.non-owner-deny", "FAIL", "no session cookie");
      }

      const anon = await fetchPdf(prog.id, "");
      created.anonPdf = anon;
      // Unauthorized → false in middleware → redirect to /login (302/307) or 401
      const anonOk = [401, 302, 303, 307, 308].includes(anon.status);
      record(
        "http.anon-deny",
        anonOk ? "PASS" : "FAIL",
        `expected redirect/401`,
        anon.status,
      );
    }
  } finally {
    log("\n— Cleanup —");
    leftovers = await cleanup(org.id, owner.id);
    created.cleanup = leftovers;
    const clean =
      leftovers.orgs === 0 &&
      leftovers.users === 0 &&
      leftovers.clients === 0 &&
      leftovers.portalAccess === 0;
    record(
      "cleanup.zero-leftovers",
      clean ? "PASS" : "FAIL",
      JSON.stringify(leftovers),
    );
  }

  const out = {
    ranAt: new Date().toISOString(),
    runId: RUN_ID,
    fingerprint: FINGERPRINT,
    baseUrl: BASE_URL,
    contractVersion: JH_SERVICE_CONTRACT_VERSION,
    created,
    results,
    summary: {
      pass: results.filter((r) => r.result === "PASS").length,
      fail: results.filter((r) => r.result === "FAIL").length,
      skip: results.filter((r) => r.result === "SKIP").length,
    },
    leftovers,
  };

  const outDir = process.env.RESULTS_DIR;
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    const path = resolve(outDir, `run-${RUN_ID}.json`);
    writeFileSync(path, JSON.stringify(out, null, 2));
    log(`\nWrote ${path}`);
  } else {
    console.log("\n" + JSON.stringify(out, null, 2));
  }

  if (out.summary.fail > 0) process.exitCode = 1;
  log(
    `\nDone: ${out.summary.pass} pass / ${out.summary.fail} fail / ${out.summary.skip} skip`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
