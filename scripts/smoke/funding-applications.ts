/**
 * Smoke FD-002: aplicaciones a prestamistas dentro de un FundingCase.
 *
 * Cubre: creación y edición, transición de estados, importes y fechas,
 * aislamiento por organización/caso, permisos VIEWER, caso cerrado o
 * archivado, validaciones inválidas, versión obsoleta y edición concurrente,
 * auditoría + activity log y limpieza exacta de fixtures.
 *
 * Uso: npx tsx --env-file=.env.local scripts/smoke/funding-applications.ts
 */
import { PrismaClient, type FundingApplicationStatus } from "@prisma/client";
import { createServiceCase } from "../../src/server/cases";
import { transitionServiceCase } from "../../src/server/service-cases";
import {
  createFundingApplication,
  updateFundingApplication,
} from "../../src/server/funding";
import { ForbiddenError } from "../../src/server/auth/guards";
import type { OrganizationContext } from "../../src/server/auth/guards";

const MARK = `fd002-${Date.now()}`;
let checks = 0;

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  checks++;
  console.log(`  ✓ ${label}`);
}

async function expectFail(
  label: string,
  fn: () => Promise<unknown>,
  needle?: string,
) {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (needle && !message.includes(needle)) {
      throw new Error(`FAIL: ${label} — error inesperado: ${message}`);
    }
    check(label, true);
    return;
  }
  throw new Error(`FAIL: ${label} — no lanzó error`);
}

