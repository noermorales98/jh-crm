/**
 * Crea un fixture mínimo (cliente + cotización + pago + recibo) para las
 * pruebas HTTP autenticadas de PDF/archivos. Imprime los IDs.
 * cleanupHttpFixture() borra todo al final.
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as quotes from "../../src/server/quotes";
import * as payments from "../../src/server/payments";

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

  const client = await clients.createClient(ctx, { firstName: "SMOKE HTTP", lastName: "Fixture" });
  const quote = await quotes.createQuote(ctx, {
    clientId: client.id,
    items: [
      { kind: "manual", description: "Servicio de prueba HTTP", quantity: 1, unitPrice: "250.00" },
    ],
    notes: "Nota de prueba.",
  });
  const pay = await payments.registerPayment(ctx, {
    clientId: client.id,
    quoteId: quote.id,
    amount: "250.00",
    method: "ZELLE",
    reference: "SMOKE-HTTP",
  });

  console.log(JSON.stringify({
    clientId: client.id,
    quoteId: quote.id,
    quoteFolio: quote.folio,
    paymentId: pay.payment.id,
    receiptId: pay.receipt!.id,
    receiptFolio: pay.receipt!.folio,
  }));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
