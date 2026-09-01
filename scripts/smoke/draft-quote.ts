/** Crea una cotización DRAFT de prueba para verificar la edición (?edit=). */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as quotes from "../../src/server/quotes";

const prisma = new PrismaClient();

async function main() {
  const clientId = process.argv[2];
  if (!clientId) throw new Error("Falta clientId");
  const org = await prisma.organization.findFirstOrThrow({
    where: { name: "J&H Multiservices LLC" },
  });
  const owner = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: org.id, role: "OWNER" },
  });
  const ctx: OrganizationContext = {
    userId: owner.userId,
    organizationId: org.id,
    role: "OWNER",
  };
  const quote = await quotes.createQuote(ctx, {
    clientId,
    items: [
      {
        kind: "manual",
        description: "Borrador smoke C2",
        quantity: 1,
        unitPrice: "50.00",
      },
    ],
  });
  console.log(quote.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
