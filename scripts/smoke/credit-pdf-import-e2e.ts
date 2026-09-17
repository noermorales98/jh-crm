/**
 * E2E local CR-PDF: sube PDF de ejemplo → job → process.
 * Uso:
 *   CR_PDF_FIXTURE_PROGRESS="/path/to.pdf" npx tsx --env-file=.env.local scripts/smoke/credit-pdf-import-e2e.ts
 */
import { readFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { putObjectBytes, isStorageConfigured } from "../../src/lib/storage/s3";
import { buildStorageKey } from "../../src/lib/storage/policy";
import {
  startCreditPdfImportJob,
  processCreditPdfImportJob,
  getCreditPdfImportJob,
} from "../../src/server/credit-import/jobs";
import type { OrganizationContext } from "../../src/server/auth/guards";

async function main() {
  const fixture =
    process.env.CR_PDF_FIXTURE_PROGRESS ||
    process.env.CR_PDF_FIXTURE_BUREAU ||
    "";
  if (!fixture || !existsSync(fixture)) {
    throw new Error(
      "Define CR_PDF_FIXTURE_PROGRESS o CR_PDF_FIXTURE_BUREAU con una ruta local a PDF.",
    );
  }
  if (!isStorageConfigured()) throw new Error("S3 no configurado");
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("Falta OPENROUTER_API_KEY");
  }

  const prisma = new PrismaClient();
  const MARK = `crpdf-e2e-${Date.now()}`;
  let documentId: string | null = null;
  let jobId: string | null = null;

  try {
    const owner = await prisma.organizationMember.findFirstOrThrow({
      where: { role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });
    const creditCase = await prisma.creditCase.findFirstOrThrow({
      where: { organizationId: owner.organizationId, state: "OPEN" },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { firstName: true, lastName: true } } },
    });

    const ctx: OrganizationContext = {
      userId: owner.userId,
      organizationId: owner.organizationId,
      role: "OWNER",
    };

    const bytes = readFileSync(fixture);
    const storageKey = buildStorageKey(owner.organizationId, randomUUID());
    await putObjectBytes({
      storageKey,
      mimeType: "application/pdf",
      body: bytes,
    });

    const doc = await prisma.document.create({
      data: {
        organizationId: owner.organizationId,
        clientId: creditCase.clientId,
        caseId: creditCase.id,
        serviceCaseId: creditCase.serviceCaseId,
        category: "UPDATE_REPORT",
        sensitivity: "CONFIDENTIAL",
        originalName: `${MARK}.pdf`,
        displayName: `E2E Progress ${MARK}`,
        mimeType: "application/pdf",
        sizeBytes: bytes.byteLength,
        storageKey,
        uploadedById: owner.userId,
      },
    });
    documentId = doc.id;
    console.log("document", doc.id, "case", creditCase.caseCode, creditCase.client.firstName);

    const started = await startCreditPdfImportJob(ctx, {
      caseId: creditCase.id,
      documentId: doc.id,
    });
    jobId = started.jobId;
    console.log("job queued", jobId, started.progressPath);

    const t0 = Date.now();
    await processCreditPdfImportJob(jobId);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`process done in ${elapsed}s`);

    const job = await getCreditPdfImportJob(ctx, jobId);
    console.log({
      status: job.status,
      phase: job.phase,
      progress: job.progress,
      documentKind: job.proposal?.documentKind,
      confidence: job.proposal?.confidence,
      snapshots: job.proposal?.report?.snapshots?.map((s) => ({
        bureau: s.bureau,
        score: s.score,
      })),
      itemCount: job.proposal?.report?.items?.length ?? 0,
      warnings: job.proposal?.warnings?.slice(0, 5),
      errorMessage: job.errorMessage,
    });

    if (job.status !== "SUCCEEDED") {
      throw new Error(`Job failed: ${job.errorMessage}`);
    }
    console.log("E2E OK — revisar en", job.progressPath);
  } finally {
    // Dejar job/doc para inspección en UI; marcar en notes
    if (jobId) {
      console.log("jobId (no borrado):", jobId);
    }
    if (documentId) {
      console.log("documentId (no borrado):", documentId);
    }
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