async function main() {
  const prisma = new PrismaClient();
  const startedAt = new Date();
  const clientIds: string[] = [];
  const serviceCaseIds: string[] = [];
  const applicationIds: string[] = [];

  try {
    const member = await prisma.organizationMember.findFirstOrThrow({
      where: { role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });
    const ctx: OrganizationContext = {
      userId: member.userId,
      organizationId: member.organizationId,
      role: member.role,
    };
    const viewerCtx: OrganizationContext = { ...ctx, role: "VIEWER" };
    const foreignCtx: OrganizationContext = {
      ...ctx,
      organizationId: "org-inexistente-fd002",
    };

    console.log("\n[FD-002] Aplicaciones a prestamistas");

    const makeClient = async (tag: string) => {
      const client = await prisma.client.create({
        data: {
          organizationId: ctx.organizationId,
          clientCode: `C-${tag}-${MARK}`.slice(0, 20),
          firstName: "FD002",
          lastName: `${MARK}-${tag}`,
          status: "ACTIVE",
          assignedToId: member.userId,
        },
      });
      clientIds.push(client.id);
      return client;
    };

    const clientA = await makeClient("A");
    const fdA = await createServiceCase(ctx, {
      clientId: clientA.id,
      serviceCode: "BUSINESS_CREDIT",
      assignedToId: member.userId,
      summary: `Smoke FD-002 ${MARK}`,
    });
    serviceCaseIds.push(fdA.serviceCase.id);
    const caseA = fdA.serviceCase.id;

    // ── Creación ────────────────────────────────────────────────
    const submitted = new Date("2026-08-01T12:00:00Z");
    const app = await createFundingApplication(ctx, caseA, {
      lenderName: `Lender ${MARK}`,
      requestedAmount: "50000",
      status: "DRAFT",
      submittedAt: submitted,
      notes: `Nota ${MARK}`,
    });
    applicationIds.push(app.id);
    check("creación devuelve la aplicación y el cliente", Boolean(app.id) && app.clientId === clientA.id);
    check(
      "importe solicitado y fecha de envío persisten",
      app.requestedAmount?.toString() === "50000" &&
        app.submittedAt?.getTime() === submitted.getTime(),
    );

    // ── Edición ─────────────────────────────────────────────────
    const decision = new Date("2026-08-15T12:00:00Z");
    const edited = await updateFundingApplication(ctx, caseA, app.id, app.updatedAt, {
      lenderName: `Lender ${MARK} (edit)`,
      requestedAmount: "50000",
      approvedAmount: "47500.25",
      status: "SUBMITTED",
      submittedAt: submitted,
      decisionAt: decision,
      notes: null,
    });
    check(
      "edición actualiza importes, fechas y notas",
      edited.lenderName.endsWith("(edit)") &&
        edited.approvedAmount?.toString() === "47500.25" &&
        edited.decisionAt?.getTime() === decision.getTime() &&
        edited.notes === null,
    );
    check("edición mueve updatedAt", edited.updatedAt.getTime() > app.updatedAt.getTime());

    // ── Transición de estados ───────────────────────────────────
    const walk: FundingApplicationStatus[] = ["UNDER_REVIEW", "APPROVED", "FUNDED"];
    let current = edited;
    for (const status of walk) {
      current = await updateFundingApplication(ctx, caseA, app.id, current.updatedAt, {
        lenderName: current.lenderName,
        requestedAmount: "50000",
        approvedAmount: "47500.25",
        status,
        submittedAt: submitted,
        decisionAt: decision,
      });
    }
    check("transición DRAFT→SUBMITTED→UNDER_REVIEW→APPROVED→FUNDED", current.status === "FUNDED");
    const withdrawn = await updateFundingApplication(ctx, caseA, app.id, current.updatedAt, {
      lenderName: current.lenderName,
      status: "WITHDRAWN",
    });
    check("retirada conserva el registro", withdrawn.status === "WITHDRAWN");
    current = withdrawn;

    // ── Aislamiento por caso y organización ─────────────────────
    const clientB = await makeClient("B");
    const fdB = await createServiceCase(ctx, {
      clientId: clientB.id,
      serviceCode: "BUSINESS_CREDIT",
    });
    serviceCaseIds.push(fdB.serviceCase.id);
    await expectFail(
      "una aplicación no se edita desde otro expediente",
      () =>
        updateFundingApplication(ctx, fdB.serviceCase.id, app.id, current.updatedAt, {
          lenderName: "X",
          status: "DRAFT",
        }),
      "no encontrada",
    );
    await expectFail(
      "otra organización no ve el expediente",
      () => createFundingApplication(foreignCtx, caseA, { lenderName: "X", status: "DRAFT" }),
      "no encontrado",
    );
    const crB = await createServiceCase(ctx, {
      clientId: clientB.id,
      serviceCode: "CREDIT_REPAIR",
    });
    serviceCaseIds.push(crB.serviceCase.id);
    await expectFail(
      "rechaza expedientes que no son BUSINESS_CREDIT",
      () => createFundingApplication(ctx, crB.serviceCase.id, { lenderName: "X", status: "DRAFT" }),
      "no encontrado",
    );

    // ── Permisos VIEWER ─────────────────────────────────────────
    await expectFail(
      "VIEWER no puede crear",
      () => createFundingApplication(viewerCtx, caseA, { lenderName: "X", status: "DRAFT" }),
    );
    await expectFail(
      "VIEWER no puede editar",
      () =>
        updateFundingApplication(viewerCtx, caseA, app.id, current.updatedAt, {
          lenderName: "X",
          status: "DRAFT",
        }),
    );
    const viewerDenied = await createFundingApplication(viewerCtx, caseA, {
      lenderName: "X",
      status: "DRAFT",
    }).catch((error) => error);
    check("el error de VIEWER es ForbiddenError", viewerDenied instanceof ForbiddenError);

    // ── Validaciones inválidas ──────────────────────────────────
    await expectFail(
      "prestamista vacío",
      () => createFundingApplication(ctx, caseA, { lenderName: "   ", status: "DRAFT" }),
      "prestamista",
    );
    await expectFail(
      "monto con 3 decimales",
      () =>
        createFundingApplication(ctx, caseA, {
          lenderName: "X",
          requestedAmount: "1.999",
          status: "DRAFT",
        }),
      "Monto inválido",
    );
    await expectFail(
      "monto negativo",
      () =>
        createFundingApplication(ctx, caseA, {
          lenderName: "X",
          requestedAmount: "-5",
          status: "DRAFT",
        }),
      "Monto inválido",
    );
    await expectFail(
      "decisión anterior al envío",
      () =>
        createFundingApplication(ctx, caseA, {
          lenderName: "X",
          status: "SUBMITTED",
          submittedAt: new Date("2026-08-10T00:00:00Z"),
          decisionAt: new Date("2026-08-01T00:00:00Z"),
        }),
      "anterior al envío",
    );
    await expectFail(
      "notas de más de 5000 caracteres",
      () =>
        createFundingApplication(ctx, caseA, {
          lenderName: "X",
          status: "DRAFT",
          notes: "x".repeat(5001),
        }),
      "5000",
    );
    await expectFail(
      "estado inexistente",
      () =>
        createFundingApplication(ctx, caseA, {
          lenderName: "X",
          status: "BOGUS" as FundingApplicationStatus,
        }),
      "Estado de aplicación inválido",
    );
    await expectFail(
      "fecha inválida",
      () =>
        createFundingApplication(ctx, caseA, {
          lenderName: "X",
          status: "DRAFT",
          submittedAt: new Date("no-es-fecha"),
        }),
      "Fecha inválida",
    );

    // ── Versión obsoleta y edición concurrente ──────────────────
    await expectFail(
      "updatedAt obsoleto rechaza la edición",
      () =>
        updateFundingApplication(ctx, caseA, app.id, app.updatedAt, {
          lenderName: "Stale",
          status: "DRAFT",
        }),
      "cambió",
    );
    const raceBase = await prisma.fundingApplication.findUniqueOrThrow({ where: { id: app.id } });
    const race = await Promise.allSettled([
      updateFundingApplication(ctx, caseA, app.id, raceBase.updatedAt, {
        lenderName: `Lender ${MARK} (A)`,
        status: "UNDER_REVIEW",
      }),
      updateFundingApplication(ctx, caseA, app.id, raceBase.updatedAt, {
        lenderName: `Lender ${MARK} (B)`,
        status: "UNDER_REVIEW",
      }),
    ]);
    const fulfilled = race.filter((r) => r.status === "fulfilled").length;
    const rejected = race.filter((r) => r.status === "rejected").length;
    check("edición concurrente: gana una y la otra falla", fulfilled === 1 && rejected === 1);
    const afterRace = await prisma.fundingApplication.findUniqueOrThrow({
      where: { id: app.id },
    });
    current = { ...afterRace, clientId: clientA.id };

    // ── Caso cerrado / archivado ────────────────────────────────
    await transitionServiceCase(ctx, caseA, "COMPLETED");
    await expectFail(
      "expediente cerrado no admite altas",
      () => createFundingApplication(ctx, caseA, { lenderName: "X", status: "DRAFT" }),
      "cerrado o archivado",
    );
    await expectFail(
      "expediente cerrado no admite ediciones",
      () =>
        updateFundingApplication(ctx, caseA, app.id, current.updatedAt, {
          lenderName: "X",
          status: "DRAFT",
        }),
      "cerrado o archivado",
    );
    await transitionServiceCase(ctx, caseA, "OPEN");
    await prisma.serviceCase.update({ where: { id: caseA }, data: { archivedAt: new Date() } });
    await expectFail(
      "expediente archivado no admite altas",
      () => createFundingApplication(ctx, caseA, { lenderName: "X", status: "DRAFT" }),
      "cerrado o archivado",
    );
    await prisma.serviceCase.update({ where: { id: caseA }, data: { archivedAt: null } });

    // ── Auditoría y activity log ────────────────────────────────
    const audits = await prisma.auditLog.findMany({
      where: {
        organizationId: ctx.organizationId,
        entityType: "FundingApplication",
        entityId: app.id,
      },
      orderBy: { createdAt: "asc" },
    });
    const actions = audits.map((a) => a.action);
    check(
      "auditoría registra create y update",
      actions.includes("funding.application.create") && actions.includes("funding.application.update"),
    );
    check(
      "auditoría enlaza el ServiceCase en metadata",
      audits.every((a) => (a.metadata as { serviceCaseId?: string } | null)?.serviceCaseId === caseA),
    );
    const activities = await prisma.activityLog.findMany({
      where: { clientId: clientA.id, serviceCaseId: caseA, type: "OTHER" },
    });
    check(
      "activity log registra alta y cambios con la aplicación",
      activities.some((a) => a.description.includes("registrada")) &&
        activities.some((a) => a.description.includes("actualizada")) &&
        activities.every(
          (a) => (a.metadata as { applicationId?: string } | null)?.applicationId === app.id,
        ),
    );

    console.log(`FUNDING: ${checks}/${checks} OK`);
  } finally {
    console.log("\n[cleanup]");
    if (applicationIds.length) {
      await prisma.auditLog
        .deleteMany({ where: { entityType: "FundingApplication", entityId: { in: applicationIds } } })
        .catch(() => undefined);
    }
    if (clientIds.length) {
      await prisma.note.deleteMany({ where: { clientId: { in: clientIds } } }).catch(() => undefined);
      await prisma.activityLog.deleteMany({ where: { clientId: { in: clientIds } } }).catch(() => undefined);
      await prisma.task.deleteMany({ where: { clientId: { in: clientIds } } }).catch(() => undefined);
    }
    if (serviceCaseIds.length) {
      await prisma.serviceCaseStageHistory
        .deleteMany({ where: { serviceCaseId: { in: serviceCaseIds } } })
        .catch(() => undefined);
      await prisma.creditCase
        .deleteMany({ where: { serviceCaseId: { in: serviceCaseIds } } })
        .catch(() => undefined);
      // FundingCase y sus aplicaciones borran en cascada con el ServiceCase.
      await prisma.serviceCase.deleteMany({ where: { id: { in: serviceCaseIds } } }).catch(() => undefined);
    }
    if (clientIds.length) {
      await prisma.client.deleteMany({ where: { id: { in: clientIds } } }).catch(() => undefined);
    }
    // Auditoría residual del smoke (p.ej. transiciones de estado del caso).
    await prisma.auditLog
      .deleteMany({
        where: {
          organizationId: (
            await prisma.organizationMember.findFirstOrThrow({
              where: { role: "OWNER" },
              orderBy: { createdAt: "asc" },
            })
          ).organizationId,
          createdAt: { gte: startedAt },
          action: { startsWith: "funding." },
        },
      })
      .catch(() => undefined);

    const leftoverApps = applicationIds.length
      ? await prisma.fundingApplication.count({ where: { id: { in: applicationIds } } })
      : 0;
    const leftoverClients = clientIds.length
      ? await prisma.client.count({ where: { id: { in: clientIds } } })
      : 0;
    const leftoverCases = serviceCaseIds.length
      ? await prisma.serviceCase.count({ where: { id: { in: serviceCaseIds } } })
      : 0;
    console.log(`[cleanup] ${MARK}`);
    if (leftoverApps || leftoverClients || leftoverCases) {
      throw new Error(
        `FAIL: limpieza incompleta (apps=${leftoverApps}, clients=${leftoverClients}, cases=${leftoverCases})`,
      );
    }
    console.log("  ✓ limpieza exacta de fixtures");
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
