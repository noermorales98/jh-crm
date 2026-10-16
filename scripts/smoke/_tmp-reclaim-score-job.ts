/**
 * Reclaim stuck score-reingest job with local heartbeat fix.
 *   npx tsx --env-file=.env.local scripts/smoke/_tmp-reclaim-score-job.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { processCreditPdfImportJob } from "../../src/server/credit-import/jobs";

const JOB_ID = "cmvbbsuop0003vadu5hkkpx1i";
const AFTER_SHA = "2a7830c00c5de5a83328b713c062af2bf4aaa0ed";
const EVIDENCE_DIR =
  "/Users/noeli/Library/Application Support/Cursor/AgentStores/cursor_agent_stores/bc-053dd45d-5176-4467-88c1-cb0936a0a1e2/files/internal/real-bureau-ingest";

const prisma = new PrismaClient();

function redactCreditor(s: string | null | undefined): string | null {
  if (!s) return null;
  if (s.length <= 4) return "****";
  return "*".repeat(Math.max(4, s.length - 2)) + s.slice(-2);
}

async function main() {
  const before = await prisma.creditPdfImportJob.findUnique({
    where: { id: JOB_ID },
    select: {
      status: true,
      attempts: true,
      leaseExpiresAt: true,
      phase: true,
      caseId: true,
      documentId: true,
    },
  });
  console.log("before", before);
  if (!before) throw new Error("job missing");
  if (before.status === "SUCCEEDED") {
    console.log("already succeeded");
  } else {
    const t0 = Date.now();
    await processCreditPdfImportJob(JOB_ID);
    console.log("processed in", ((Date.now() - t0) / 1000).toFixed(1), "s");
  }

  const after = await prisma.creditPdfImportJob.findUnique({ where: { id: JOB_ID } });
  const p = after?.proposalJson as {
    documentKind?: string;
    confidence?: string;
    warnings?: string[];
    client?: { firstName?: string | null; lastName?: string | null; city?: string | null; state?: string | null } | null;
    report?: {
      reportDate?: string | null;
      provider?: string | null;
      typeHint?: string | null;
      snapshots?: Array<{ bureau: string; score?: number | null; utilization?: number | null; inquiries?: number | null }>;
      items?: Array<{
        creditorName: string;
        bureau: string;
        isNegative?: boolean;
        negativeType?: string | null;
        accountNumberMasked?: string | null;
      }>;
    };
  } | null;

  const snapshots = (p?.report?.snapshots ?? []).map((s) => ({
    bureau: s.bureau,
    score: s.score ?? null,
    utilization: s.utilization ?? null,
    inquiries: s.inquiries ?? null,
  }));
  const items = p?.report?.items ?? [];
  const RUN_ID = `m${Date.now().toString(36)}`;
  const scoreLabel = snapshots.length
    ? snapshots.map((s) => `${s.bureau} ${s.score}`).join(" / ")
    : "[]";

  const out = {
    ranAt: new Date().toISOString(),
    runId: RUN_ID,
    afterMergeSha: AFTER_SHA,
    note: "Reclaim after lease-heartbeat fix (local). PRUEBA kept. PII redacted.",
    target: {
      clientId: "cmvb69wjy0001va7te9pcayim",
      clientCode: "CL-0007",
      caseId: before.caseId,
      caseCode: "CASE-0006",
    },
    documentId: before.documentId,
    jobId: JOB_ID,
    status: after?.status,
    phase: after?.phase,
    errorMessage: after?.errorMessage ?? null,
    attempts: after?.attempts,
    proposal: {
      documentKind: p?.documentKind ?? null,
      confidence: p?.confidence ?? null,
      warnings: (p?.warnings ?? []).slice(0, 12),
      report: {
        reportDate: p?.report?.reportDate ?? null,
        provider: p?.report?.provider ?? null,
        typeHint: p?.report?.typeHint ?? null,
        snapshots,
        itemCount: items.length,
        negativeCount: items.filter((i) => i.isNegative).length,
        sampleItems: items.slice(0, 8).map((it) => ({
          creditor: redactCreditor(it.creditorName),
          bureau: it.bureau,
          isNegative: Boolean(it.isNegative),
          negativeType: it.negativeType ?? null,
          accountLast4:
            (it.accountNumberMasked ?? "").replace(/\D/g, "").slice(-4) || null,
        })),
      },
    },
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const jsonPath = resolve(EVIDENCE_DIR, `run-score-${RUN_ID}.json`);
  writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  writeFileSync(
    resolve(EVIDENCE_DIR, "README-score-reingest.md"),
    `---
cursor:
  subagentId: "bc-b873e56e-c308-5db7-8845-8efd23f64494"
---

# Score re-ingest — agustin_islas (after PR #31 + lease heartbeat)

**Score-windows merge SHA:** \`${AFTER_SHA}\`  
**Run:** \`${RUN_ID}\` — \`run-score-${RUN_ID}.json\`  
**Job:** \`${JOB_ID}\` (reclaimed after lease_lost)  
**Target:** PRUEBA CL-0007 / CASE-0006 (kept)

## Result

| Field | Value |
|---|---|
| Status | **${after?.status}** |
| \`documentKind\` | **${p?.documentKind ?? "null"}** |
| Confidence | ${p?.confidence ?? "n/a"} |
| Snapshots / scores | **${snapshots.length}** — ${scoreLabel} |
| Items | **${items.length}** (${items.filter((i) => i.isNegative).length} negative) |

## vs prior

| | Chunk-merge | Score-windows (this) |
|---|---|---|
| Kind | CREDIT_BUREAU_REPORT | ${p?.documentKind ?? "n/a"} |
| Items | 21 | ${items.length} |
| Scores | [] | ${scoreLabel} |

## CRM

\`/crm/casos/${before.caseId}/credito/importaciones/${JOB_ID}\`

Not auto-confirmed. PII redacted.
`,
  );

  console.log(JSON.stringify({ status: after?.status, snapshots, itemCount: items.length, jsonPath }, null, 2));
  if (after?.status !== "SUCCEEDED") process.exitCode = 1;
  if (!snapshots.length || snapshots.every((s) => s.score == null)) {
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
