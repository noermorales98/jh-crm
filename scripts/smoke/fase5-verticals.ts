/**
 * Smoke Fase 5: verticales secundarios — HB-001, FD-001/FD-002, PL-001, PJ-001.
 *
 * Verifica: createServiceCase genérico (ServiceCase + extensión 1:1 por
 * código), siembra idempotente de etapas (ensureVerticalService), mover etapa,
 * transición de estado, montos/balance y notas por serviceCaseId, y que el
 * camino CREDIT_REPAIR sigue devolviendo CreditCase (regresión del refactor).
 *
 * Uso: npx tsx --env-file=.env.local scripts/smoke/fase5-verticals.ts
 */
import { PrismaClient } from "@prisma/client";
import { createServiceCase } from "../../src/server/cases";
import {
  getServiceCaseDetail,
  moveServiceCaseToStage,
  transitionServiceCase,
  updateServiceCaseAmounts,
} from "../../src/server/service-cases";
import { ensureVerticalService } from "../../src/server/services/verticals";
import { serviceCaseBalance } from "../../src/server/payments";
import { createServiceCaseNote } from "../../src/server/notes";
import type { OrganizationContext } from "../../src/server/auth/guards";

const MARK = `fase5-${Date.now()}`;

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function main() {
  const prisma = new PrismaClient();
  const startedAt = new Date();
  let clientId: string | null = null;
  const serviceCaseIds: string[] = [];

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

    console.log("\n[Fase 5] Verticales secundarios");

    const client = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: `C-${MARK}`.slice(0, 20),
        firstName: "FASE5",
        lastName: MARK,
        status: "ACTIVE",
        assignedToId: member.userId,
      },
    });
    clientId = client.id;

    // ── HB-001: expediente Compra de Casa ───────────────────────
    const hb = await createServiceCase(ctx, {
      clientId: client.id,
      serviceCode: "HOME_BUYER",
      assignedToId: member.userId,
      summary: `Smoke Fase 5 ${MARK}`,
    });
    serviceCaseIds.push(hb.serviceCase.id);
    check("HOME_BUYER sin CreditCase", hb.creditCase === null);

    const hbRow = await prisma.serviceCase.findUniqueOrThrow({
      where: { id: hb.serviceCase.id },
      include: { homeBuyerCase: true, stage: true },
    });
    check("extensión HomeBuyerCase 1:1", Boolean(hbRow.homeBuyerCase));
    check(
      "etapa inicial = CONSULTA (pipeline HB-001)",
      hbRow.stage.key === "CONSULTA",
    );

    // ── ensureVerticalService idempotente ───────────────────────
    const hbService = await ensureVerticalService(ctx.organizationId, "HOME_BUYER");
    const stagesAntes = await prisma.workflowStage.count({
      where: { serviceId: hbService.id },
    });
    await ensureVerticalService(ctx.organizationId, "HOME_BUYER");
    const stagesDespues = await prisma.workflowStage.count({
      where: { serviceId: hbService.id },
    });
    check(
      "ensureVerticalService no duplica etapas",
      stagesAntes === stagesDespues && stagesAntes === 8,
    );

    // ── Mover etapa + historial ─────────────────────────────────
    const evaluacion = await prisma.workflowStage.findFirstOrThrow({
      where: { serviceId: hbService.id, key: "EVALUACION_CREDITO" },
    });
    await moveServiceCaseToStage(ctx, hb.serviceCase.id, evaluacion.id);
    const hbMovido = await prisma.serviceCase.findUniqueOrThrow({
      where: { id: hb.serviceCase.id },
      select: { stageId: true },
    });
    check("etapa movida a EVALUACION_CREDITO", hbMovido.stageId === evaluacion.id);
    const histCount = await prisma.serviceCaseStageHistory.count({
      where: { serviceCaseId: hb.serviceCase.id },
    });
    check("StageHistory registra apertura + movimiento", histCount === 2);

    // ── Montos + balance por serviceCaseId ──────────────────────
    await updateServiceCaseAmounts(ctx, hb.serviceCase.id, {
      quotedAmount: "3000",
      agreedAmount: "2500",
    });
    const hbBalance = await serviceCaseBalance(ctx, hb.serviceCase.id);
    check(
      "balance HB: acordado 2500 sin pagos",
      hbBalance.balance?.toString() === "2500",
    );

    // ── Nota por serviceCaseId directo ──────────────────────────
    const note = await createServiceCaseNote(ctx, {
      serviceCaseId: hb.serviceCase.id,
      body: `Nota vertical ${MARK}`,
    });
    check(
      "nota ligada al ServiceCase sin CreditCase",
      Boolean(note.id),
    );

    // ── Transición de estado ────────────────────────────────────
    await transitionServiceCase(ctx, hb.serviceCase.id, "COMPLETED");
    const hbCerrado = await prisma.serviceCase.findUniqueOrThrow({
      where: { id: hb.serviceCase.id },
      select: { status: true, completedAt: true },
    });
    check(
      "transición COMPLETED + completedAt",
      hbCerrado.status === "COMPLETED" && Boolean(hbCerrado.completedAt),
    );
    await transitionServiceCase(ctx, hb.serviceCase.id, "OPEN");

    // ── FD-001 / FD-002: Funding + aplicaciones ─────────────────
    const fd = await createServiceCase(ctx, {
      clientId: client.id,
      serviceCode: "BUSINESS_CREDIT",
    });
    serviceCaseIds.push(fd.serviceCase.id);
    const fdRow = await prisma.serviceCase.findUniqueOrThrow({
      where: { id: fd.serviceCase.id },
      include: { fundingCase: true, stage: true },
    });
    check("extensión FundingCase 1:1", Boolean(fdRow.fundingCase));
    check("etapa inicial Funding = CONSULTA", fdRow.stage.key === "CONSULTA");

    await prisma.fundingApplication.create({
      data: {
        organizationId: ctx.organizationId,
        fundingCaseId: fdRow.fundingCase!.id,
        lenderName: `Lender ${MARK}`,
        requestedAmount: "50000",
        status: "SUBMITTED",
      },
    });
    const fdDetail = await getServiceCaseDetail(ctx, fd.serviceCase.id);
    check(
      "ficha expone la aplicación de funding",
      fdDetail.serviceCase.fundingCase?.applications.length === 1 &&
        fdDetail.serviceCase.fundingCase.applications[0].status === "SUBMITTED",
    );

    // ── PL-001: Préstamo personal ───────────────────────────────
    const pl = await createServiceCase(ctx, {
      clientId: client.id,
      serviceCode: "PERSONAL_LOAN",
    });
    serviceCaseIds.push(pl.serviceCase.id);
    const plRow = await prisma.serviceCase.findUniqueOrThrow({
      where: { id: pl.serviceCase.id },
      include: { personalLoanCase: true, stage: true },
    });
    check("extensión PersonalLoanCase 1:1", Boolean(plRow.personalLoanCase));
    check("etapa inicial PL = CONSULTA", plRow.stage.key === "CONSULTA");

    // ── PJ-001: Proyecto web ────────────────────────────────────
    const pj = await createServiceCase(ctx, {
      clientId: client.id,
      serviceCode: "WEB_DEVELOPMENT",
    });
    serviceCaseIds.push(pj.serviceCase.id);
    const pjRow = await prisma.serviceCase.findUniqueOrThrow({
      where: { id: pj.serviceCase.id },
      include: { projectCase: true, stage: true },
    });
    check("extensión ProjectCase 1:1", Boolean(pjRow.projectCase));
    check("etapa inicial PJ = BRIEF", pjRow.stage.key === "BRIEF");

    // ── Regresión: CREDIT_REPAIR sigue creando CreditCase ───────
    const cr = await createServiceCase(ctx, {
      clientId: client.id,
      serviceCode: "CREDIT_REPAIR",
    });
    serviceCaseIds.push(cr.serviceCase.id);
    check(
      "CREDIT_REPAIR devuelve CreditCase (regresión refactor)",
      Boolean(cr.creditCase) && cr.creditCase!.serviceCaseId === cr.serviceCase.id,
    );

    console.log(
      JSON.stringify(
        { ok: true, serviceCaseIds, caseId: cr.creditCase?.id ?? null },
        null,
        2,
      ),
    );
  } finally {
    console.log("\n[cleanup]");
    if (clientId) {
      await prisma.note
        .deleteMany({ where: { clientId } })
        .catch(() => undefined);
      await prisma.activityLog
        .deleteMany({ where: { clientId } })
        .catch(() => undefined);
      await prisma.task
        .deleteMany({ where: { clientId } })
        .catch(() => undefined);
    }
    if (serviceCaseIds.length) {
      // Las extensiones 1:1 y las aplicaciones borran en cascade.
      await prisma.serviceCaseStageHistory
        .deleteMany({ where: { serviceCaseId: { in: serviceCaseIds } } })
        .catch(() => undefined);
      await prisma.creditCase
        .deleteMany({ where: { serviceCaseId: { in: serviceCaseIds } } })
        .catch(() => undefined);
      await prisma.serviceCase
        .deleteMany({ where: { id: { in: serviceCaseIds } } })
        .catch(() => undefined);
    }
    if (clientId) {
      await prisma.client
        .deleteMany({ where: { id: clientId } })
        .catch(() => undefined);
    }
    await prisma.auditLog
      .deleteMany({
        where: {
          organizationId: (
            await prisma.organizationMember.findFirst({
              where: { role: "OWNER" },
              orderBy: { createdAt: "asc" },
            })
          )!.organizationId,
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
