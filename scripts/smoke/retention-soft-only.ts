/**
 * PR-SEC-RET — el cron solo purga papelera (purgeAfter), no documentos vivos.
 *
 *   npm run smoke:retention-soft
 *
 * Requiere DATABASE_URL (sandbox). No apunta a producción a propósito.
 */
import { PrismaClient } from "@prisma/client";
import { purgeDueDocuments } from "../../src/server/retention";

const prisma = new PrismaClient();
const MARK = "RET-SOFT-SMOKE";

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
      "Falta DATABASE_URL. Este smoke requiere MySQL sandbox (.env.local).",
    );
  }

  console.log("\n[PR-SEC-RET] retención solo papelera");

  const org = await prisma.organization.findFirstOrThrow({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  const owner = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: org.id, role: { in: ["OWNER", "ADMIN"] } },
    select: { userId: true },
  });

  await prisma.organizationSettings.upsert({
    where: { organizationId: org.id },
    create: {
      organizationId: org.id,
      documentMaxRetentionDays: 1,
      documentSoftDeleteRetentionDays: 30,
    },
    update: { documentMaxRetentionDays: 1 },
  });

  const client = await prisma.client.create({
    data: {
      organizationId: org.id,
      clientCode: `TMP-${Date.now().toString(36).slice(-6)}`,
      firstName: MARK,
      lastName: "Live",
      email: `ret-soft-${Date.now()}@example.com`,
      phone: "4695550199",
      status: "LEAD",
      assignedToId: owner.userId,
    },
    select: { id: true },
  });

  const oldCreatedAt = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);

  const liveDoc = await prisma.document.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      category: "OTHER",
      sensitivity: "INTERNAL",
      originalName: `${MARK}-live.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      storageKey: `org/${org.id}/documents/${MARK}-live-${Date.now()}`,
      uploadedById: owner.userId,
      createdAt: oldCreatedAt,
    },
    select: { id: true },
  });

  const trashDoc = await prisma.document.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      category: "OTHER",
      sensitivity: "INTERNAL",
      originalName: `${MARK}-trash.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      storageKey: `org/${org.id}/documents/${MARK}-trash-${Date.now()}`,
      uploadedById: owner.userId,
      deletedAt: new Date(Date.now() - 120_000),
      purgeAfter: new Date(Date.now() - 60_000),
    },
    select: { id: true },
  });

  try {
    const purge = await purgeDueDocuments();
    check("purge ran", purge.errors === 0, purge);

    const liveAfter = await prisma.document.findUniqueOrThrow({
      where: { id: liveDoc.id },
      select: { hardDeletedAt: true, deletedAt: true, storageKey: true },
    });
    check(
      "documento vivo antiguo NO hard-deleted",
      liveAfter.hardDeletedAt === null && liveAfter.deletedAt === null,
      liveAfter,
    );
    check(
      "storageKey vivo intacto",
      !liveAfter.storageKey.startsWith("purged/"),
    );

    const trashAfter = await prisma.document.findUniqueOrThrow({
      where: { id: trashDoc.id },
      select: { hardDeletedAt: true, storageKey: true },
    });
    check("papelera vencida sí hard-deleted", trashAfter.hardDeletedAt !== null);
    check(
      "storageKey papelera marcado purged/",
      trashAfter.storageKey.startsWith("purged/"),
    );

    const before = trashAfter.hardDeletedAt!.getTime();
    await purgeDueDocuments();
    const trashAgain = await prisma.document.findUniqueOrThrow({
      where: { id: trashDoc.id },
      select: { hardDeletedAt: true },
    });
    check(
      "segunda corrida idempotente",
      trashAgain.hardDeletedAt?.getTime() === before,
    );
  } finally {
    await prisma.document.deleteMany({
      where: { id: { in: [liveDoc.id, trashDoc.id] } },
    });
    await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log("\nOK retention-soft-only\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  void prisma.$disconnect();
});
