/**
 * Crea un IntakeLink de prueba para las pruebas HTTP del intake público.
 * Imprime el token. cleanup: intake-cleanup.ts <token> <clientId>
 */
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirstOrThrow({
    where: { name: "J&H Multiservices LLC" },
  });
  const owner = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: org.id, role: "OWNER" },
  });
  const link = await prisma.intakeLink.create({
    data: {
      organizationId: org.id,
      token: "smoke-" + crypto.randomBytes(24).toString("base64url"),
      createdById: owner.userId,
      maxUses: 3,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  console.log(JSON.stringify({ token: link.token, linkId: link.id }));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
