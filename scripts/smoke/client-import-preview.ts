/**
 * PR-CL-IMPORT — preview no escribe; commit solo crea filas `create`.
 *
 *   npm run smoke:client-import
 *
 * Requiere DATABASE_URL (sandbox).
 */
import { PrismaClient } from "@prisma/client";
import { DomainError } from "../../src/server/errors";
import {
  assertImportFileMeta,
  assertLooksLikeCsvText,
} from "../../src/server/clients/import-csv";
import {
  commitClientImport,
  previewClientImport,
} from "../../src/server/clients/import-preview";
import type { OrganizationContext } from "../../src/server/auth/guards";

const prisma = new PrismaClient();
const MARK = "CL-IMPORT";

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

  console.log("\n[PR-CL-IMPORT] preview + commit CSV");

  try {
    assertImportFileMeta("clientes.xlsx", "application/vnd.ms-excel");
    check("xlsx no debería pasar", false);
  } catch (error) {
    check(
      "xlsx → DomainError",
      error instanceof DomainError &&
        /Solo se admiten archivos CSV/i.test(error.message),
    );
  }

  try {
    assertLooksLikeCsvText("PK\u0003\u0004fake-xlsx");
    check("zip magic no debería pasar", false);
  } catch (error) {
    check(
      "payload tipo xlsx → DomainError",
      error instanceof DomainError,
    );
  }

  const member = await prisma.organizationMember.findFirstOrThrow({
    where: { role: { in: ["OWNER", "ADMIN"] } },
    orderBy: { createdAt: "asc" },
    select: { userId: true, organizationId: true, role: true },
  });

  await prisma.organizationSettings.upsert({
    where: { organizationId: member.organizationId },
    create: { organizationId: member.organizationId },
    update: {},
  });

  const ctx: OrganizationContext = {
    userId: member.userId,
    organizationId: member.organizationId,
    role: member.role,
  };

  const stamp = Date.now();
  const seedEmail = `cl-import-seed-${stamp}@example.com`;
  const newEmail = `cl-import-new-${stamp}@example.com`;

  const seed = await prisma.client.create({
    data: {
      organizationId: member.organizationId,
      clientCode: `TMP-${stamp.toString(36).slice(-6)}`,
      firstName: MARK,
      lastName: "Seed",
      email: seedEmail,
      status: "LEAD",
      assignedToId: member.userId,
    },
    select: { id: true },
  });

  const baseline = await prisma.client.count({
    where: { organizationId: member.organizationId },
  });

  const csv = [
    "firstName,lastName,email",
    `Nuevo,Import,${newEmail}`,
    `Dup,Seed,${seedEmail}`,
    "Sin,Correo,",
  ].join("\n");

  const createdIds: string[] = [];

  try {
    const preview = await previewClientImport(ctx, csv);
    check("preview create === 1", preview.counts.create === 1, preview.counts);
    check("preview exists === 1", preview.counts.exists === 1, preview.counts);
    check(
      "preview no_email === 1",
      preview.counts.no_email === 1,
      preview.counts,
    );

    const afterPreview = await prisma.client.count({
      where: { organizationId: member.organizationId },
    });
    check("preview no escribe", afterPreview === baseline);

    const commit = await commitClientImport(ctx, csv);
    createdIds.push(...commit.createdClientIds);
    check("commit created === 1", commit.created === 1, commit);

    const seedCount = await prisma.client.count({
      where: {
        organizationId: member.organizationId,
        email: seedEmail,
      },
    });
    check("email seed sigue único", seedCount === 1);

    const newCount = await prisma.client.count({
      where: {
        organizationId: member.organizationId,
        email: newEmail,
      },
    });
    check("cliente nuevo creado", newCount === 1);
  } finally {
    const ids = [seed.id, ...createdIds];
    if (ids.length > 0) {
      await prisma.activityLog.deleteMany({
        where: { clientId: { in: ids } },
      });
      await prisma.client.deleteMany({ where: { id: { in: ids } } });
    }
  }

  console.log("\nOK client-import-preview\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
