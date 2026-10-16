/**
 * Real S3/R2 credit PDF ingest against a dedicated TEST JH-CRM org.
 *
 * Hard rules:
 * - Only org name containing `TEST JH-CRM`; clients `TEST-*`;
 *   emails `test+jh-crm-*@example.com`. Never mutates real J&H clients.
 * - Requires S3_* + OPENROUTER_API_KEY from .env.local.
 * - Uploads synthetic fixture PDF, runs start+process job, then deletes
 *   S3 object + all TEST org rows (leftovers → 0).
 *
 * Usage:
 *   unset DATABASE_URL
 *   CR_PDF_FIXTURE=/tmp/jh-crm-fixtures/test-synthetic-credit-report.pdf \
 *     npm run smoke:credit-pdf-ingest-test-org
 *
 * Optional: RESULTS_DIR=/path writes run-<id>.json
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as cases from "../../src/server/cases";
import { ensureCreditRepairService } from "../../src/server/services";
import {
  deleteObject,
  isStorageConfigured,
  putObjectBytes,
} from "../../src/lib/storage/s3";
import { buildStorageKey } from "../../src/lib/storage/policy";
import {
  getCreditPdfImportJob,
  processCreditPdfImportJob,
  startCreditPdfImportJob,
} from "../../src/server/credit-import/jobs";

const prisma = new PrismaClient();
const RUN_ID = `m${Date.now().toString(36)}`;
const FINGERPRINT = createHash("sha256")
  .update(RUN_ID)
  .digest("hex")
  .slice(0, 16);

type Step = { id: string; result: "PASS" | "FAIL" | "SKIP"; detail?: string };
const results: Step[] = [];
const created: Record<string, unknown> = { runId: RUN_ID, fingerprint: FINGERPRINT };

function record(id: string, result: Step["result"], detail?: string) {
  results.push({ id, result, detail });
  console.log(
    `  ${result === "PASS" ? "✓" : result === "SKIP" ? "⊗" : "✗"} ${id}${detail ? ` — ${detail}` : ""}`,
  );
}

function requireEnv(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

async function cleanup(orgId: string, ownerUserId: string, storageKey: string | null) {
  if (storageKey) {
    try {
      await deleteObject(storageKey);
    } catch (e) {
      console.warn("S3 delete warning:", e instanceof Error ? e.message : e);
    }
  }

  const caseIds = (
    await prisma.creditCase.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    })
  ).map((c) => c.id);

  await prisma.creditPdfImportJob.deleteMany({ where: { organizationId: orgId } });
  if (caseIds.length) {
    await prisma.creditItem.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.creditBureauSnapshot.deleteMany({
      where: { report: { caseId: { in: caseIds } } },
    });
    await prisma.creditReport.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.activityLog.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.creditRound.deleteMany({ where: { caseId: { in: caseIds } } });
  }
  await prisma.document.deleteMany({ where: { organizationId: orgId } });
  await prisma.activityLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.notification.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.creditCase.deleteMany({ where: { organizationId: orgId } });
  await prisma.serviceCaseStageHistory.deleteMany({
    where: { serviceCase: { organizationId: orgId } },
  });
  await prisma.serviceCase.deleteMany({ where: { organizationId: orgId } });
  await prisma.clientSensitiveProfile.deleteMany({ where: { organizationId: orgId } });
  await prisma.client.deleteMany({ where: { organizationId: orgId } });
  await prisma.workflowStage.deleteMany({ where: { organizationId: orgId } });
  await prisma.service.deleteMany({ where: { organizationId: orgId } });
  await prisma.organizationSettings.deleteMany({ where: { organizationId: orgId } });
  await prisma.organizationMember.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.delete({ where: { id: ownerUserId } }).catch(() => undefined);

  return {
    orgs: await prisma.organization.count({
      where: { name: { contains: "TEST JH-CRM" } },
    }),
    users: await prisma.user.count({
      where: { email: { startsWith: "test+jh-crm-" } },
    }),
    clients: await prisma.client.count({
      where: { firstName: { startsWith: "TEST-" } },
    }),
    jobs: await prisma.creditPdfImportJob.count({
      where: { organizationId: orgId },
    }),
  };
}

async function main() {
  console.log(`\n[credit-pdf-ingest-test-org] run=${RUN_ID}`);

  const missing: string[] = [];
  for (const k of [
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "OPENROUTER_API_KEY",
  ]) {
    if (!requireEnv(k)) missing.push(k);
  }
  if (!isStorageConfigured()) missing.push("(isStorageConfigured=false)");
  if (missing.length) {
    record("env.s3-openrouter", "FAIL", `missing: ${missing.join(", ")}`);
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
  record("env.s3-openrouter", "PASS");

  const fixture =
    process.env.CR_PDF_FIXTURE ||
    "/tmp/jh-crm-fixtures/test-synthetic-credit-report.pdf";
  if (!existsSync(fixture)) {
    throw new Error(`Fixture PDF not found: ${fixture}`);
  }
  const bytes = readFileSync(fixture);
  if (bytes.slice(0, 5).toString("utf8") !== "%PDF-") {
    throw new Error("Fixture is not a PDF");
  }
  record("fixture.pdf", "PASS", `${fixture} ${bytes.length}B`);

  const ownerEmail = `test+jh-crm-ingest-owner-${RUN_ID}@example.com`;
  const owner = await prisma.user.create({
    data: {
      email: ownerEmail,
      name: `TEST Ingest Owner ${RUN_ID}`,
      passwordHash: await bcrypt.hash(`Temp!${RUN_ID}`, 10),
      isActive: true,
    },
  });
  const org = await prisma.organization.create({
    data: {
      name: `TEST JH-CRM ingest ${RUN_ID}`,
      settings: {
        create: { legalName: `TEST JH-CRM ingest ${RUN_ID}`, timezone: "America/Chicago" },
      },
      members: { create: { userId: owner.id, role: "OWNER" } },
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

  const ctx: OrganizationContext = {
    userId: owner.id,
    organizationId: org.id,
    role: "OWNER",
  };

  let storageKey: string | null = null;

  try {
    const client = await clients.createClient(ctx, {
      firstName: `TEST-Ingest-${RUN_ID}`,
      lastName: "Pdf",
      email: `test+jh-crm-ingest-client-${RUN_ID}@example.com`,
    });
    created.clientId = client.id;

    const creditCase = await cases.createCreditCase(ctx, {
      clientId: client.id,
      stageId: stage.id,
      summary: `TEST PDF ingest ${RUN_ID}`,
    });
    created.caseId = creditCase.id;
    record("db.case", "PASS", creditCase.caseCode);

    storageKey = buildStorageKey(org.id, randomUUID());
    await putObjectBytes({
      storageKey,
      mimeType: "application/pdf",
      body: bytes,
    });
    created.storageKey = storageKey;
    record("s3.put", "PASS", storageKey.slice(0, 24) + "…");

    const doc = await prisma.document.create({
      data: {
        organizationId: org.id,
        clientId: client.id,
        caseId: creditCase.id,
        serviceCaseId: creditCase.serviceCaseId,
        category: "CREDIT_REPORT",
        sensitivity: "CONFIDENTIAL",
        originalName: `TEST-ingest-${RUN_ID}.pdf`,
        displayName: `TEST Synthetic Credit ${RUN_ID}`,
        mimeType: "application/pdf",
        sizeBytes: bytes.byteLength,
        storageKey,
        uploadedById: owner.id,
      },
    });
    created.documentId = doc.id;
    record("db.document", "PASS", doc.id);

    const started = await startCreditPdfImportJob(ctx, {
      caseId: creditCase.id,
      documentId: doc.id,
    });
    created.jobId = started.jobId;
    record("job.start", "PASS", started.jobId);

    const t0 = Date.now();
    await processCreditPdfImportJob(started.jobId);
    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

    const job = await getCreditPdfImportJob(ctx, started.jobId);
    created.jobStatus = job.status;
    created.jobPhase = job.phase;
    created.documentKind = job.proposal?.documentKind ?? null;
    created.snapshotCount = job.proposal?.report?.snapshots?.length ?? 0;
    created.itemCount = job.proposal?.report?.items?.length ?? 0;
    created.warnings = job.proposal?.warnings?.slice(0, 5) ?? [];
    created.errorMessage = job.errorMessage ?? null;
    created.elapsedSec = Number(elapsedSec);

    const ok = job.status === "SUCCEEDED";
    record(
      "job.process",
      ok ? "PASS" : "FAIL",
      `status=${job.status} kind=${job.proposal?.documentKind} snapshots=${created.snapshotCount} items=${created.itemCount} ${elapsedSec}s err=${job.errorMessage ?? "none"}`,
    );
  } finally {
    console.log("\n— Cleanup —");
    const leftovers = await cleanup(org.id, owner.id, storageKey);
    created.cleanup = leftovers;
    const clean =
      leftovers.orgs === 0 &&
      leftovers.users === 0 &&
      leftovers.clients === 0;
    record("cleanup.zero-leftovers", clean ? "PASS" : "FAIL", JSON.stringify(leftovers));
  }

  const out = {
    ranAt: new Date().toISOString(),
    runId: RUN_ID,
    fingerprint: FINGERPRINT,
    created,
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
    const path = resolve(outDir, `run-${RUN_ID}.json`);
    writeFileSync(path, JSON.stringify(out, null, 2));
    console.log(`\nWrote ${path}`);
  } else {
    console.log("\n" + JSON.stringify(out, null, 2));
  }

  if (out.summary.fail > 0) process.exitCode = 1;
  console.log(
    `\nDone: ${out.summary.pass} pass / ${out.summary.fail} fail / ${out.summary.skip} skip\n`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
