/** Recupera los IDs/folios de los datos E2E- y verifica su estado final. */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const c = await prisma.client.findFirstOrThrow({
    where: { firstName: "E2E-Verificacion" },
    include: {
      cases: true,
      quotes: { include: { payments: { include: { receipt: true } } } },
    },
  });
  const q = c.quotes[0];
  const round = await prisma.creditRound.findFirst({ where: { caseId: c.cases[0].id } });
  const task = await prisma.task.findFirst({ where: { roundId: round?.id } });
  const svc = await prisma.service.findMany({
    where: { name: { startsWith: "E2E-" } },
    select: { id: true, name: true },
  });
  const pkg = await prisma.servicePackage.findFirst({
    where: { name: { startsWith: "E2E-" } },
    select: { id: true, name: true },
  });
  const stage = await prisma.workflowStage.findUnique({
    where: { id: c.cases[0].stageId },
    select: { name: true },
  });
  console.log(
    JSON.stringify(
      {
        clientId: c.id,
        clientCode: c.clientCode,
        caseId: c.cases[0].id,
        caseCode: c.cases[0].caseCode,
        currentStage: stage?.name,
        quoteId: q.id,
        quoteFolio: q.folio,
        quoteStatus: q.status,
        quoteTotal: q.total.toString(),
        payments: q.payments.map((p) => ({
          id: p.id,
          amount: p.amount.toString(),
          status: p.status,
          receiptId: p.receipt?.id,
          receiptFolio: p.receipt?.folio,
          receiptStatus: p.receipt?.status,
        })),
        roundId: round?.id,
        roundStatus: round?.status,
        taskId: task?.id,
        taskTitle: task?.title,
        services: svc,
        pkg,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
