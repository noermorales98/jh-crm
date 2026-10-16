/**
 * One-shot live walkthrough on org J&H Multiservices LLC with PRUEBA-* client.
 * Leaves PRUEBA client in place for Noe to inspect (does NOT delete).
 * No postal/email letter sends; no payments.
 *
 * Usage: npx tsx --env-file=.env.local scripts/smoke/uso-real-walkthrough-jh.ts
 * Optional: BASE_URL=http://localhost:3100 RESULTS_DIR=…
 *
 * Untracked / evidence harness — do not commit unless promoted.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import type { PortalContext } from "../../src/server/portal";
import * as clients from "../../src/server/clients";
import * as cases from "../../src/server/cases";
import * as rounds from "../../src/server/rounds";
import * as creditReports from "../../src/server/credit-reports";
import * as disputes from "../../src/server/disputes";
import * as letters from "../../src/server/letters";
import * as progress from "../../src/server/progress-reports";
import * as contracts from "../../src/server/contracts";
import { invitePortalAccess } from "../../src/server/portal";
import { buildClientActionPlanPdf } from "../../src/server/credit-reports/action-plan";
import { MIN_CANCELLATION_DEADLINE_DAYS } from "../../src/lib/contracts/legal-gate";

const prisma = new PrismaClient();
const RUN_ID = `m${Date.now().toString(36)}`;
const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const PORTAL_PW = `Prueba!${randomBytes(5).toString("hex")}`;
const OTHER_PW = `Prueba!${randomBytes(5).toString("hex")}`;

// Minimal 1×1 PNG data URL for signature
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

type Step = { id: string; result: "PASS" | "FAIL" | "SKIP"; detail?: string; status?: number };
const results: Step[] = [];
const ids: Record<string, unknown> = { runId: RUN_ID, baseUrl: BASE_URL };
const secrets: Record<string, string> = {};

function record(id: string, result: Step["result"], detail?: string, status?: number) {
  results.push({ id, result, detail, status });
  console.log(
    `  ${result === "PASS" ? "✓" : result === "SKIP" ? "⊗" : "✗"} ${id}${status != null ? ` HTTP ${status}` : ""}${detail ? ` — ${detail}` : ""}`,
  );
}

async function portalLogin(email: string, password: string) {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  if (!csrfRes.ok) throw new Error(`csrf ${csrfRes.status}`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const jar = (csrfRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]);
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
  return {
    cookies: [...jar, ...setCookies.map((c) => c.split(";")[0])].filter(Boolean).join("; "),
    status: loginRes.status,
  };
}

async function fetchPdf(reportId: string, cookies: string) {
  const res = await fetch(`${BASE_URL}/api/progress-reports/${reportId}/pdf`, {
    headers: { cookie: cookies },
    redirect: "manual",
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    magic: buf.slice(0, 5).toString("utf8"),
    bytes: buf.byteLength,
  };
}

async function main() {
  console.log(`\n[uso-real-walkthrough] run=${RUN_ID} org=J&H Multiservices LLC`);

  const org = await prisma.organization.findFirstOrThrow({
    where: { name: "J&H Multiservices LLC" },
  });
  const owner = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: org.id, role: "OWNER" },
  });
  const stage = await prisma.workflowStage.findFirstOrThrow({
    where: {
      organizationId: org.id,
      key: "ANALYSIS",
      isActive: true,
      service: { code: "CREDIT_REPAIR" },
    },
  });
  const template = await prisma.contractTemplate.findFirstOrThrow({
    where: { organizationId: org.id, active: true, version: "1.0" },
  });

  const ctx: OrganizationContext = {
    userId: owner.userId,
    organizationId: org.id,
    role: "OWNER",
  };
  ids.orgId = org.id;
  ids.templateId = template.id;
  ids.stageId = stage.id;

  // 1. PRUEBA client
  const email = `prueba+walkthrough-${RUN_ID}@example.com`;
  const otherEmail = `prueba+other-${RUN_ID}@example.com`;
  const client = await clients.createClient(ctx, {
    firstName: `PRUEBA-${RUN_ID}`,
    lastName: "Walkthrough",
    email,
    phone: "+1 555 010 9999",
    addressLine1: "100 Prueba St",
    city: "Houston",
    state: "TX",
    postalCode: "77002",
  });
  ids.clientId = client.id;
  ids.clientCode = client.clientCode;
  ids.email = email;
  record("1.create-client", "PASS", `${client.clientCode} ${client.id}`);

  // Companion client for ACL deny (also PRUEBA-, leave in place)
  const other = await clients.createClient(ctx, {
    firstName: `PRUEBA-Other-${RUN_ID}`,
    lastName: "Acl",
    email: otherEmail,
  });
  ids.otherClientId = other.id;
  ids.otherEmail = otherEmail;
  record("1b.create-other-client", "PASS", other.id);

  // 2. Portal invites
  const invite = await invitePortalAccess(ctx, {
    clientId: client.id,
    email,
    temporaryPassword: PORTAL_PW,
  });
  const otherInvite = await invitePortalAccess(ctx, {
    clientId: other.id,
    email: otherEmail,
    temporaryPassword: OTHER_PW,
  });
  ids.portalAccessId = invite.id;
  ids.otherPortalAccessId = otherInvite.id;
  secrets.portalEmail = email;
  secrets.portalPassword = PORTAL_PW;
  secrets.otherPortalEmail = otherEmail;
  secrets.otherPortalPassword = OTHER_PW;
  record("2.portal-invite", "PASS", `access=${invite.id} (password in secrets file)`);

  // 3. Case + synthetic credit report
  const creditCase = await cases.createCreditCase(ctx, {
    clientId: client.id,
    stageId: stage.id,
    summary: `PRUEBA walkthrough ${RUN_ID} — synthetic credit demo`,
  });
  ids.caseId = creditCase.id;
  ids.caseCode = creditCase.caseCode;
  record("3.create-case", "PASS", creditCase.caseCode);

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
        creditorName: "PRUEBA Collect Corp",
        accountNumberMasked: "****4242",
        bureau: "EXPERIAN",
        negativeType: "COLLECTION",
        isNegative: true,
        balance: 1200,
      },
    ],
  });
  ids.creditReportId = report.id;
  record("3.credit-report", "PASS", report.id);

  // 4. Action plan PDF
  const actionPdf = await buildClientActionPlanPdf(ctx, client.id, report.id);
  ids.actionPlanPdfBytes = actionPdf.pdf.byteLength;
  ids.actionPlanFilename = actionPdf.filename;
  record(
    "4.action-plan-pdf",
    actionPdf.pdf.slice(0, 5).toString() === "%PDF-" && actionPdf.pdf.byteLength > 100
      ? "PASS"
      : "FAIL",
    `${actionPdf.filename} ${actionPdf.pdf.byteLength}B`,
  );

  // 5. Round + letter FINAL (no postal)
  const detail = await creditReports.getReportDetail(ctx, report.id);
  const round = await rounds.createRound(ctx, {
    caseId: creditCase.id,
    notes: `PRUEBA round ${RUN_ID}`,
  });
  ids.roundId = round.id;
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
  const letterPdf = await letters.buildLetterPdf(ctx, draft.id);
  ids.letterId = draft.id;
  ids.letterPdfBytes = letterPdf.pdf.byteLength;
  record(
    "5.letter-final-no-postal",
    finalized.letter.status === "FINAL" &&
      finalized.letter.documentId == null &&
      letterPdf.pdf.byteLength > 100
      ? "PASS"
      : "FAIL",
    `status=${finalized.letter.status} doc=${finalized.letter.documentId}`,
  );

  const sent = await rounds.markRoundSent(ctx, round.id, {
    expectedReviewAt: new Date(Date.now() + 30 * 86400_000),
    createReviewTask: true,
  });
  ids.reviewTaskId = sent.reviewTask?.id ?? null;
  record("5.round-sent-domain", sent.round.status === "SENT" ? "PASS" : "FAIL");

  // 6. Contract v1.0 → DRAFT → SENT → SIGNED (portal-style, no email)
  const contract = await contracts.createContractFromTemplate(ctx, {
    clientId: client.id,
    caseId: creditCase.id,
    templateId: template.id,
    cancellationDeadlineDays: MIN_CANCELLATION_DEADLINE_DAYS,
  });
  ids.contractId = contract.id;
  const marked = await contracts.markSent(ctx, contract.id);
  const portalCtx: PortalContext = {
    accessId: invite.id,
    clientId: client.id,
    organizationId: org.id,
    email,
  };
  const signed = await contracts.signContract(portalCtx, {
    contractId: contract.id,
    signerName: `${client.firstName} ${client.lastName}`,
    signatureData: TINY_PNG,
    ip: "127.0.0.1",
    userAgent: "uso-real-walkthrough",
  });
  ids.contractStatus = signed.status;
  record(
    "6.contract-v1",
    marked.status === "SENT" && signed.status === "SIGNED" ? "PASS" : "FAIL",
    `draft→sent→${signed.status} v${contract.version}`,
  );

  // 7. Progress report
  const prog = await progress.createClientProgressReport(ctx, {
    caseId: creditCase.id,
    roundId: round.id,
    nextSteps: "PRUEBA next steps — follow up in 30 days",
  });
  ids.progressReportId = prog.id;
  const progPdf = await progress.buildProgressReportPdf(ctx, prog.id);
  ids.progressPdfBytes = progPdf.pdf.byteLength;
  record(
    "7.progress-pdf-staff",
    progPdf.pdf.slice(0, 5).toString() === "%PDF-" ? "PASS" : "FAIL",
    `${progPdf.filename} ${progPdf.pdf.byteLength}B`,
  );

  // Portal ownership via domain API
  const portalOwned = await progress.buildProgressReportPdfForPortal(
    client.id,
    org.id,
    prog.id,
  );
  record(
    "7.progress-pdf-portal-owner",
    portalOwned.pdf.byteLength > 100 ? "PASS" : "FAIL",
    `${portalOwned.pdf.byteLength}B`,
  );
  try {
    await progress.buildProgressReportPdfForPortal(other.id, org.id, prog.id);
    record("7.progress-pdf-portal-deny", "FAIL", "expected NotFoundError");
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    record(
      "7.progress-pdf-portal-deny",
      name === "NotFoundError" ? "PASS" : "FAIL",
      `${name}: ${e instanceof Error ? e.message : e}`,
    );
  }

  // 8. HTTP ACL if server up
  console.log("\n— Portal HTTP —");
  let serverOk = false;
  try {
    const h = await fetch(`${BASE_URL}/portal/login`, { redirect: "manual" });
    serverOk = h.status > 0 && h.status < 500;
    record("8.server", serverOk ? "PASS" : "FAIL", `GET /portal/login → ${h.status}`, h.status);
  } catch (e) {
    record("8.server", "SKIP", e instanceof Error ? e.message : String(e));
  }

  if (serverOk) {
    const ownerSession = await portalLogin(email, PORTAL_PW);
    const otherSession = await portalLogin(otherEmail, OTHER_PW);
    const hasSession = /session-token/;
    record(
      "8.login-owner",
      hasSession.test(ownerSession.cookies) ? "PASS" : "FAIL",
      `status=${ownerSession.status}`,
      ownerSession.status,
    );
    if (hasSession.test(ownerSession.cookies)) {
      const pdf = await fetchPdf(prog.id, ownerSession.cookies);
      ids.httpOwnerPdf = pdf;
      record(
        "8.http-owner-200",
        pdf.status === 200 && pdf.magic === "%PDF-" ? "PASS" : "FAIL",
        `magic=${pdf.magic} bytes=${pdf.bytes}`,
        pdf.status,
      );
    }
    if (hasSession.test(otherSession.cookies)) {
      const pdf = await fetchPdf(prog.id, otherSession.cookies);
      ids.httpOtherPdf = pdf;
      record(
        "8.http-other-404",
        pdf.status === 404 ? "PASS" : "FAIL",
        `magic=${pdf.magic}`,
        pdf.status,
      );
    } else {
      record("8.http-other-404", "FAIL", "other session missing");
    }
  } else {
    record("8.http-owner-200", "SKIP", "start Next: NEXT_PUBLIC_APP_URL=$BASE_URL npx next dev -p 3100");
    record("8.http-other-404", "SKIP", "server down — domain deny already checked");
  }

  // CRM URLs for Noe
  const urls = {
    client: `/crm/clientes/${client.id}`,
    planDeAccion: `/crm/clientes/${client.id}/plan-de-accion`,
    casoCredito: `/crm/casos/${creditCase.id}/credito`,
    contratos: `/crm/contratos?clientId=${client.id}`,
    portalLogin: `/portal/login`,
    portalProgreso: `/portal/progreso`,
    progressPdfApi: `/api/progress-reports/${prog.id}/pdf`,
  };
  ids.urls = urls;

  const out = {
    ranAt: new Date().toISOString(),
    runId: RUN_ID,
    org: { id: org.id, name: org.name },
    note: "PRUEBA clients LEFT IN PLACE for Noe. See delete-howto in README.",
    ids,
    urls,
    results,
    summary: {
      pass: results.filter((r) => r.result === "PASS").length,
      fail: results.filter((r) => r.result === "FAIL").length,
      skip: results.filter((r) => r.result === "SKIP").length,
    },
  };

  const outDir = process.env.RESULTS_DIR;
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, `run-${RUN_ID}.json`), JSON.stringify(out, null, 2));
    writeFileSync(
      resolve(outDir, `secrets-${RUN_ID}.json`),
      JSON.stringify(
        {
          warning: "Portal temp passwords for Noe only — rotate/revoke after inspection",
          ...secrets,
          clientId: client.id,
          otherClientId: other.id,
        },
        null,
        2,
      ),
    );
    console.log(`\nWrote results + secrets under ${outDir}`);
  } else {
    console.log("\n" + JSON.stringify(out, null, 2));
  }

  console.log("\n— CRM URLs —");
  for (const [k, v] of Object.entries(urls)) console.log(`  ${k}: ${v}`);
  console.log(
    `\nDone: ${out.summary.pass} pass / ${out.summary.fail} fail / ${out.summary.skip} skip`,
  );
  console.log("PRUEBA clients left in place (not deleted).\n");

  if (out.summary.fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
