/**
 * Prueba obligatoria de seguridad organizacional (07-criterios): una segunda
 * organización E2E-OrgB no puede leer NINGÚN registro de la org principal
 * aunque conozca los IDs. Se crea OrgB + usuario OWNER B, se intenta leer
 * cliente/caso/cotización/recibo de la org A con el ctx de B, y se verifica
 * que todos fallan. Luego se elimina OrgB (cascada) y el usuario B.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as cases from "../../src/server/cases";
import * as quotes from "../../src/server/quotes";
import * as receipts from "../../src/server/receipts";

const prisma = new PrismaClient();

// IDs de la org A (datos E2E- creados por e2e-flow.ts)
const A = {
  clientId: "cmtiflki50001va993jmguycg",
  caseId: "cmtifllc80005va99b70qamya",
  quoteId: "cmtiflpr2000sva99rf47c3g4",
  receiptId: "cmtiflspo001cva99fcmw7oep",
};

async function main() {
  const userB = await prisma.user.create({
    data: {
      email: "e2e-orgb@example.com",
      name: "E2E-OrgB Owner",
      passwordHash: await bcrypt.hash("e2e-orgb-password", 10),
    },
  });
  const orgB = await prisma.organization.create({
    data: {
      name: "E2E-OrgB Aislada",
      members: { create: { userId: userB.id, role: "OWNER" } },
      settings: { create: {} },
    },
  });
  const ctxB: OrganizationContext = {
    userId: userB.id,
    organizationId: orgB.id,
    role: "OWNER",
  };

  const attempts: Array<[string, () => Promise<unknown>]> = [
    ["cliente", () => clients.getClientDetail(ctxB, A.clientId)],
    ["perfil sensible", () => clients.getSensitiveProfile(ctxB, A.clientId)],
    ["caso", () => cases.getCaseDetail(ctxB, A.caseId)],
    ["cotización", () => quotes.getQuoteDetail(ctxB, A.quoteId)],
    ["recibo", () => receipts.getReceipt(ctxB, A.receiptId)],
  ];

  let allBlocked = true;
  for (const [label, fn] of attempts) {
    try {
      await fn();
      console.error(`FALLO DE AISLAMIENTO: OrgB pudo leer ${label} de OrgA`);
      allBlocked = false;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`OK  OrgB NO pudo leer ${label} de OrgA (${msg})`);
    }
  }

  // Limpieza de OrgB
  await prisma.organization.delete({ where: { id: orgB.id } });
  await prisma.user.delete({ where: { id: userB.id } });
  console.log("OrgB y usuario B eliminados");

  if (!allBlocked) {
    process.exitCode = 1;
  } else {
    console.log("AISLAMIENTO ORGANIZACIONAL: VERIFICADO");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
