/**
 * Tras confirmar PDF CREDIT_REPORT/UPDATE_REPORT: ready_to_analyze (sin job).
 * El análisis se encola después (startCreditPdfImport / enqueue).
 *
 *   npm run smoke:credit-pdf-auto-enqueue
 *
 * Solo sandbox (.env.local). PDFs sintéticos vía putObjectBytes + confirmUpload.
 * No llama OpenRouter ni procesa el PDF.
 */
import { PrismaClient } from "@prisma/client";
import { putObjectBytes, isStorageConfigured, deleteObject } from "../../src/lib/storage/s3";
import { confirmUpload } from "../../src/server/documents";
import type { OrganizationContext } from "../../src/server/auth/guards";
import {
  enqueueCreditPdfImportJob,
  findOpenJobForDocument,
  listActiveCreditPdfImportJobs,
  resolveCreditCaseForPdfAnalysis,
} from "../../src/server/credit-import/jobs";
import { chooseCrmUploadStrategy } from "../../src/lib/uploads/crm-upload-strategy";
import { SAME_ORIGIN_UPLOAD_MAX_BYTES } from "../../src/lib/storage/policy";

const prisma = new PrismaClient();
const MARK = `pdf-auto-${Date.now().toString(36)}`;

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

/** PDF mínimo válido (cabecera %PDF). */
function syntheticPdf(padBytes: number): Buffer {
  const header = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  if (padBytes <= header.byteLength) return header;
  return Buffer.concat([header, Buffer.alloc(padBytes - header.byteLength, 0x20)]);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("Falta DATABASE_URL (sandbox .env.local).");
  }
  if (!isStorageConfigured()) {
    throw new Error("Faltan S3_* para este smoke.");
  }

  console.log("\n[credit-pdf-auto-enqueue] upload → ready → enqueue");

  check(
    "estrategia small < 4MB = same-origin",
    chooseCrmUploadStrategy(1_000_000) === "same-origin",
  );
  check(
    "estrategia large >= 4MB = presigned",
    chooseCrmUploadStrategy(SAME_ORIGIN_UPLOAD_MAX_BYTES) === "presigned",
  );

  const member = await prisma.organizationMember.findFirstOrThrow({
    where: { role: { in: ["OWNER", "ADMIN", "STAFF"] } },
    orderBy: { createdAt: "asc" },
    select: { userId: true, organizationId: true, role: true },
  });

  const ctx: OrganizationContext = {
    userId: member.userId,
    organizationId: member.organizationId,
    role: member.role,
  };

  const viewerCtx: OrganizationContext = {
    ...ctx,
    role: "VIEWER",
  };

  const creditCase = await prisma.creditCase.findFirst({
    where: { organizationId: member.organizationId, state: "OPEN" },
    orderBy: { createdAt: "desc" },
    select: { id: true, clientId: true, serviceCaseId: true, caseCode: true },
  });
  if (!creditCase) {
    throw new Error("No hay CreditCase OPEN en sandbox.");
  }

  const storageKeys: string[] = [];
  const documentIds: string[] = [];
  const jobIds: string[] = [];

  async function putAndConfirm(opts: {
    category: "CREDIT_REPORT" | "UPDATE_REPORT" | "OTHER";
    caseId?: string | null;
    clientId: string;
    sizePad: number;
    name: string;
    asCtx?: OrganizationContext;
  }) {
    const body = syntheticPdf(opts.sizePad);
    const storageKey = `org/${member.organizationId}/documents/${MARK}-${opts.name}`;
    storageKeys.push(storageKey);
    await putObjectBytes({
      storageKey,
      mimeType: "application/pdf",
      body,
    });
    const result = await confirmUpload(opts.asCtx ?? ctx, {
      clientId: opts.clientId,
      caseId: opts.caseId,
      category: opts.category,
      originalName: `${opts.name}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: body.byteLength,
      storageKey,
      sensitivity: "CONFIDENTIAL",
    });
    documentIds.push(result.id);
    return result;
  }

  try {
    // --- Carga pequeña con caseId explícito ---
    const small = await putAndConfirm({
      category: "CREDIT_REPORT",
      caseId: creditCase.id,
      clientId: creditCase.clientId,
      sizePad: 2_000,
      name: "small",
    });
    check("small: document creado", Boolean(small.id));
    check(
      "small: ready_to_analyze (sin job aún)",
      small.analysis?.status === "ready_to_analyze",
      small.analysis,
    );
    check(
      "small: caseId en meta",
      small.analysis?.status === "ready_to_analyze" &&
        small.analysis.caseId === creditCase.id,
    );
    check(
      "small: confirm no crea job",
      (await prisma.creditPdfImportJob.count({ where: { documentId: small.id } })) ===
        0,
    );

    const enqueuedSmall = await enqueueCreditPdfImportJob(ctx, {
      caseId: creditCase.id,
      documentId: small.id,
    });
    jobIds.push(enqueuedSmall.jobId);
    check("small: enqueue crea job", enqueuedSmall.created === true);
    check("small: shouldProcess", enqueuedSmall.shouldProcess === true);

    const jobsForSmall = await prisma.creditPdfImportJob.findMany({
      where: { documentId: small.id },
    });
    check("small: exactamente 1 job tras enqueue", jobsForSmall.length === 1);
    check("small: status QUEUED", jobsForSmall[0]?.status === "QUEUED");

    // --- Enqueue repetido (idempotencia por documento) ---
    const again = await enqueueCreditPdfImportJob(ctx, {
      caseId: creditCase.id,
      documentId: small.id,
    });
    check("manual tras enqueue: mismo jobId", again.jobId === jobsForSmall[0]!.id);
    check("manual tras enqueue: created=false", again.created === false);

    const open = await findOpenJobForDocument(small.id, ctx.organizationId);
    check("findOpenJob: uno", open?.id === jobsForSmall[0]!.id);

    const jobsAfterManual = await prisma.creditPdfImportJob.count({
      where: { documentId: small.id },
    });
    check("idempotencia: sigue 1 job", jobsAfterManual === 1);

    // --- Carga grande (camino confirm = mismo que PUT firmado) ---
    const largePad = SAME_ORIGIN_UPLOAD_MAX_BYTES + 50_000;
    check(
      "large pad usa estrategia presigned",
      chooseCrmUploadStrategy(largePad) === "presigned",
    );
    const large = await putAndConfirm({
      category: "UPDATE_REPORT",
      caseId: creditCase.id,
      clientId: creditCase.clientId,
      sizePad: largePad,
      name: "large",
    });
    check(
      "large: ready_to_analyze",
      large.analysis?.status === "ready_to_analyze",
      large.analysis,
    );
    const enqueuedLarge = await enqueueCreditPdfImportJob(ctx, {
      caseId: creditCase.id,
      documentId: large.id,
    });
    jobIds.push(enqueuedLarge.jobId);
    check(
      "large: job distinto al small",
      enqueuedLarge.jobId !== jobsForSmall[0]!.id,
    );

    // --- Sin permiso manage ---
    const noPerm = await putAndConfirm({
      category: "CREDIT_REPORT",
      caseId: creditCase.id,
      clientId: creditCase.clientId,
      sizePad: 1_500,
      name: "noperm",
      asCtx: viewerCtx,
    });
    check(
      "viewer: skipped_permission",
      noPerm.analysis?.status === "skipped_permission",
      noPerm.analysis,
    );
    check(
      "viewer: sin job",
      (await prisma.creditPdfImportJob.count({ where: { documentId: noPerm.id } })) ===
        0,
    );

    // --- Resolución: cliente con exactamente 1 OPEN (filtrar si hace falta) ---
    const openByClient = await prisma.creditCase.groupBy({
      by: ["clientId"],
      where: { organizationId: member.organizationId, state: "OPEN" },
      _count: { _all: true },
    });
    const singleOpen = openByClient.find((r) => r._count._all === 1);
    const multiOpen = openByClient.find((r) => r._count._all >= 2);

    if (singleOpen) {
      const oneResolved = await resolveCreditCaseForPdfAnalysis(ctx, {
        clientId: singleOpen.clientId,
        caseId: null,
      });
      check("1 caso: resolve → resolved", oneResolved.status === "resolved", oneResolved);
      if (oneResolved.status === "resolved") {
        const autoCase = await putAndConfirm({
          category: "CREDIT_REPORT",
          caseId: null,
          clientId: singleOpen.clientId,
          sizePad: 1_800,
          name: "onecase",
        });
        check(
          "1 caso: ready_to_analyze",
          autoCase.analysis?.status === "ready_to_analyze",
          autoCase.analysis,
        );
        check(
          "1 caso: document ligado al case",
          autoCase.caseId === oneResolved.caseId,
          autoCase.caseId,
        );
        if (autoCase.analysis?.status === "ready_to_analyze") {
          const enq = await enqueueCreditPdfImportJob(ctx, {
            caseId: autoCase.analysis.caseId,
            documentId: autoCase.id,
          });
          jobIds.push(enq.jobId);
          check("1 caso: enqueue tras upload", enq.created);
        }
      }
    } else {
      console.log("  · skip 1-caso (no hay cliente con un solo OPEN)");
    }

    // N casos: crear un segundo CreditCase OPEN temporal en el cliente del caso base
    const { createCreditCase } = await import("../../src/server/cases");
    let extraCaseId: string | null = null;
    try {
      const extraCredit = await createCreditCase(ctx, {
        clientId: creditCase.clientId,
        summary: `smoke multi ${MARK}`,
      });
      extraCaseId = extraCredit.id;
      const multiResolved = await resolveCreditCaseForPdfAnalysis(ctx, {
        clientId: creditCase.clientId,
        caseId: null,
      });
      check(
        "N casos: resolve → needs_case_choice",
        multiResolved.status === "needs_case_choice",
        multiResolved,
      );
      const multi = await putAndConfirm({
        category: "CREDIT_REPORT",
        caseId: null,
        clientId: creditCase.clientId,
        sizePad: 1_800,
        name: "multicase",
      });
      check(
        "N casos: needs_case_choice en upload",
        multi.analysis?.status === "needs_case_choice",
        multi.analysis,
      );
      check(
        "N casos: sin job hasta elegir",
        (await prisma.creditPdfImportJob.count({ where: { documentId: multi.id } })) ===
          0,
      );
      if (multiResolved.status === "needs_case_choice") {
        const chosen = multiResolved.cases[0]!;
        const enq = await enqueueCreditPdfImportJob(ctx, {
          caseId: chosen.id,
          documentId: multi.id,
        });
        check("tras elegir caso: job creado", enq.created === true);
        jobIds.push(enq.jobId);
      }
    } finally {
      if (extraCaseId) {
        const extraFull = await prisma.creditCase.findUnique({
          where: { id: extraCaseId },
          select: { id: true, serviceCaseId: true },
        });
        if (extraFull) {
          await prisma.creditCase.delete({ where: { id: extraFull.id } }).catch(() => undefined);
          await prisma.serviceCaseStageHistory
            .deleteMany({ where: { serviceCaseId: extraFull.serviceCaseId } })
            .catch(() => undefined);
          await prisma.serviceCase
            .delete({ where: { id: extraFull.serviceCaseId } })
            .catch(() => undefined);
        }
      }
    }

    void multiOpen;

    // --- 0 casos: cliente sintético sin CreditCase → auto-crea OPEN; job al enqueue ---
    const lonely = await prisma.client.create({
      data: {
        organizationId: member.organizationId,
        clientCode: `SMK-${MARK}`.slice(0, 32),
        firstName: "Smoke",
        lastName: MARK,
        status: "LEAD",
      },
      select: { id: true },
    });
    const zero = await putAndConfirm({
      category: "CREDIT_REPORT",
      caseId: null,
      clientId: lonely.id,
      sizePad: 1_200,
      name: "zerocase",
    });
    check(
      "0 casos: ready_to_analyze",
      zero.analysis?.status === "ready_to_analyze",
      zero.analysis,
    );
    check(
      "0 casos: confirm sin job",
      (await prisma.creditPdfImportJob.count({ where: { documentId: zero.id } })) ===
        0,
    );
    const autoCase = await prisma.creditCase.findFirst({
      where: { clientId: lonely.id, organizationId: member.organizationId, state: "OPEN" },
      select: { id: true, serviceCaseId: true },
    });
    check("0 casos: CreditCase OPEN creado", !!autoCase, autoCase);
    if (zero.analysis?.status === "ready_to_analyze") {
      check(
        "0 casos: meta apunta al caso auto-creado",
        zero.analysis.caseId === autoCase?.id,
        { metaCaseId: zero.analysis.caseId, autoCaseId: autoCase?.id },
      );
      const enq = await enqueueCreditPdfImportJob(ctx, {
        caseId: zero.analysis.caseId,
        documentId: zero.id,
      });
      jobIds.push(enq.jobId);
      check("0 casos: enqueue crea job", enq.created);
    }

    // VIEWER: documento guardado, sin auto-crear ni encolar
    const lonelyViewer = await prisma.client.create({
      data: {
        organizationId: member.organizationId,
        clientCode: `SMK-V-${MARK}`.slice(0, 32),
        firstName: "SmokeViewer",
        lastName: MARK,
        status: "LEAD",
      },
      select: { id: true },
    });
    const viewerZero = await putAndConfirm({
      category: "CREDIT_REPORT",
      caseId: null,
      clientId: lonelyViewer.id,
      sizePad: 1_100,
      name: "viewer-zerocase",
      asCtx: viewerCtx,
    });
    check(
      "VIEWER 0 casos: skipped_permission",
      viewerZero.analysis?.status === "skipped_permission",
      viewerZero.analysis,
    );
    check(
      "VIEWER 0 casos: sin CreditCase",
      (await prisma.creditCase.count({ where: { clientId: lonelyViewer.id } })) === 0,
    );

    // --- Continuidad: jobs activos visibles sin nav-lock / session ---
    const active = await listActiveCreditPdfImportJobs(ctx);
    check(
      "listActive ve jobs QUEUED/SUCCEEDED recientes",
      active.some((j) => jobIds.includes(j.id) || j.status === "QUEUED"),
      { active: active.length, jobIds: jobIds.length },
    );

    // OTHER category no encola
    const other = await putAndConfirm({
      category: "OTHER",
      caseId: creditCase.id,
      clientId: creditCase.clientId,
      sizePad: 1_000,
      name: "other",
    });
    check("OTHER: sin analysis", other.analysis === undefined);

    console.log("\nOK credit-pdf-auto-enqueue\n");
  } finally {
    if (jobIds.length) {
      await prisma.notification
        .deleteMany({
          where: {
            dedupeKey: {
              in: jobIds.flatMap((id) => [
                `credit-pdf-import:${id}:fail`,
                `credit-pdf-import:${id}:done`,
              ]),
            },
          },
        })
        .catch(() => undefined);
      await prisma.auditLog
        .deleteMany({
          where: {
            entityType: "CreditPdfImportJob",
            entityId: { in: jobIds },
          },
        })
        .catch(() => undefined);
      await prisma.creditPdfImportJob.deleteMany({
        where: { id: { in: jobIds } },
      });
    }
    // Jobs creados vía confirm también por documentIds
    if (documentIds.length) {
      await prisma.creditPdfImportJob.deleteMany({
        where: { documentId: { in: documentIds } },
      });
      await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    }

    const smokeClients = await prisma.client.findMany({
      where: {
        organizationId: member.organizationId,
        lastName: MARK,
        firstName: { in: ["Smoke", "SmokeViewer"] },
      },
      select: { id: true },
    });
    const smokeClientIds = smokeClients.map((c) => c.id);
    if (smokeClientIds.length) {
      const autoCases = await prisma.creditCase.findMany({
        where: { clientId: { in: smokeClientIds } },
        select: { id: true, serviceCaseId: true },
      });
      for (const c of autoCases) {
        await prisma.creditCase.delete({ where: { id: c.id } }).catch(() => undefined);
        await prisma.serviceCaseStageHistory
          .deleteMany({ where: { serviceCaseId: c.serviceCaseId } })
          .catch(() => undefined);
        await prisma.activityLog
          .deleteMany({ where: { serviceCaseId: c.serviceCaseId } })
          .catch(() => undefined);
        await prisma.serviceCase
          .delete({ where: { id: c.serviceCaseId } })
          .catch(() => undefined);
      }
      await prisma.client
        .deleteMany({ where: { id: { in: smokeClientIds } } })
        .catch(() => undefined);
    }
    for (const key of storageKeys) {
      await deleteObject(key).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  void prisma.$disconnect();
});
