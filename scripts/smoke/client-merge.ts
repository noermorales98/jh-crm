/**
 * PR-CL-MERGE — unir expedientes: CreditReport pasa al destino; origen ARCHIVED.
 *
 *   npm run smoke:client-merge
 */
import { PrismaClient } from "@prisma/client";
import { DomainError } from "../../src/server/errors";
import { createCreditCase } from "../../src/server/cases";
import { createCreditReport } from "../../src/server/credit-reports";
import { mergeClients } from "../../src/server/clients/merge";
import type { OrganizationContext } from "../../src/server/auth/guards";

const prisma = new PrismaClient();
const MARK = "CL-MERGE";

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

  console.log("\n[PR-CL-MERGE] unir expedientes");

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
  const source = await prisma.client.create({
    data: {
      organizationId: member.organizationId,
      clientCode: `TMS-${stamp.toString(36).slice(-5)}`,
      firstName: MARK,
      lastName: "Origen",
      email: `cl-merge-src-${stamp}@example.com`,
      status: "LEAD",
      assignedToId: member.userId,
    },
  });
  const dest = await prisma.client.create({
    data: {
      organizationId: member.organizationId,
      clientCode: `TMD-${stamp.toString(36).slice(-5)}`,
      firstName: "Destino",
      lastName: "Merge",
      email: `cl-merge-dst-${stamp}@example.com`,
      status: "ACTIVE",
      assignedToId: member.userId,
    },
  });

  let reportId: string | null = null;
  let caseId: string | null = null;

  try {
    try {
      await mergeClients(ctx, {
        sourceClientId: source.id,
        destinationClientId: source.id,
        confirmDestinationName: "Destino Merge",
      });
      check("mismo id no debería pasar", false);
    } catch (error) {
      check(
        "mismo id → DomainError",
        error instanceof DomainError &&
          /mismo cliente/i.test(error.message),
      );
    }

    try {
      await mergeClients(ctx, {
        sourceClientId: source.id,
        destinationClientId: dest.id,
        confirmDestinationName: "Nombre Incorrecto",
      });
      check("nombre incorrecto no debería pasar", false);
    } catch (error) {
      check(
        "nombre incorrecto → DomainError",
        error instanceof DomainError &&
          /confirmación no coincide/i.test(error.message),
      );
    }

    const otherOrg = await prisma.organization.findFirst({
      where: { id: { not: member.organizationId } },
      select: { id: true },
    });
    if (otherOrg) {
      const foreign = await prisma.client.create({
        data: {
          organizationId: otherOrg.id,
          clientCode: `TMF-${stamp.toString(36).slice(-5)}`,
          firstName: "Otra",
          lastName: "Org",
          status: "LEAD",
        },
      });
      try {
        await mergeClients(ctx, {
          sourceClientId: source.id,
          destinationClientId: foreign.id,
          confirmDestinationName: "Otra Org",
        });
        check("otra org no debería pasar", false);
      } catch (error) {
        check(
          "otra org → DomainError",
          error instanceof DomainError,
        );
      }
      await prisma.client.delete({ where: { id: foreign.id } }).catch(() => {});
    } else {
      console.log("  · sin segunda org; skip cross-org");
    }

    const stage = await prisma.workflowStage.findFirst({
      where: { organizationId: member.organizationId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    if (!stage) throw new Error("No hay workflow stage en la org.");

    const creditCase = await createCreditCase(ctx, {
      clientId: source.id,
      stageId: stage.id,
      summary: `${MARK} smoke`,
    });
    caseId = creditCase.id;

    const report = await createCreditReport(ctx, {
      caseId: creditCase.id,
      type: "INITIAL",
      reportDate: new Date("2026-01-15"),
      provider: "Smoke",
      snapshots: [{ bureau: "EXPERIAN", score: 600 }],
    });
    reportId = report.id;

    const destReportsBefore = await prisma.creditReport.count({
      where: { clientId: dest.id },
    });
    check("destino sin reportes", destReportsBefore === 0);

    await mergeClients(ctx, {
      sourceClientId: source.id,
      destinationClientId: dest.id,
      confirmDestinationName: "Destino Merge",
    });

    const moved = await prisma.creditReport.findUniqueOrThrow({
      where: { id: report.id },
      select: { clientId: true },
    });
    check("reporte en destino", moved.clientId === dest.id);

    const sourceAfter = await prisma.client.findUniqueOrThrow({
      where: { id: source.id },
      select: { status: true, archivedAt: true },
    });
    check("origen ARCHIVED", sourceAfter.status === "ARCHIVED");
    check("origen con archivedAt", sourceAfter.archivedAt != null);

    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: member.organizationId,
        action: "CLIENT_MERGED",
        entityId: dest.id,
      },
      orderBy: { createdAt: "desc" },
    });
    check("AuditLog CLIENT_MERGED", Boolean(audit));
  } finally {
    if (reportId) {
      await prisma.creditBureauSnapshot
        .deleteMany({ where: { reportId } })
        .catch(() => {});
      await prisma.creditItem
        .deleteMany({ where: { reportId } })
        .catch(() => {});
      await prisma.creditReport.delete({ where: { id: reportId } }).catch(() => {});
    }
    if (caseId) {
      await prisma.creditCase.delete({ where: { id: caseId } }).catch(() => {});
    }
    await prisma.activityLog
      .deleteMany({
        where: { clientId: { in: [source.id, dest.id] } },
      })
      .catch(() => {});
    await prisma.auditLog
      .deleteMany({
        where: {
          organizationId: member.organizationId,
          action: "CLIENT_MERGED",
          entityId: dest.id,
        },
      })
      .catch(() => {});
    await prisma.client.deleteMany({
      where: { id: { in: [source.id, dest.id] } },
    }).catch(() => {});
  }

  console.log("\nOK client-merge\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
