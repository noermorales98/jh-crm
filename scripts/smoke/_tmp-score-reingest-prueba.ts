/**
 * One-shot (not for CI): re-ingest agustin_islas onto PRUEBA CL-0007 / CASE-0006.
 * Keeps PRUEBA. Writes redacted evidence to Project Store.
 *
 *   npx tsx --env-file=.env.local scripts/smoke/_tmp-score-reingest-prueba.ts
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import { isStorageConfigured, putObjectBytes } from "../../src/lib/storage/s3";
import { buildStorageKey } from "../../src/lib/storage/policy";
import {
  getCreditPdfImportJob,
  processCreditPdfImportJob,
  startCreditPdfImportJob,
} from "../../src/server/credit-import/jobs";

const CASE_ID = "cmvb6a27v000pva7tjlhoxxqr";
const CLIENT_ID = "cmvb69wjy0001va7te9pcayim";
const PDF = "/Users/noeli/Documents/JH Multiservices/agustin_islas (4).pdf";
const EVIDENCE_DIR =
  "/Users/noeli/Library/Application Support/Cursor/AgentStores/cursor_agent_stores/bc-053dd45d-5176-4467-88c1-cb0936a0a1e2/files/internal/real-bureau-ingest";
const AFTER_SHA = "2a7830c00c5de5a83328b713c062af2bf4aaa0ed";

const prisma = new PrismaClient();
const RUN_ID = `m${Date.now().toString(36)}`;

function redactName(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  return `${t[0]}***`;
}

function redactCreditor(s: string | null | undefined): string | null {
  if (!s) return null;
  if (s.length <= 4) return "****";
  return "*".repeat(Math.max(4, s.length - 2)) + s.slice(-2);
}

async function main() {
  console.log(`\n[score-reingest] run=${RUN_ID} sha=${AFTER_SHA}`);
  if (!existsSync(PDF)) throw new Error(`PDF missing: ${PDF}`);
  if (!isStorageConfigured()) throw new Error("S3 not configured");

  const creditCase = await prisma.creditCase.findUniqueOrThrow({
    where: { id: CASE_ID },
    include: {
      client: { select: { id: true, clientCode: true, firstName: true } },
    },
  });
  if (creditCase.clientId !== CLIENT_ID) {
    throw new Error(`Client mismatch: expected ${CLIENT_ID}`);
  }

  const owner = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: creditCase.organizationId, role: "OWNER" },
    select: { userId: true },
  });

  const ctx: OrganizationContext = {
    userId: owner.userId,
    organizationId: creditCase.organizationId,
    role: "OWNER",
  };

  const bytes = readFileSync(PDF);
  if (bytes.slice(0, 5).toString("utf8") !== "%PDF-") {
    throw new Error("Not a PDF");
  }

  const storageKey = buildStorageKey(creditCase.organizationId, randomUUID());
  await putObjectBytes({
    storageKey,
    mimeType: "application/pdf",
    body: bytes,
  });
  console.log("  ✓ S3 put", storageKey.slice(0, 28) + "…");

  const doc = await prisma.document.create({
    data: {
      organizationId: creditCase.organizationId,
      clientId: CLIENT_ID,
      caseId: CASE_ID,
      serviceCaseId: creditCase.serviceCaseId,
      category: "CREDIT_REPORT",
      sensitivity: "CONFIDENTIAL",
      originalName: "agustin_islas (4).pdf",
      displayName: `PRUEBA score-reingest ${RUN_ID}`,
      mimeType: "application/pdf",
      sizeBytes: bytes.byteLength,
      storageKey,
      uploadedById: owner.userId,
    },
  });
  console.log("  ✓ document", doc.id);

  const started = await startCreditPdfImportJob(ctx, {
    caseId: CASE_ID,
    documentId: doc.id,
  });
  console.log("  ✓ job queued", started.jobId, "— processing (may take several minutes)…");

  const t0 = Date.now();
  await processCreditPdfImportJob(started.jobId);
  const elapsedSec = Number(((Date.now() - t0) / 1000).toFixed(1));

  const job = await getCreditPdfImportJob(ctx, started.jobId);
  const proposal = job.proposal;
  const snapshots = (proposal?.report?.snapshots ?? []).map((s) => ({
    bureau: s.bureau,
    score: s.score ?? null,
    utilization: s.utilization ?? null,
    inquiries: s.inquiries ?? null,
  }));
  const items = proposal?.report?.items ?? [];
  const sampleItems = items.slice(0, 8).map((it) => ({
    creditor: redactCreditor(it.creditorName),
    bureau: it.bureau,
    isNegative: Boolean(it.isNegative),
    negativeType: it.negativeType ?? null,
    accountLast4:
      (it.accountNumberMasked ?? "").replace(/\D/g, "").slice(-4) || null,
  }));

  const out = {
    ranAt: new Date().toISOString(),
    runId: RUN_ID,
    afterMergeSha: AFTER_SHA,
    note: "Re-ingest after score-windows PR #31. PRUEBA kept. PII redacted.",
    target: {
      clientId: CLIENT_ID,
      clientCode: creditCase.client.clientCode,
      caseId: CASE_ID,
      caseCode: creditCase.caseCode,
    },
    file: {
      path: PDF,
      name: "agustin_islas (4).pdf",
      bytes: bytes.byteLength,
    },
    documentId: doc.id,
    jobId: started.jobId,
    status: job.status,
    phase: job.phase,
    errorMessage: job.errorMessage ?? null,
    elapsedSec,
    proposal: {
      documentKind: proposal?.documentKind ?? null,
      confidence: proposal?.confidence ?? null,
      warnings: (proposal?.warnings ?? []).slice(0, 12),
      client: proposal?.client
        ? {
            firstName: redactName(proposal.client.firstName),
            lastName: redactName(proposal.client.lastName),
            city: proposal.client.city ?? null,
            state: proposal.client.state ?? null,
          }
        : null,
      report: {
        reportDate: proposal?.report?.reportDate ?? null,
        provider: proposal?.report?.provider ?? null,
        typeHint: proposal?.report?.typeHint ?? null,
        snapshots,
        itemCount: items.length,
        negativeCount: items.filter((i) => i.isNegative).length,
        sampleItems,
      },
    },
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const jsonPath = resolve(EVIDENCE_DIR, `run-score-${RUN_ID}.json`);
  writeFileSync(jsonPath, JSON.stringify(out, null, 2));

  const scoreLabel = snapshots.length
    ? snapshots.map((s) => `${s.bureau} ${s.score}`).join(" / ")
    : "[]";

  const readme = `---
cursor:
  subagentId: "bc-b873e56e-c308-5db7-8845-8efd23f64494"
---

# Score re-ingest — agustin_islas (after PR #31)

**Merge SHA:** \`${AFTER_SHA}\`  
**Run:** \`${RUN_ID}\` — \`run-score-${RUN_ID}.json\`  
**Target:** PRUEBA CL-0007 / CASE-0006 (kept)

## Result

| Field | Value |
|---|---|
| Job | \`${started.jobId}\` |
| Status | **${job.status}** (~${elapsedSec} s) |
| \`documentKind\` | **${proposal?.documentKind ?? "null"}** |
| Confidence | ${proposal?.confidence ?? "n/a"} |
| Snapshots / scores | **${snapshots.length}** — ${scoreLabel} |
| Items | **${items.length}** (${items.filter((i) => i.isNegative).length} negative) |

## vs prior chunk-merge (mmvb8sjp0)

| | Chunk-merge | Score-windows |
|---|---|---|
| Kind | CREDIT_BUREAU_REPORT | ${proposal?.documentKind ?? "n/a"} |
| Items | 21 | ${items.length} |
| Scores | [] | ${scoreLabel} |

## CRM

\`/crm/casos/${CASE_ID}/credito/importaciones/${started.jobId}\`

Not auto-confirmed. PII redacted in JSON.
`;
  writeFileSync(resolve(EVIDENCE_DIR, "README-score-reingest.md"), readme);

  console.log(
    "\n" +
      JSON.stringify(
        {
          status: job.status,
          kind: proposal?.documentKind,
          snapshots,
          itemCount: items.length,
          elapsedSec,
          jsonPath,
        },
        null,
        2,
      ),
  );

  if (job.status !== "SUCCEEDED") process.exitCode = 1;
  if (snapshots.length === 0 || snapshots.every((s) => s.score == null)) {
    console.error("WARN: scores still empty");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
