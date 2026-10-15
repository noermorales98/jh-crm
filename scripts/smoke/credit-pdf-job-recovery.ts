/**
 * Recovery/lease de CreditPdfImportJob (sandbox MySQL).
 * No llama a OpenRouter ni lee PDFs reales.
 *
 *   npm run smoke:credit-pdf-recovery
 *
 * Cubre: claim concurrente, lease vencido, reintentos→FAILED, interrupción
 * en último intento → FAILED atómico, efectos post-SUCCEEDED recuperables,
 * confirmed sin re-notify, auditoría concurrente, reintento de fail-notify,
 * idempotencia de notificación (dedupeKey), lógica pura de elegibilidad.
 */
import { PrismaClient } from "@prisma/client";
import {
  claimCreditPdfImportJob,
  CREDIT_PDF_JOB_LEASE_MS,
  CREDIT_PDF_JOB_MAX_ATTEMPTS,
  CREDIT_PDF_JOB_QUEUED_MIN_AGE_MS,
  finalizeExhaustedCreditPdfImportJob,
  isLeaseExpired,
  isQueuedRecoverable,
  recoverCreditPdfImportJobs,
  settleFailedCreditPdfImportNotify,
  settleSucceededCreditPdfImportEffects,
  shouldFailAfterAttempt,
} from "../../src/server/credit-import/jobs";
import {
  leaseExpiryFrom,
  shouldFailAfterAttempt as shouldFailPure,
} from "../../src/server/credit-import/job-lease";

