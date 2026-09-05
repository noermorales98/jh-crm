/**
 * Smoke SPRINT 6 — MFA TOTP + retención de documentos.
 *
 *   npm run smoke:sprint6
 *
 * Cron retención: GET /api/cron/retention
 * Header: Authorization: Bearer $CRON_SECRET
 */
import { PrismaClient } from "@prisma/client";
import { TOTP, Secret } from "otpauth";
import type { OrganizationContext } from "../../src/server/auth/guards";
import {
  beginMfaSetup,
  confirmMfaSetup,
  disableMfa,
  isMfaRequired,
  verifyMfaLogin,
} from "../../src/server/mfa";
import { purgeDueDocuments } from "../../src/server/retention";
import { softDeleteDocument, hardDeleteDocument } from "../../src/server/documents";
import * as clients from "../../src/server/clients";

const prisma = new PrismaClient();
const MARK = "S6-SMOKE";
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

function totpNow(base32: string): string {
  return new TOTP({
    secret: Secret.fromBase32(base32),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  }).generate();
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

  let clientId: string | null = null;
  let documentId: string | null = null;

  try {
    console.log("\n[1] isMfaRequired roles");
    check("OWNER required", isMfaRequired("OWNER"));
    check("STAFF not required", !isMfaRequired("STAFF"));

    console.log("\n[2] MFA setup → confirm → verify → disable");
    // Asegurar estado limpio
    await prisma.user.update({
      where: { id: owner.userId },
      data: {
        mfaEnabled: false,
        mfaSecretEncrypted: null,
        mfaRecoveryCodesEncrypted: null,
        mfaVerifiedAt: null,
        mfaFailedAttempts: 0,
        mfaLockedUntil: null,
      },
    });

    const setup = await beginMfaSetup(owner.userId);
    check("secret base32", setup.secret.length >= 16);
    check("otpauthUri", setup.otpauthUri.startsWith("otpauth://totp/"));
    check("10 recovery codes", setup.recoveryCodes.length === 10);

    const code = totpNow(setup.secret);
    await confirmMfaSetup(owner.userId, code);
    const enabled = await prisma.user.findUniqueOrThrow({
      where: { id: owner.userId },
      select: { mfaEnabled: true },
    });
    check("mfaEnabled after confirm", enabled.mfaEnabled);

    const loginOk = await verifyMfaLogin(owner.userId, totpNow(setup.secret));
    check("verifyMfaLogin TOTP", loginOk);

    const recoveryOk = await verifyMfaLogin(owner.userId, setup.recoveryCodes[0]);
    check("verifyMfaLogin recovery", recoveryOk);

    await disableMfa(owner.userId, setup.recoveryCodes[1]);
    const disabled = await prisma.user.findUniqueOrThrow({
      where: { id: owner.userId },
      select: { mfaEnabled: true, mfaSecretEncrypted: true },
    });
    check("mfa disabled", !disabled.mfaEnabled && !disabled.mfaSecretEncrypted);

    console.log("\n[3] Retención — soft delete con purgeAfter + purgeDueDocuments");
    await prisma.organizationSettings.update({
      where: { organizationId: org.id },
      data: { documentSoftDeleteRetentionDays: 1 },
    });

    const client = await clients.createClient(ctx, {
      firstName: `${MARK} Ana`,
      lastName: "Docs",
      email: `s6-smoke-${Date.now()}@example.com`,
      phone: "3125550606",
      addressLine1: "100 Retention St",
      city: "Houston",
      state: "TX",
      postalCode: "77002",
    });
    clientId = client.id;

    const doc = await prisma.document.create({
      data: {
        organizationId: org.id,
        clientId: client.id,
        category: "OTHER",
        sensitivity: "INTERNAL",
        originalName: `${MARK}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 12,
        storageKey: `org/${org.id}/documents/s6-smoke-${Date.now()}`,
        uploadedById: owner.userId,
      },
    });
    documentId = doc.id;

    await softDeleteDocument(ctx, doc.id);
    const soft = await prisma.document.findUniqueOrThrow({
      where: { id: doc.id },
      select: { deletedAt: true, purgeAfter: true, hardDeletedAt: true },
    });
    check("soft deletedAt set", soft.deletedAt !== null);
    check("purgeAfter set", soft.purgeAfter !== null);
    check("not hard-deleted yet", soft.hardDeletedAt === null);

    // Forzar vencimiento
    await prisma.document.update({
      where: { id: doc.id },
      data: { purgeAfter: new Date(Date.now() - 60_000) },
    });

    const purge = await purgeDueDocuments();
    check("purge scanned >= 1", purge.scanned >= 1, purge);
    check("purge purged >= 1", purge.purged >= 1, purge);

    const hard = await prisma.document.findUniqueOrThrow({
      where: { id: doc.id },
      select: { hardDeletedAt: true, storageKey: true },
    });
    check("hardDeletedAt set", hard.hardDeletedAt !== null);
    check("storageKey purged marker", hard.storageKey.startsWith("purged/"));

    // Idempotencia: el mismo documento no vuelve a purgarse
    const before = hard.hardDeletedAt!.getTime();
    await purgeDueDocuments();
    const after = await prisma.document.findUniqueOrThrow({
      where: { id: doc.id },
      select: { hardDeletedAt: true },
    });
    check(
      "second purge leaves hardDeletedAt unchanged",
      after.hardDeletedAt?.getTime() === before,
    );

    console.log("\n[4] hardDeleteDocument permission path (settings.manage)");
    const doc2 = await prisma.document.create({
      data: {
        organizationId: org.id,
        clientId: client.id,
        category: "OTHER",
        sensitivity: "INTERNAL",
        originalName: `${MARK}-manual.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 8,
        storageKey: `org/${org.id}/documents/s6-smoke-manual-${Date.now()}`,
        uploadedById: owner.userId,
      },
    });
    await hardDeleteDocument(ctx, doc2.id);
    const manual = await prisma.document.findUniqueOrThrow({
      where: { id: doc2.id },
      select: { hardDeletedAt: true },
    });
    check("manual hard delete", manual.hardDeletedAt !== null);
  } finally {
    if (documentId) {
      await prisma.activityLog.deleteMany({
        where: { metadata: { path: "$.documentId", equals: documentId } },
      }).catch(() => {});
    }
    if (clientId) {
      await prisma.activityLog.deleteMany({ where: { clientId } });
      await prisma.auditLog.deleteMany({
        where: { organizationId: org.id, entityType: "Document" },
      }).catch(() => {});
      await prisma.document.deleteMany({ where: { clientId } });
      await prisma.client.delete({ where: { id: clientId } }).catch(() => {});
    }
    await prisma.organizationSettings.update({
      where: { organizationId: org.id },
      data: { documentSoftDeleteRetentionDays: null },
    }).catch(() => {});
    await prisma.user.update({
      where: { id: owner.userId },
      data: {
        mfaEnabled: false,
        mfaSecretEncrypted: null,
        mfaRecoveryCodesEncrypted: null,
        mfaVerifiedAt: null,
        mfaFailedAttempts: 0,
        mfaLockedUntil: null,
      },
    }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nResultado: ${passed} ok, ${failed} fallos`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
