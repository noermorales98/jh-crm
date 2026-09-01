/**
 * Limpieza de los datos E2E- de la verificación integral:
 *   - AuditLogs ligados a los pagos/recibos E2E (no cuelgan del cliente)
 *   - paquete y servicios E2E (no cuelgan del cliente)
 *   - cliente E2E (cascada: caso, rondas, cotización, pagos, recibos, tareas,
 *     activity logs, quote status events)
 * Al final verifica que no quede ningún rastro "E2E-".
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const client = await prisma.client.findFirst({
    where: { firstName: "E2E-Verificacion" },
    include: {
      quotes: { include: { payments: { include: { receipt: true } } } },
    },
  });

  if (client) {
    const entityIds = client.quotes.flatMap((q) =>
      q.payments.flatMap((p) => [p.id, p.receipt?.id].filter(Boolean) as string[]),
    );
    const deletedAudit = await prisma.auditLog.deleteMany({
      where: { entityId: { in: entityIds } },
    });
    console.log(`audit logs eliminados: ${deletedAudit.count}`);
    await prisma.client.delete({ where: { id: client.id } });
    console.log(`cliente E2E eliminado (${client.clientCode}) con cascada`);
  } else {
    console.log("cliente E2E no encontrado (ya limpio)");
  }

  // Paquete y servicios E2E
  const pkgs = await prisma.servicePackage.findMany({ where: { name: { startsWith: "E2E-" } } });
  for (const p of pkgs) {
    // ServicePackageItem tiene onDelete: Cascade desde el paquete
    await prisma.servicePackage.delete({ where: { id: p.id } });
  }
  console.log(`paquetes E2E eliminados: ${pkgs.length}`);
  const delSvc = await prisma.service.deleteMany({ where: { name: { startsWith: "E2E-" } } });
  console.log(`servicios E2E eliminados: ${delSvc.count}`);

  // Verificación final de restos
  const restos = {
    clientes: await prisma.client.count({ where: { firstName: { startsWith: "E2E-" } } }),
    servicios: await prisma.service.count({ where: { name: { startsWith: "E2E-" } } }),
    paquetes: await prisma.servicePackage.count({ where: { name: { startsWith: "E2E-" } } }),
    usuarios: await prisma.user.count({ where: { email: { startsWith: "e2e-" } } }),
    orgs: await prisma.organization.count({ where: { name: { startsWith: "E2E-" } } }),
    tareas: await prisma.task.count({ where: { title: { startsWith: "E2E-" } } }),
  };
  console.log(`restos E2E: ${JSON.stringify(restos)}`);
  const total = Object.values(restos).reduce((a, b) => a + b, 0);
  if (total > 0) {
    console.error("QUEDAN DATOS E2E SIN LIMPIAR");
    process.exitCode = 1;
  } else {
    console.log("LIMPIEZA E2E COMPLETA");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
