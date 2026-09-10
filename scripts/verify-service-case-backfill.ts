/**
 * Verifica backfill ARC-003/004 (MIGRATION_PLAN §6).
 *
 * Uso: npx tsx --env-file=.env.local scripts/verify-service-case-backfill.ts
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const failures: string[] = [];

  try {
    const [
      creditCases,
      serviceCases,
      notes,
      stageHistory,
      stagesWithoutService,
      creditWithoutSc,
      orphanSc,
      wonMismatch,
    ] = await Promise.all([
      prisma.creditCase.count(),
      prisma.serviceCase.count(),
      prisma.note.count(),
      prisma.serviceCaseStageHistory.count(),
      prisma.workflowStage.count({ where: { serviceId: "" } }).catch(() => 0),
      prisma.creditCase.count({ where: { serviceCaseId: null as unknown as string } }).catch(() => 0),
      prisma.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*) AS c FROM ServiceCase sc
        LEFT JOIN CreditCase cc ON cc.serviceCaseId = sc.id
        LEFT JOIN Service s ON s.id = sc.serviceId
        WHERE s.code = 'CREDIT_REPAIR' AND cc.id IS NULL
      `,
      prisma.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*) AS c FROM Opportunity o
        INNER JOIN CreditCase cc ON cc.id = o.wonCaseId
        WHERE o.wonServiceCaseId IS NULL
           OR o.wonServiceCaseId <> cc.serviceCaseId
      `,
    ]);

    const stagesNullService = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM WorkflowStage WHERE serviceId IS NULL
    `;
    const creditNullSc = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM CreditCase WHERE serviceCaseId IS NULL
    `;
    const stageServiceMismatch = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c
      FROM ServiceCase sc
      INNER JOIN WorkflowStage ws ON ws.id = sc.stageId
      WHERE ws.serviceId <> sc.serviceId
    `;
    const creditRepairSc = await prisma.serviceCase.count({
      where: { service: { code: "CREDIT_REPAIR" } },
    });

    void stagesWithoutService;
    void creditWithoutSc;

    if (creditCases !== serviceCases) {
      failures.push(
        `count CreditCase (${creditCases}) != ServiceCase (${serviceCases})`,
      );
    }
    if (creditRepairSc !== creditCases) {
      failures.push(
        `CREDIT_REPAIR ServiceCase (${creditRepairSc}) != CreditCase (${creditCases})`,
      );
    }
    if (Number(stagesNullService[0]?.c ?? 0) > 0) {
      failures.push("WorkflowStage con serviceId NULL");
    }
    if (Number(creditNullSc[0]?.c ?? 0) > 0) {
      failures.push("CreditCase con serviceCaseId NULL");
    }
    if (Number(orphanSc[0]?.c ?? 0) > 0) {
      failures.push("ServiceCase CREDIT_REPAIR sin CreditCase");
    }
    if (Number(wonMismatch[0]?.c ?? 0) > 0) {
      failures.push("Opportunity.wonServiceCaseId no alinea con wonCaseId");
    }
    if (Number(stageServiceMismatch[0]?.c ?? 0) > 0) {
      failures.push("ServiceCase.stageId apunta a etapa de otro Service");
    }
    if (notes !== 0) {
      failures.push(`Note debería estar vacía al nacer / sin backfill (got ${notes})`);
    }
    // StageHistory puede crecer con moveCaseToStage; solo se exige no-backfill
    // histórico al nacer (0 filas post-migrate). No fallar si ya hay movimientos.

    console.log(
      JSON.stringify(
        {
          creditCases,
          serviceCases,
          creditRepairSc,
          notes,
          stageHistory,
          ok: failures.length === 0,
          failures,
        },
        null,
        2,
      ),
    );

    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
