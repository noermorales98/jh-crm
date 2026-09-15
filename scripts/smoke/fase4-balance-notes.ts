/**
 * Smoke Fase 4: balance a nivel ServiceCase (PY-002), notas en expediente
 * (NT-001) y wonServiceCaseId como único enlace WON (D5/Fase 4).
 *
 * Uso: npx tsx --env-file=.env.local scripts/smoke/fase4-balance-notes.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  createCreditCase,
  getCaseDetail,
  updateCaseAmounts,
} from "../../src/server/cases";
import { registerPayment, serviceCaseBalance } from "../../src/server/payments";
import { createServiceCaseNote } from "../../src/server/notes";
import { markWon } from "../../src/server/opportunities";
import type { OrganizationContext } from "../../src/server/auth/guards";

const MARK = `fase4-${Date.now()}`;

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function main() {
  const prisma = new PrismaClient();
  const startedAt = new Date();
  let clientId: string | null = null;
  let caseId: string | null = null;
  let serviceCaseId: string | null = null;
  let leadClientId: string | null = null;
  let opportunityId: string | null = null;
  let wonCaseId: string | null = null;
  let wonServiceCaseId: string | null = null;

  try {
    const member = await prisma.organizationMember.findFirst({
      where: { role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });
    if (!member) throw new Error("No hay OWNER en la org.");

    const ctx: OrganizationContext = {
      userId: member.userId,
      organizationId: member.organizationId,
      role: member.role,
    };

    console.log("\n[Fase 4] Balance ServiceCase + notas + WON");

    const client = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: `C-${MARK}`.slice(0, 20),
        firstName: "FASE4",
        lastName: MARK,
        status: "ACTIVE",
        assignedToId: member.userId,
      },
    });
    clientId = client.id;

    const created = await createCreditCase(ctx, {
      clientId: client.id,
      assignedToId: member.userId,
      summary: `Smoke Fase 4 ${MARK}`,
    });
    caseId = created.id;
    serviceCaseId = created.serviceCaseId;

    // ── PY-002: montos + balance ────────────────────────────────
    await updateCaseAmounts(ctx, caseId, {
      quotedAmount: "1200",
      agreedAmount: "1000",
    });

    await registerPayment(ctx, {
      clientId: client.id,
      caseId,
      amount: "400",
      method: "ZELLE",
      status: "RECEIVED",
    });
    await registerPayment(ctx, {
      clientId: client.id,
      caseId,
      amount: "150",
      method: "CASH",
      status: "PENDING",
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const balance = await serviceCaseBalance(ctx, serviceCaseId);
    check("agreedAmount guardado", balance.agreedAmount?.toString() === "1000");
    check("pagado = 400", balance.paid.toString() === "400");
    check("pendiente = 150", balance.pending.toString() === "150");
    check("balance = 600", balance.balance?.toString() === "600");

    const detail = await getCaseDetail(ctx, caseId);
    check(
      "ficha expone caseBalance",
      detail.caseBalance.balance?.toString() === "600" &&
        detail.caseBalance.paid.toString() === "400",
    );

    // Sin agreedAmount no hay balance canónico.
    await updateCaseAmounts(ctx, caseId, { agreedAmount: null });
    const sinAcordado = await serviceCaseBalance(ctx, serviceCaseId);
    check(
      "sin agreedAmount → balance null",
      sinAcordado.balance === null && sinAcordado.paid.toString() === "400",
    );
    await updateCaseAmounts(ctx, caseId, { agreedAmount: "1000" });

    // Monto negativo rechazado.
    let rejected = false;
    try {
      await updateCaseAmounts(ctx, caseId, { agreedAmount: "-5" });
    } catch {
      rejected = true;
    }
    check("rechaza monto negativo", rejected);

    // ── NT-001: nota en expediente ──────────────────────────────
    const note = await createServiceCaseNote(ctx, {
      caseId,
      body: `Nota smoke ${MARK}`,
    });
    const noteRow = await prisma.note.findUniqueOrThrow({
      where: { id: note.id },
    });
    check(
      "nota ligada a client + serviceCase",
      noteRow.clientId === client.id && noteRow.serviceCaseId === serviceCaseId,
    );
    const detailConNota = await getCaseDetail(ctx, caseId);
    check(
      "ficha lista la nota del expediente",
      detailConNota.notes.some((n) => n.id === note.id),
    );

    // ── Fase 4 / D5: WON escribe solo wonServiceCaseId ─────────
    const leadClient = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: `L-${MARK}`.slice(0, 20),
        firstName: "LEAD",
        lastName: MARK,
        status: "LEAD",
        assignedToId: member.userId,
      },
    });
    leadClientId = leadClient.id;
    const opp = await prisma.opportunity.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: leadClient.id,
        ownerId: member.userId,
        stage: "NEW_LEAD",
        source: "smoke",
      },
    });
    opportunityId = opp.id;

    const won = await markWon(ctx, opp.id);
    wonServiceCaseId = won.wonServiceCaseId;
    const wonServiceCase = await prisma.serviceCase.findUniqueOrThrow({
      where: { id: won.wonServiceCaseId! },
      include: { creditCase: true },
    });
    wonCaseId = wonServiceCase.creditCase?.id ?? null;

    check("WON fija wonServiceCaseId", Boolean(won.wonServiceCaseId));
    check(
      "WON ya NO escribe wonCaseId",
      (await prisma.opportunity.findUniqueOrThrow({ where: { id: opp.id } }))
        .wonCaseId === null,
    );
    check("ServiceCase + CreditCase 1:1", Boolean(wonServiceCase.creditCase));
    check(
      "include expone creditCase vía wonServiceCase",
      won.wonServiceCase?.creditCase?.id === wonCaseId,
    );
    const leadAfter = await prisma.client.findUniqueOrThrow({
      where: { id: leadClient.id },
    });
    check("LEAD → ACTIVE", leadAfter.status === "ACTIVE");

    console.log(
      JSON.stringify({ ok: true, caseId, serviceCaseId, wonCaseId }, null, 2),
    );
  } finally {
    console.log("\n[cleanup]");
    const caseIds = [caseId, wonCaseId].filter(Boolean) as string[];
    const serviceCaseIds = [serviceCaseId, wonServiceCaseId].filter(
      Boolean,
    ) as string[];
    const clientIds = [clientId, leadClientId].filter(Boolean) as string[];

    if (clientIds.length) {
      await prisma.receipt
        .deleteMany({ where: { clientId: { in: clientIds } } })
        .catch(() => undefined);
      await prisma.payment
        .deleteMany({ where: { clientId: { in: clientIds } } })
        .catch(() => undefined);
      await prisma.note
        .deleteMany({ where: { clientId: { in: clientIds } } })
        .catch(() => undefined);
      await prisma.activityLog
        .deleteMany({ where: { clientId: { in: clientIds } } })
        .catch(() => undefined);
      await prisma.task
        .deleteMany({ where: { clientId: { in: clientIds } } })
        .catch(() => undefined);
    }
    if (opportunityId) {
      await prisma.opportunity
        .deleteMany({ where: { id: opportunityId } })
        .catch(() => undefined);
    }
    if (caseIds.length) {
      await prisma.creditCase
        .deleteMany({ where: { id: { in: caseIds } } })
        .catch(() => undefined);
    }
    if (serviceCaseIds.length) {
      await prisma.serviceCaseStageHistory
        .deleteMany({ where: { serviceCaseId: { in: serviceCaseIds } } })
        .catch(() => undefined);
      await prisma.serviceCase
        .deleteMany({ where: { id: { in: serviceCaseIds } } })
        .catch(() => undefined);
    }
    if (clientIds.length) {
      await prisma.client
        .deleteMany({ where: { id: { in: clientIds } } })
        .catch(() => undefined);
    }
    await prisma.auditLog
      .deleteMany({
        where: {
          organizationId: (await prisma.organizationMember.findFirst({
            where: { role: "OWNER" },
            orderBy: { createdAt: "asc" },
          }))!.organizationId,
          createdAt: { gte: startedAt },
        },
      })
      .catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
