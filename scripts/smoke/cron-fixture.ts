/**
 * Prueba real de idempotencia del cron: crea una tarea E2E- con reminderAt
 * vencido, cuenta las notificaciones `task:<id>:due` antes de limpiar.
 * Uso: npx tsx --env-file=.env.local scripts/smoke/cron-fixture.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirstOrThrow({
    where: { name: "J&H Multiservices LLC" },
  });
  const owner = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: org.id, role: "OWNER" },
  });
  const task = await prisma.task.create({
    data: {
      organizationId: org.id,
      title: "E2E-Tarea cron vencida",
      type: "OTHER",
      priority: "NORMAL",
      dueAt: new Date(Date.now() - 60 * 60 * 1000),
      reminderAt: new Date(Date.now() - 30 * 60 * 1000),
      assignedToId: owner.userId,
      createdById: owner.userId,
    },
  });
  console.log(JSON.stringify({ taskId: task.id }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
