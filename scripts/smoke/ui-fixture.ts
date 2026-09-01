/**
 * Fixture para el smoke test de UI (fase C1): crea un cliente y un caso
 * marcados "SMOKE-UI" usando los servicios de dominio, e imprime los IDs.
 * Limpiar con: npx tsx --env-file=.env.local scripts/smoke/http-cleanup.ts <clientId>
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as cases from "../../src/server/cases";

const prisma = new PrismaClient();

async function main() {
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

  const client = await clients.createClient(ctx, {
    firstName: "SMOKE-UI",
    lastName: "Fase C1",
    email: "smoke-ui@example.com",
  });
  const creditCase = await cases.createCreditCase(ctx, {
    clientId: client.id,
    summary: "Caso de prueba del smoke test de UI (fase C1).",
  });

  console.log(
    JSON.stringify({
      clientId: client.id,
      clientCode: client.clientCode,
      caseId: creditCase.id,
      caseCode: creditCase.caseCode,
    }),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