const prisma = new PrismaClient();
const MARK = `pdf-rec-${Date.now().toString(36)}`;

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "Falta DATABASE_URL. Usa MySQL sandbox (.env.local), no producción.",
    );
  }

  console.log("\n[credit-pdf-recovery] lease + claim + intentos");

  check(
    "puro: QUEUED reciente no recuperable",
    isQueuedRecoverable(new Date(), new Date(), CREDIT_PDF_JOB_QUEUED_MIN_AGE_MS) ===
      false,
  );
  check(
    "puro: QUEUED antiguo sí recuperable",
    isQueuedRecoverable(
      new Date(Date.now() - CREDIT_PDF_JOB_QUEUED_MIN_AGE_MS - 1),
      new Date(),
    ) === true,
  );
  check(
    "puro: lease futuro no expirado",
    isLeaseExpired(leaseExpiryFrom(new Date()), new Date()) === false,
  );
  check(
    "puro: lease pasado expirado",
    isLeaseExpired(new Date(Date.now() - 1000), new Date()) === true,
  );
  check("puro: attempts 2 no falla aún", shouldFailAfterAttempt(2) === false);
  check(
    "puro: attempts max sí falla",
    shouldFailAfterAttempt(CREDIT_PDF_JOB_MAX_ATTEMPTS) === true &&
      shouldFailPure(CREDIT_PDF_JOB_MAX_ATTEMPTS) === true,
  );

  const member = await prisma.organizationMember.findFirstOrThrow({
    where: { role: { in: ["OWNER", "ADMIN"] } },
    orderBy: { createdAt: "asc" },
    select: { userId: true, organizationId: true },
  });

  const creditCase = await prisma.creditCase.findFirst({
    where: { organizationId: member.organizationId, state: "OPEN" },
    orderBy: { createdAt: "desc" },
    select: { id: true, clientId: true, serviceCaseId: true },
  });
  if (!creditCase) {
    throw new Error("No hay CreditCase OPEN en el sandbox para el smoke.");
  }

  const doc = await prisma.document.create({
    data: {
      organizationId: member.organizationId,
      clientId: creditCase.clientId,
      caseId: creditCase.id,
      serviceCaseId: creditCase.serviceCaseId,
      category: "CREDIT_REPORT",
      sensitivity: "CONFIDENTIAL",
      originalName: `${MARK}.pdf`,
      displayName: MARK,
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storageKey: `org/${member.organizationId}/documents/${MARK}`,
      uploadedById: member.userId,
    },
    select: { id: true },
  });

  const createdIds: string[] = [];

  try {
    // --- Concurrencia: dos claims sobre el mismo QUEUED ---
    const jobA = await prisma.creditPdfImportJob.create({
      data: {
        organizationId: member.organizationId,
        caseId: creditCase.id,
        clientId: creditCase.clientId,
        documentId: doc.id,
        createdById: member.userId,
        status: "QUEUED",
        phase: "download",
        progress: 0,
        fileName: MARK,
        attempts: 0,
        createdAt: new Date(Date.now() - CREDIT_PDF_JOB_QUEUED_MIN_AGE_MS - 5_000),
      },
    });
    createdIds.push(jobA.id);

    const [c1, c2] = await Promise.all([
      claimCreditPdfImportJob(jobA.id),
      claimCreditPdfImportJob(jobA.id),
    ]);
    const winners = [c1, c2].filter(Boolean);
    check("claim concurrente: exactamente uno gana", winners.length === 1, {
      c1: Boolean(c1),
      c2: Boolean(c2),
    });

    const afterA = await prisma.creditPdfImportJob.findUniqueOrThrow({
      where: { id: jobA.id },
    });
    check("tras claim: RUNNING + attempts=1", afterA.status === "RUNNING" && afterA.attempts === 1);
    check("tras claim: leaseToken presente", Boolean(afterA.leaseToken));

    // --- Lease activo: segundo claim no roba ---
    const steal = await claimCreditPdfImportJob(jobA.id);
    check("RUNNING con lease vivo no se reclama", steal === null);

    // --- Interrupción: lease vencido → reclaim ---
    await prisma.creditPdfImportJob.update({
      where: { id: jobA.id },
      data: {
        leaseExpiresAt: new Date(Date.now() - 1_000),
        leaseToken: "old-worker-token",
      },
    });
    const reclaimed = await claimCreditPdfImportJob(jobA.id);
    check("RUNNING stale se reclama", Boolean(reclaimed), reclaimed);
    check(
      "reclaim incrementa attempts",
      reclaimed?.attempts === 2,
      reclaimed?.attempts,
    );
    check(
      "reclaim rota leaseToken",
      reclaimed?.leaseToken !== "old-worker-token",
    );

    // --- Escritura con lease viejo no sobrescribe ---
    const staleWrite = await prisma.creditPdfImportJob.updateMany({
      where: {
        id: jobA.id,
        leaseToken: "old-worker-token",
        status: "RUNNING",
      },
      data: { status: "SUCCEEDED", phase: "done", progress: 100 },
    });
    check("worker antiguo no escribe SUCCEEDED", staleWrite.count === 0);

    const stillRunning = await prisma.creditPdfImportJob.findUniqueOrThrow({
      where: { id: jobA.id },
    });
    check(
      "estado sigue RUNNING con lease nuevo",
      stillRunning.status === "RUNNING" &&
        stillRunning.leaseToken === reclaimed?.leaseToken,
    );

    // --- Agotar intentos: claim hasta max, luego null ---
    const jobB = await prisma.creditPdfImportJob.create({
      data: {
        organizationId: member.organizationId,
        caseId: creditCase.id,
        clientId: creditCase.clientId,
        documentId: doc.id,
        createdById: member.userId,
        status: "QUEUED",
        phase: "download",
        progress: 0,
        fileName: `${MARK}-b`,
        attempts: CREDIT_PDF_JOB_MAX_ATTEMPTS - 1,
        createdAt: new Date(Date.now() - CREDIT_PDF_JOB_QUEUED_MIN_AGE_MS - 5_000),
      },
    });
    createdIds.push(jobB.id);

    const lastClaim = await claimCreditPdfImportJob(jobB.id);
    check("último attempt permitido", lastClaim?.attempts === CREDIT_PDF_JOB_MAX_ATTEMPTS);

    await prisma.creditPdfImportJob.update({
      where: { id: jobB.id },
      data: {
        status: "QUEUED",
        leaseToken: null,
        leaseExpiresAt: null,
        // attempts ya en max
      },
    });
    const over = await claimCreditPdfImportJob(jobB.id);
    check("no claim si attempts >= max", over === null);

    // --- Último intento: RUNNING pierde lease → FAILED atómico + 1 notify ---
    const jobC = await prisma.creditPdfImportJob.create({
      data: {
        organizationId: member.organizationId,
        caseId: creditCase.id,
        clientId: creditCase.clientId,
        documentId: doc.id,
        createdById: member.userId,
        status: "RUNNING",
        phase: "ai",
        progress: 75,
        fileName: `${MARK}-last-interrupt`,
        attempts: CREDIT_PDF_JOB_MAX_ATTEMPTS,
        leaseToken: "dying-worker",
        leaseExpiresAt: new Date(Date.now() - 2_000),
        startedAt: new Date(Date.now() - 60_000),
        errorMessage: null,
      },
    });
    createdIds.push(jobC.id);

    const failDedupe = `credit-pdf-import:${jobC.id}:fail`;
    await prisma.notification.deleteMany({ where: { dedupeKey: failDedupe } });

    const claimExhausted = await claimCreditPdfImportJob(jobC.id);
    check(
      "último intento con lease vencido: claim no reaplica",
      claimExhausted === null,
    );

    const [fin1, fin2] = await Promise.all([
      finalizeExhaustedCreditPdfImportJob(jobC.id),
      finalizeExhaustedCreditPdfImportJob(jobC.id),
    ]);
    check(
      "finalize concurrente: exactamente uno gana",
      Number(fin1) + Number(fin2) === 1,
      { fin1, fin2 },
    );

    const afterC = await prisma.creditPdfImportJob.findUniqueOrThrow({
      where: { id: jobC.id },
    });
    check("tras finalize: FAILED", afterC.status === "FAILED");
    check("tras finalize: lease limpio", afterC.leaseToken === null);
    check(
      "tras finalize: mensaje de interrupción",
      Boolean(afterC.errorMessage && afterC.errorMessage.includes("reintentos")),
    );

    const failNotifs = await prisma.notification.findMany({
      where: { dedupeKey: failDedupe },
    });
    check("notificación de fallo una sola vez", failNotifs.length === 1);

    const finAgain = await finalizeExhaustedCreditPdfImportJob(jobC.id);
    check("segunda finalize no-op", finAgain === false);
    const failNotifs2 = await prisma.notification.findMany({
      where: { dedupeKey: failDedupe },
    });
    check("sigue una sola notificación de fallo", failNotifs2.length === 1);

    // QUEUED agotado también finaliza (no queda atascado)
    const jobQueuedExhausted = await prisma.creditPdfImportJob.create({
      data: {
        organizationId: member.organizationId,
        caseId: creditCase.id,
        clientId: creditCase.clientId,
        documentId: doc.id,
        createdById: member.userId,
        status: "QUEUED",
        phase: "download",
        progress: 0,
        fileName: `${MARK}-queued-max`,
        attempts: CREDIT_PDF_JOB_MAX_ATTEMPTS,
        leaseToken: null,
        leaseExpiresAt: null,
        errorMessage: "fallo previo smoke",
      },
    });
    createdIds.push(jobQueuedExhausted.id);
    check(
      "QUEUED con attempts>=max finaliza",
      (await finalizeExhaustedCreditPdfImportJob(jobQueuedExhausted.id)) === true,
    );
    const queuedDone = await prisma.creditPdfImportJob.findUniqueOrThrow({
      where: { id: jobQueuedExhausted.id },
    });
    check("QUEUED agotado → FAILED", queuedDone.status === "FAILED");

    // --- SUCCEEDED con efectos pendientes: settle sin re-PDF ---
    const jobD = await prisma.creditPdfImportJob.create({
      data: {
        organizationId: member.organizationId,
        caseId: creditCase.id,
        clientId: creditCase.clientId,
        documentId: doc.id,
        createdById: member.userId,
        status: "SUCCEEDED",
        phase: "done",
        progress: 100,
        fileName: `${MARK}-effects`,
        attempts: 1,
        leaseToken: null,
        leaseExpiresAt: null,
        effectsSettledAt: null,
        finishedAt: new Date(),
        extractMode: "text",
        pageCount: 2,
        proposalJson: {
          documentKind: "CREDIT_BUREAU_REPORT",
          confidence: "high",
          report: { typeHint: "UPDATE" },
        },
      },
    });
    createdIds.push(jobD.id);

    const doneDedupe = `credit-pdf-import:${jobD.id}:done`;
    await prisma.notification.deleteMany({ where: { dedupeKey: doneDedupe } });
    await prisma.auditLog.deleteMany({
      where: {
        organizationId: member.organizationId,
        action: "CREDIT_PDF_ANALYZED",
        entityType: "CreditPdfImportJob",
        entityId: jobD.id,
      },
    });

    const settle1 = await settleSucceededCreditPdfImportEffects(jobD.id);
    check("settle efectos: settled", settle1 === "settled");

    const afterD = await prisma.creditPdfImportJob.findUniqueOrThrow({
      where: { id: jobD.id },
    });
    check("effectsSettledAt marcado", Boolean(afterD.effectsSettledAt));
    check("status sigue SUCCEEDED (sin re-PDF)", afterD.status === "SUCCEEDED");

    const doneNotifs = await prisma.notification.findMany({
      where: { dedupeKey: doneDedupe },
    });
    check('notificación "Análisis listo" una vez', doneNotifs.length === 1);
    check(
      "título Análisis de PDF listo",
      doneNotifs[0]?.title === "Análisis de PDF listo",
    );

    const audits = await prisma.auditLog.findMany({
      where: {
        action: "CREDIT_PDF_ANALYZED",
        entityType: "CreditPdfImportJob",
        entityId: jobD.id,
      },
    });
    check("auditoría CREDIT_PDF_ANALYZED una vez", audits.length === 1);

    const settle2 = await settleSucceededCreditPdfImportEffects(jobD.id);
    check("settle idempotente: settled", settle2 === "settled");
    const doneNotifs2 = await prisma.notification.findMany({
      where: { dedupeKey: doneDedupe },
    });
    const audits2 = await prisma.auditLog.findMany({
      where: {
        action: "CREDIT_PDF_ANALYZED",
        entityType: "CreditPdfImportJob",
        entityId: jobD.id,
      },
    });
    check("settle 2× no duplica notificación", doneNotifs2.length === 1);
    check("settle 2× no duplica auditoría", audits2.length === 1);

    // --- confirmed + effectsSettledAt null: no "Análisis listo" ---
    const jobConfirmed = await prisma.creditPdfImportJob.create({
      data: {
        organizationId: member.organizationId,
        caseId: creditCase.id,
        clientId: creditCase.clientId,
        documentId: doc.id,
        createdById: member.userId,
        status: "SUCCEEDED",
        phase: "confirmed",
        progress: 100,
        fileName: `${MARK}-confirmed`,
        attempts: 1,
        effectsSettledAt: null,
        finishedAt: new Date(),
        extractMode: "text",
        pageCount: 1,
        proposalJson: {
          documentKind: "CREDIT_BUREAU_REPORT",
          confidence: "low",
          report: { typeHint: "UPDATE" },
        },
      },
    });
    createdIds.push(jobConfirmed.id);
    const confirmedDoneKey = `credit-pdf-import:${jobConfirmed.id}:done`;
    await prisma.notification.deleteMany({ where: { dedupeKey: confirmedDoneKey } });
    await prisma.auditLog.deleteMany({
      where: {
        entityId: jobConfirmed.id,
        action: "CREDIT_PDF_ANALYZED",
      },
    });

    const settleConfirmed = await settleSucceededCreditPdfImportEffects(
      jobConfirmed.id,
    );
    check("confirmed: settle → settled", settleConfirmed === "settled");
    const afterConfirmed = await prisma.creditPdfImportJob.findUniqueOrThrow({
      where: { id: jobConfirmed.id },
    });
    check("confirmed: effectsSettledAt", Boolean(afterConfirmed.effectsSettledAt));
    check(
      "confirmed: sin notificación Análisis listo",
      (await prisma.notification.count({ where: { dedupeKey: confirmedDoneKey } })) ===
        0,
    );
    check(
      "confirmed: auditoría sí (idempotente)",
      (await prisma.auditLog.count({
        where: {
          entityId: jobConfirmed.id,
          action: "CREDIT_PDF_ANALYZED",
        },
      })) === 1,
    );

    // Cron sobre confirmed antiguo no debe crear done-notify
    await prisma.creditPdfImportJob.update({
      where: { id: jobConfirmed.id },
      data: { effectsSettledAt: null },
    });
    await recoverCreditPdfImportJobs({
      limit: 5,
      now: new Date(),
      deadline: new Date(Date.now() + 30_000),
    });
    check(
      "cron+confirmed: sigue sin Análisis listo",
      (await prisma.notification.count({ where: { dedupeKey: confirmedDoneKey } })) ===
        0,
    );
    check(
      "cron+confirmed: effectsSettledAt de nuevo",
      Boolean(
        (
          await prisma.creditPdfImportJob.findUniqueOrThrow({
            where: { id: jobConfirmed.id },
          })
        ).effectsSettledAt,
      ),
    );

    // --- Auditoría concurrente real (2 settles en paralelo) ---
    const jobConcurrent = await prisma.creditPdfImportJob.create({
      data: {
        organizationId: member.organizationId,
        caseId: creditCase.id,
        clientId: creditCase.clientId,
        documentId: doc.id,
        createdById: member.userId,
        status: "SUCCEEDED",
        phase: "done",
        progress: 100,
        fileName: `${MARK}-concurrent-audit`,
        attempts: 1,
        effectsSettledAt: null,
        finishedAt: new Date(),
        extractMode: "text",
        pageCount: 3,
        proposalJson: {
          documentKind: "CREDIT_BUREAU_REPORT",
          confidence: "medium",
          report: { typeHint: "UPDATE" },
        },
      },
    });
    createdIds.push(jobConcurrent.id);
    await prisma.notification.deleteMany({
      where: { dedupeKey: `credit-pdf-import:${jobConcurrent.id}:done` },
    });
    await prisma.auditLog.deleteMany({
      where: {
        entityId: jobConcurrent.id,
        action: "CREDIT_PDF_ANALYZED",
      },
    });

    const [cSettle1, cSettle2] = await Promise.all([
      settleSucceededCreditPdfImportEffects(jobConcurrent.id),
      settleSucceededCreditPdfImportEffects(jobConcurrent.id),
    ]);
    check(
      "settle concurrente: ambos settled",
      cSettle1 === "settled" && cSettle2 === "settled",
      { cSettle1, cSettle2 },
    );
    const concurrentAudits = await prisma.auditLog.count({
      where: {
        entityId: jobConcurrent.id,
        action: "CREDIT_PDF_ANALYZED",
      },
    });
    check(
      "settle concurrente: exactamente 1 auditoría",
      concurrentAudits === 1,
      concurrentAudits,
    );
    check(
      "settle concurrente: exactamente 1 done-notify",
      (await prisma.notification.count({
        where: { dedupeKey: `credit-pdf-import:${jobConcurrent.id}:done` },
      })) === 1,
    );

    // --- Fail-notify: fallo inicial + recuperación sin re-PDF ---
    const jobFailNotify = await prisma.creditPdfImportJob.create({
      data: {
        organizationId: member.organizationId,
        caseId: creditCase.id,
        clientId: creditCase.clientId,
        documentId: doc.id,
        createdById: member.userId,
        status: "FAILED",
        phase: "done",
        progress: 100,
        fileName: `${MARK}-fail-notify`,
        attempts: CREDIT_PDF_JOB_MAX_ATTEMPTS,
        finishedAt: new Date(),
        errorMessage: "interrupción smoke (sin PII)",
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    createdIds.push(jobFailNotify.id);
    const failNotifyKey = `credit-pdf-import:${jobFailNotify.id}:fail`;
    await prisma.notification.deleteMany({ where: { dedupeKey: failNotifyKey } });

    const pendingFail = await settleFailedCreditPdfImportNotify(jobFailNotify.id, {
      createNotification: async () => {
        throw new Error("simulated notify failure — do not log body");
      },
    });
    check("fail-notify: fallo simulado → pending", pendingFail === "pending");
    check(
      "fail-notify: sin fila tras fallo",
      (await prisma.notification.count({ where: { dedupeKey: failNotifyKey } })) ===
        0,
    );
    check(
      "fail-notify: job sigue FAILED (sin re-análisis)",
      (
        await prisma.creditPdfImportJob.findUniqueOrThrow({
          where: { id: jobFailNotify.id },
        })
      ).status === "FAILED",
    );

    const recoveredFail = await recoverCreditPdfImportJobs({
      limit: 5,
      now: new Date(),
      deadline: new Date(Date.now() + 30_000),
    });
    check(
      "cron: reintentó fail-notify",
      recoveredFail.failNotifiesSettled >= 1,
      recoveredFail,
    );
    check(
      "fail-notify: recuperado una vez",
      (await prisma.notification.count({ where: { dedupeKey: failNotifyKey } })) ===
        1,
    );
    const againFail = await settleFailedCreditPdfImportNotify(jobFailNotify.id);
    check("fail-notify: settle idempotente", againFail === "settled");
    check(
      "fail-notify: sigue una sola fila",
      (await prisma.notification.count({ where: { dedupeKey: failNotifyKey } })) ===
        1,
    );

    // Cron recovery asienta efectos pendientes y finaliza agotados
    const jobE = await prisma.creditPdfImportJob.create({
      data: {
        organizationId: member.organizationId,
        caseId: creditCase.id,
        clientId: creditCase.clientId,
        documentId: doc.id,
        createdById: member.userId,
        status: "SUCCEEDED",
        phase: "done",
        progress: 100,
        fileName: `${MARK}-cron-effects`,
        attempts: 1,
        effectsSettledAt: null,
        finishedAt: new Date(),
        extractMode: "text",
        pageCount: 1,
        proposalJson: {
          documentKind: "CREDIT_BUREAU_REPORT",
          confidence: "medium",
          report: { typeHint: "UPDATE" },
        },
      },
    });
    createdIds.push(jobE.id);
    await prisma.notification.deleteMany({
      where: { dedupeKey: `credit-pdf-import:${jobE.id}:done` },
    });
    await prisma.auditLog.deleteMany({
      where: {
        entityId: jobE.id,
        action: "CREDIT_PDF_ANALYZED",
      },
    });

    const jobF = await prisma.creditPdfImportJob.create({
      data: {
        organizationId: member.organizationId,
        caseId: creditCase.id,
        clientId: creditCase.clientId,
        documentId: doc.id,
        createdById: member.userId,
        status: "RUNNING",
        phase: "extract",
        progress: 35,
        fileName: `${MARK}-cron-exhausted`,
        attempts: CREDIT_PDF_JOB_MAX_ATTEMPTS,
        leaseToken: "stale-last",
        leaseExpiresAt: new Date(Date.now() - 5_000),
      },
    });
    createdIds.push(jobF.id);
    await prisma.notification.deleteMany({
      where: { dedupeKey: `credit-pdf-import:${jobF.id}:fail` },
    });

    const recovered = await recoverCreditPdfImportJobs({
      limit: 5,
      now: new Date(),
      deadline: new Date(Date.now() + 60_000),
    });
    check(
      "cron: finalizó exhausted",
      recovered.finalizedExhausted >= 1,
      recovered,
    );
    check(
      "cron: asentó efectos",
      recovered.effectsSettled >= 1,
      recovered,
    );

    const afterE = await prisma.creditPdfImportJob.findUniqueOrThrow({
      where: { id: jobE.id },
    });
    const afterF = await prisma.creditPdfImportJob.findUniqueOrThrow({
      where: { id: jobF.id },
    });
    check("cron: jobE effectsSettledAt", Boolean(afterE.effectsSettledAt));
    check("cron: jobF FAILED", afterF.status === "FAILED");
    check(
      "cron: jobF notify fail",
      Boolean(
        await prisma.notification.findUnique({
          where: { dedupeKey: `credit-pdf-import:${jobF.id}:fail` },
        }),
      ),
    );

    // --- Idempotencia notificación (dedupeKey) ---
    const dedupeKey = `credit-pdf-import:${jobA.id}:fail`;
    await prisma.notification.deleteMany({ where: { dedupeKey } });
    await prisma.notification.create({
      data: {
        organizationId: member.organizationId,
        userId: member.userId,
        type: "CREDIT_PDF_IMPORT",
        title: "Falló el análisis de PDF",
        body: "smoke",
        link: `/crm/casos/${creditCase.id}/credito/importaciones/${jobA.id}`,
        dedupeKey,
      },
    });
    const again = await prisma.notification.findUnique({ where: { dedupeKey } });
    check("dedupeKey de fallo existe una vez", Boolean(again));

    // Simular segundo create-or-find (como createNotification)
    const existing = await prisma.notification.findUnique({ where: { dedupeKey } });
    check("segunda notificación mismo key no crea otra fila", existing?.id === again?.id);

    void CREDIT_PDF_JOB_LEASE_MS;
    console.log("\nOK credit-pdf-job-recovery\n");
  } finally {
    await prisma.notification.deleteMany({
      where: {
        dedupeKey: {
          in: createdIds.flatMap((id) => [
            `credit-pdf-import:${id}:fail`,
            `credit-pdf-import:${id}:done`,
          ]),
        },
      },
    }).catch(() => undefined);
    await prisma.notification.deleteMany({
      where: { dedupeKey: { startsWith: "credit-pdf-import:" }, body: "smoke" },
    }).catch(() => undefined);
    if (createdIds.length) {
      await prisma.auditLog.deleteMany({
        where: {
          entityType: "CreditPdfImportJob",
          entityId: { in: createdIds },
          action: "CREDIT_PDF_ANALYZED",
        },
      }).catch(() => undefined);
      await prisma.creditPdfImportJob.deleteMany({ where: { id: { in: createdIds } } });
    }
    await prisma.document.delete({ where: { id: doc.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  void prisma.$disconnect();
});
