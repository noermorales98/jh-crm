/** Elimina el fixture HTTP (cliente en cascada borra quote/pago/recibo). */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const clientId = process.argv[2];
  if (!clientId) throw new Error("Falta clientId");
  await prisma.client.delete({ where: { id: clientId } });
  console.log("fixture HTTP eliminado");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
