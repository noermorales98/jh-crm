/**
 * Datos de demostración temporales para las capturas del rediseño visual.
 * Todo lo creado usa nombres marcados "SHOT-" para limpieza con
 * redesign-cleanup.ts. NO usar en producción.
 *
 * Uso: npx tsx --env-file=.env.local scripts/smoke/redesign-fixture.ts
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as cases from "../../src/server/cases";
import * as tasks from "../../src/server/tasks";
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

  const inDays = (d: number) => new Date(Date.now() + d * 86400_000);

  const c1 = await clients.createClient(ctx, {
    firstName: "SHOT-María",
    lastName: "González",
    email: "maria.gonzalez@example.com",
    phone: "+1 312 555 0142",
    city: "Chicago",
    state: "IL",
    status: "ACTIVE",
    source: "Referido",
  });
  const c2 = await clients.createClient(ctx, {
    firstName: "SHOT-Carlos",
    lastName: "Ramírez",
    email: "carlos.ramirez@example.com",
    phone: "+1 773 555 0198",
    city: "Aurora",
    state: "IL",
    status: "ACTIVE",
    source: "Web",
  });
  const c3 = await clients.createClient(ctx, {
    firstName: "SHOT-Lucía",
    lastName: "Hernández",
    email: "lucia.hdez@example.com",
    status: "LEAD",
    source: "Web",
  });
  await clients.createClient(ctx, {
    firstName: "SHOT-Jorge",
    lastName: "Martínez",
    phone: "+1 630 555 0110",
    status: "PAUSED",
  });

  const case1 = await cases.createCreditCase(ctx, {
    clientId: c1.id,
    summary: "SHOT — Reparación de crédito integral (3 burós).",
    nextReviewAt: inDays(4),
  });
  const case2 = await cases.createCreditCase(ctx, {
    clientId: c2.id,
    summary: "SHOT — Disputa de colecciones médicas.",
    nextReviewAt: inDays(-2),
  });

  await tasks.createTask(ctx, {
    title: "SHOT — Llamar para confirmar documentos de identidad",
    type: "CALL",
    priority: "HIGH",
    dueAt: inDays(0),
    assignedToId: owner.userId,
    clientId: c1.id,
    caseId: case1.id,
  });
  await tasks.createTask(ctx, {
    title: "SHOT — Preparar ronda 2 de disputas",
    type: "PREPARE_ROUND",
    priority: "URGENT",
    dueAt: inDays(-1),
    assignedToId: owner.userId,
    clientId: c2.id,
    caseId: case2.id,
  });
  await tasks.createTask(ctx, {
    title: "SHOT — Seguimiento de lead (cotización enviada)",
    type: "FOLLOW_UP",
    priority: "NORMAL",
    dueAt: inDays(2),
    assignedToId: owner.userId,
    clientId: c3.id,
  });

  const q1 = await quotes.createQuote(ctx, {
    clientId: c1.id,
    caseId: case1.id,
    validUntil: inDays(15),
    notes: "SHOT — Incluye 3 rondas de disputa.",
    items: [
      { kind: "manual", description: "Trabajo inicial de análisis", quantity: 1, unitPrice: 189 },
      { kind: "manual", description: "Mensualidad de gestión", quantity: 3, unitPrice: 99 },
    ],
  });
  const q2 = await quotes.createQuote(ctx, {
    clientId: c3.id,
    items: [
      { kind: "manual", description: "Plan esencial de reparación", quantity: 1, unitPrice: 299 },
    ],
  });
  await quotes.markQuoteSent(ctx, q2.id);

  await payments.registerPayment(ctx, {
    clientId: c1.id,
    caseId: case1.id,
    quoteId: q1.id,
    amount: 189,
    method: "ZELLE",
    status: "RECEIVED",
    reference: "SHOT-ZELLE-8841",
    receivedAt: new Date(),
  });
  await payments.registerPayment(ctx, {
    clientId: c1.id,
    caseId: case1.id,
    quoteId: q1.id,
    amount: 99,
    method: "STRIPE",
    status: "PENDING",
    dueAt: inDays(6),
  });
  await payments.registerPayment(ctx, {
    clientId: c2.id,
    caseId: case2.id,
    amount: 150,
    method: "CASH",
    status: "PENDING",
    dueAt: inDays(-3),
  });

  console.log("SHOT fixture creado");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
