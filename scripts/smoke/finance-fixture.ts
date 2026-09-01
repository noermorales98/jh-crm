/**
 * Fixture del smoke funcional de la fase C2 (Servicios → Cotización →
 * Pago recibido → Recibo). Crea servicio + paquete + cliente + cotización
 * (ítems de catálogo y manual con descuento) → la marca enviada → registra
 * un pago RECIBIDO parcial. Imprime los IDs para verificación UI/PDF.
 * Limpiar con: npx tsx --env-file=.env.local scripts/smoke/finance-cleanup.ts <clientId> <serviceId> <packageId>
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as catalog from "../../src/server/services";
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
  const stamp = Date.now().toString(36);

  const service = await catalog.createService(ctx, {
    name: `SMOKE-C2 Servicio ${stamp}`,
    description: "Servicio de prueba del smoke C2.",
    defaultPrice: "150.00",
  });
  const pkg = await catalog.createPackage(ctx, {
    name: `SMOKE-C2 Paquete ${stamp}`,
    description: "Paquete de prueba del smoke C2.",
    defaultPrice: "400.00",
    items: [{ serviceId: service.id, quantity: 2 }],
  });

  const client = await clients.createClient(ctx, {
    firstName: "SMOKE-C2",
    lastName: `Finanzas ${stamp}`,
    email: `smoke-c2-${stamp}@example.com`,
  });

  const quote = await quotes.createQuote(ctx, {
    clientId: client.id,
    items: [
      { kind: "service", serviceId: service.id, quantity: 1 },
      { kind: "package", packageId: pkg.id, quantity: 1 },
      {
        kind: "manual",
        description: "Ítem manual con descuento",
        quantity: 2,
        unitPrice: "100.00",
        discountAmount: "25.00",
      },
    ],
    notes: "Cotización del smoke C2.",
  });

  await quotes.markQuoteSent(ctx, quote.id);

  const pay = await payments.registerPayment(ctx, {
    clientId: client.id,
    quoteId: quote.id,
    amount: "200.00",
    method: "ZELLE",
    reference: `SMOKE-C2-${stamp}`,
    notes: "Pago parcial del smoke C2.",
  });

  console.log(
    JSON.stringify({
      clientId: client.id,
      serviceId: service.id,
      packageId: pkg.id,
      quoteId: quote.id,
      quoteFolio: quote.folio,
      quoteTotal: quote.total.toString(),
      paymentId: pay.payment.id,
      receiptId: pay.receipt!.id,
      receiptFolio: pay.receipt!.folio,
      quoteStatusAfterPayment: pay.quoteStatus,
    }),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
