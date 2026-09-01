/**
 * Elimina el fixture del smoke C2. El borrado del cliente borra en cascada
 * cotización/pagos/recibo; servicio y paquete se eliminan aparte.
 * Uso: npx tsx --env-file=.env.local scripts/smoke/finance-cleanup.ts <clientId> <serviceId> <packageId>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [clientId, serviceId, packageId] = process.argv.slice(2);
  if (!clientId || !serviceId || !packageId) {
    throw new Error("Faltan clientId serviceId packageId");
  }
  await prisma.client.delete({ where: { id: clientId } });
  await prisma.servicePackage.delete({ where: { id: packageId } });
  await prisma.service.delete({ where: { id: serviceId } });
  console.log("fixture C2 eliminado");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
