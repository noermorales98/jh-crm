/**
 * Limpieza de los datos temporales SHOT- creados por redesign-fixture.ts.
 * Las relaciones Client→(casos, cotizaciones, pagos, recibos, activity log)
 * son onDelete: Cascade; las tareas usan SetNull, así que se borran aparte.
 *
 * Uso: npx tsx --env-file=.env.local scripts/smoke/redesign-cleanup.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const shotClients = await prisma.client.findMany({
    where: { firstName: { startsWith: "SHOT-" } },
    select: { id: true },
  });
  const clientIds = shotClients.map((c) => c.id);
  if (clientIds.length === 0) {
    console.log("No hay datos SHOT- que limpiar");
    return;
  }

  const tasks = await prisma.task.deleteMany({
    where: {
      OR: [
        { clientId: { in: clientIds } },
        { title: { startsWith: "SHOT" } },
      ],
    },
  });
  // Cascade borra casos, rondas, quotes (+ítems/eventos), pagos, recibos,
  // documentos y activity logs de estos clientes.
  const clientsRes = await prisma.client.deleteMany({
    where: { id: { in: clientIds } },
  });

  console.log(
    `Limpieza SHOT- completa: ${clientsRes.count} clientes (con registros en cascada) y ${tasks.count} tareas`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
