import type { CreditReport, CreditRound, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { writeActivityLog } from "@/src/server/activity";
import { toActivityContext } from "@/src/server/context";
import type { OrganizationContext } from "@/src/server/auth/guards";

type OrgIdOrCtx = string | OrganizationContext | { organizationId: string; userId?: string | null };

function orgIdOf(ctx: OrgIdOrCtx): string {
  return typeof ctx === "string" ? ctx : ctx.organizationId;
}

function actorOf(ctx: OrgIdOrCtx): string | null {
  if (typeof ctx === "string") return null;
  return "userId" in ctx ? (ctx.userId ?? null) : null;
}

async function firstOwnerUserId(organizationId: string, dbClient: Prisma.TransactionClient = prisma): Promise<string | null> {
  const owner = await dbClient.organizationMember.findFirst({
    where: {
      organizationId,
      role: "OWNER",
      user: { isActive: true },
    },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  return owner?.userId ?? null;
}

async function resolveTaskAssignee(
  organizationId: string,
  preferredId: string | null | undefined,
  dbClient: Prisma.TransactionClient = prisma,
): Promise<string | null> {
  if (preferredId) {
    const member = await dbClient.organizationMember.findUnique({
      where: {
        userId_organizationId: { userId: preferredId, organizationId },
      },
      include: { user: { select: { isActive: true } } },
    });
    if (member?.user.isActive) return preferredId;
  }
  return firstOwnerUserId(organizationId, dbClient);
}

const LEAD_FOLLOW_UP_DESC = "Nuevo lead — contactar en 24 h.";

function leadFollowUpTitle(firstName: string, lastName: string | null) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim() || "lead";
  return `Contactar a ${name} nuevo lead`;
}

/**
 * Tarea FOLLOW_UP idempotente para un prospecto nuevo.
 */
export async function ensureFollowUpTaskForLead(
  ctx: OrgIdOrCtx,
  clientId: string,
) {
  const organizationId = orgIdOf(ctx);
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: {
      id: true,
      assignedToId: true,
      firstName: true,
      lastName: true,
      serviceRequested: true,
    },
  });
  if (!client) return null;

  const existing = await prisma.task.findFirst({
    where: {
      organizationId,
      clientId: client.id,
      type: "FOLLOW_UP",
      status: "PENDING",
      OR: [
        { title: { contains: "nuevo lead" } },
        { title: { contains: "Nuevo lead" } },
        { description: { contains: "Nuevo lead" } },
      ],
    },
  });
  if (existing) return existing;

  const assignedToId = await resolveTaskAssignee(
    organizationId,
    client.assignedToId,
  );
  if (!assignedToId) return null;

  const dueAt = new Date();
  dueAt.setUTCDate(dueAt.getUTCDate() + 1);

  const need = client.serviceRequested?.trim();
  const description = need
    ? `${LEAD_FOLLOW_UP_DESC}\nQué necesita: ${need}`
    : LEAD_FOLLOW_UP_DESC;

  return prisma.task.create({
    data: {
      organizationId,
      clientId: client.id,
      title: leadFollowUpTitle(client.firstName, client.lastName),
      description,
      type: "FOLLOW_UP",
      priority: "HIGH",
      status: "PENDING",
      dueAt,
      assignedToId,
      createdById: actorOf(ctx),
    },
  });
}

export async function onNewLead(organizationId: string, clientId: string) {
  return ensureFollowUpTaskForLead(organizationId, clientId);
}

/**
 * Intake links activos sin uso y creados hace >48 h → tarea FOLLOW_UP.
 */
export async function onIntakeLinkCreated(_ctx?: OrgIdOrCtx) {
  // Firma compatible; el cron llama scanIncompleteIntakeFollowUps.
  return scanIncompleteIntakeFollowUps();
}

export async function scanIncompleteIntakeFollowUps(
  now = new Date(),
  organizationId?: string,
) {
  const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const links = await prisma.intakeLink.findMany({
    where: {
      isActive: true,
      useCount: 0,
      clientId: { not: null },
      createdAt: { lt: cutoff },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(organizationId ? { organizationId } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      caseId: true,
      client: { select: { assignedToId: true } },
      case: { select: { serviceCaseId: true } },
    },
    take: 200,
  });

  let created = 0;
  for (const link of links) {
    if (!link.clientId) continue;
    const title = "Formulario sin completar";
    const existing = await prisma.task.findFirst({
      where: {
        organizationId: link.organizationId,
        clientId: link.clientId,
        type: "FOLLOW_UP",
        status: { in: ["PENDING", "IN_PROGRESS"] },
        OR: [
          { title },
          { title: "Intake sin completar" },
          { description: { contains: `intake:${link.id}` } },
        ],
      },
    });
    if (existing) continue;

    const assignedToId = await resolveTaskAssignee(
      link.organizationId,
      link.client?.assignedToId,
    );
    if (!assignedToId) continue;

    await prisma.task.create({
      data: {
        organizationId: link.organizationId,
        clientId: link.clientId,
        caseId: link.caseId,
        serviceCaseId: link.case?.serviceCaseId ?? null,
        title,
        description: `El enlace de intake lleva más de 48 h sin usarse. (intake:${link.id})`,
        type: "FOLLOW_UP",
        priority: "NORMAL",
        status: "PENDING",
        dueAt: now,
        assignedToId,
      },
    });
    created += 1;
  }
  return { scanned: links.length, created };
}

/**
 * Tras marcar ronda como enviada: asegura expectedReviewAt (+30 d) y tarea de revisión.
 */
export async function onRoundSent(
  ctx: OrganizationContext,
  round: Pick<
    CreditRound,
    | "id"
    | "organizationId"
    | "caseId"
    | "roundNumber"
    | "expectedReviewAt"
  > & {
    case?: { clientId: string; assignedToId: string | null; caseCode?: string };
  },
) {
  if (round.organizationId !== ctx.organizationId) return null;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM CreditRound WHERE id = ${round.id} AND organizationId = ${ctx.organizationId} FOR UPDATE`;
    const current = await tx.creditRound.findFirst({
      where: { id: round.id, organizationId: ctx.organizationId },
      include: { case: { include: { serviceCase: true } } },
    });
    if (!current || !["SENT", "WAITING_UPDATE"].includes(current.status) ||
        !["OPEN", "ON_HOLD"].includes(current.case.serviceCase.status) || current.case.serviceCase.archivedAt) return null;
    const creditCase = current.case;
    let expectedReviewAt = current.expectedReviewAt;
    if (!expectedReviewAt) {
      expectedReviewAt = new Date(current.sentAt ?? current.startedAt);
      expectedReviewAt.setUTCDate(expectedReviewAt.getUTCDate() + 30);
      await tx.creditRound.update({ where: { id: current.id }, data: { expectedReviewAt } });
      await tx.serviceCase.update({ where: { id: creditCase.serviceCaseId }, data: { nextActionAt: expectedReviewAt } });
    }
    const titleNeedle = `Revisar ronda ${current.roundNumber}`;
    // Reconoce ambos tipos y títulos legacy. Una revisión completada no se recrea.
    const existing = await tx.task.findFirst({
      where: { organizationId: ctx.organizationId, roundId: current.id, status: { not: "CANCELLED" },
        OR: [{ type: { in: ["CREDIT_UPDATE", "REVIEW_RESULT"] } }, { title: { contains: titleNeedle } }] },
      orderBy: { createdAt: "asc" },
    });
    if (existing) {
      const task = existing.serviceCaseId === creditCase.serviceCaseId ? existing : await tx.task.update({ where: { id: existing.id }, data: { serviceCaseId: creditCase.serviceCaseId } });
      return { expectedReviewAt, task };
    }
    const assignedToId = await resolveTaskAssignee(ctx.organizationId, creditCase.assignedToId ?? ctx.userId, tx);
    if (!assignedToId) return { expectedReviewAt, task: null };
    const task = await tx.task.create({ data: {
      organizationId: ctx.organizationId, clientId: creditCase.clientId, caseId: creditCase.id, serviceCaseId: creditCase.serviceCaseId,
      roundId: current.id, title: `${titleNeedle} (${creditCase.caseCode})`, description: `Revisar resultado de la ronda ${current.roundNumber}.`,
      type: "REVIEW_RESULT", priority: "NORMAL", status: "PENDING", dueAt: expectedReviewAt, reminderAt: expectedReviewAt,
      assignedToId, createdById: ctx.userId,
    } });
    await writeActivityLog(toActivityContext(ctx), { type: "TASK_CREATED", clientId: creditCase.clientId, caseId: creditCase.id,
      serviceCaseId: creditCase.serviceCaseId, roundId: current.id, description: task.title, metadata: { taskId: task.id, source: "round_sent" } }, tx);
    return { expectedReviewAt, task };
  }, { timeout: 15000 });
}

/**
 * Si el reporte es UPDATE → tarea para analizar.
 */
export async function onCreditReportCreated(
  ctx: OrganizationContext,
  report: Pick<CreditReport, "id" | "organizationId" | "clientId" | "caseId" | "type">,
) {
  if (report.type !== "UPDATE") return null;
  if (report.organizationId !== ctx.organizationId) return null;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM CreditReport WHERE id = ${report.id} AND organizationId = ${ctx.organizationId} FOR UPDATE`;
    const current = await tx.creditReport.findFirst({ where: { id: report.id, organizationId: ctx.organizationId, type: "UPDATE" }, include: { case: { include: { serviceCase: true } } } });
    if (!current || !["OPEN", "ON_HOLD"].includes(current.case.serviceCase.status) || current.case.serviceCase.archivedAt) return null;
    const title = "Analizar reporte actualizado";
    const existing = await tx.task.findFirst({ where: { organizationId: ctx.organizationId, caseId: current.caseId, clientId: current.clientId,
      status: { not: "CANCELLED" }, title, description: { contains: `report:${current.id}` } } });
    if (existing) return existing.serviceCaseId === current.case.serviceCaseId ? existing : tx.task.update({ where: { id: existing.id }, data: { serviceCaseId: current.case.serviceCaseId } });
    const assignedToId = await resolveTaskAssignee(ctx.organizationId, current.case.assignedToId ?? ctx.userId, tx);
    if (!assignedToId) return null;
    const dueAt = new Date(); dueAt.setUTCDate(dueAt.getUTCDate() + 2);
    const task = await tx.task.create({ data: { organizationId: ctx.organizationId, clientId: current.clientId, caseId: current.caseId,
      serviceCaseId: current.case.serviceCaseId, title, description: `Analizar reporte de crédito actualizado. (report:${current.id})`,
      type: "FOLLOW_UP", priority: "NORMAL", status: "PENDING", dueAt, assignedToId, createdById: ctx.userId } });
    await writeActivityLog(toActivityContext(ctx), { type: "TASK_CREATED", clientId: current.clientId, caseId: current.caseId, serviceCaseId: current.case.serviceCaseId,
      description: task.title, metadata: { taskId: task.id, source: "credit_report_update" } }, tx);
    return task;
  }, { timeout: 15000 });
}

/**
 * Casos en etapa DOCUMENTS_PENDING sin tarea abierta REQUEST_DOCUMENT.
 */
export async function ensureDocsPendingTask(organizationId?: string) {
  const where: Prisma.CreditCaseWhereInput = {
    state: "OPEN",
    stage: { key: "DOCUMENTS_PENDING" },
    serviceCase: { archivedAt: null, status: "OPEN" },
    client: { archivedAt: null },
    ...(organizationId ? { organizationId } : {}),
  };

  const cases = await prisma.creditCase.findMany({
    where,
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      caseCode: true,
      assignedToId: true,
      serviceCaseId: true,
    },
    take: 200,
  });

  let created = 0;
  for (const creditCase of cases) {
    const externalKey = `case:${creditCase.id}:docs`;
    const existing = await prisma.task.findFirst({
      where: {
        organizationId: creditCase.organizationId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        OR: [
          { externalKey },
          { caseId: creditCase.id, type: "REQUEST_DOCUMENT" },
        ],
      },
    });
    if (existing) {
      if (!existing.externalKey) {
        await prisma.task.update({
          where: { id: existing.id },
          data: { externalKey },
        });
      }
      continue;
    }

    const assignedToId = await resolveTaskAssignee(
      creditCase.organizationId,
      creditCase.assignedToId,
    );
    if (!assignedToId) continue;

    const dueAt = new Date();
    dueAt.setUTCDate(dueAt.getUTCDate() + 2);

    await prisma.task.create({
      data: {
        organizationId: creditCase.organizationId,
        clientId: creditCase.clientId,
        caseId: creditCase.id,
        serviceCaseId: creditCase.serviceCaseId,
        externalKey,
        title: `Documentos pendientes · ${creditCase.caseCode}`,
        description: "El caso está en etapa Documentos pendientes.",
        type: "REQUEST_DOCUMENT",
        priority: "HIGH",
        status: "PENDING",
        dueAt,
        assignedToId,
      },
    });
    created += 1;
  }

  // Cierra tareas de docs si el caso ya no está en DOCUMENTS_PENDING.
  const openDocTasks = await prisma.task.findMany({
    where: {
      type: "REQUEST_DOCUMENT",
      status: { in: ["PENDING", "IN_PROGRESS"] },
      ...(organizationId ? { organizationId } : {}),
    },
    select: {
      id: true,
      case: { select: { state: true, stage: { select: { key: true } } } },
    },
    take: 300,
  });
  const staleIds = openDocTasks
    .filter(
      (t) =>
        !t.case ||
        t.case.state !== "OPEN" ||
        t.case.stage.key !== "DOCUMENTS_PENDING",
    )
    .map((t) => t.id);
  if (staleIds.length) {
    await prisma.task.updateMany({
      where: { id: { in: staleIds } },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }

  return { scanned: cases.length, created, closed: staleIds.length };
}

function clientLabel(c: {
  firstName: string;
  lastName: string | null;
  clientCode?: string;
}) {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return c.clientCode ? `${name} (${c.clientCode})` : name;
}

/** Completa o cancela la Task abierta ligada a externalKey. */
export async function resolveWorkQueueTask(
  organizationId: string,
  externalKey: string,
  outcome: "COMPLETED" | "CANCELLED" = "COMPLETED",
) {
  const task = await prisma.task.findFirst({
    where: {
      organizationId,
      externalKey,
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
  });
  if (!task) return null;
  return prisma.task.update({
    where: { id: task.id },
    data: {
      status: outcome,
      completedAt: outcome === "COMPLETED" ? new Date() : null,
    },
  });
}

/**
 * Pago PENDING → Task REQUEST_PAYMENT. Si deja de ser PENDING, se completa.
 */
export async function ensureTaskForPayment(
  ctx: OrgIdOrCtx,
  paymentId: string,
) {
  const organizationId = orgIdOf(ctx);
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, organizationId },
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      dueAt: true,
      clientId: true,
      caseId: true,
      serviceCaseId: true,
      client: {
        select: {
          firstName: true,
          lastName: true,
          clientCode: true,
          assignedToId: true,
        },
      },
    },
  });
  if (!payment) return null;

  const externalKey = `payment:${payment.id}`;
  if (payment.status !== "PENDING") {
    return resolveWorkQueueTask(organizationId, externalKey, "COMPLETED");
  }

  const assignedToId = await resolveTaskAssignee(
    organizationId,
    payment.client.assignedToId ?? actorOf(ctx),
  );
  if (!assignedToId) return null;

  const title = `Cobrar · ${clientLabel(payment.client)}`;
  const dueAt = payment.dueAt ?? new Date();
  const overdue = dueAt.getTime() < Date.now();
  const existing = await prisma.task.findFirst({
    where: {
      organizationId,
      OR: [
        { externalKey },
        {
          type: "REQUEST_PAYMENT",
          status: { in: ["PENDING", "IN_PROGRESS"] },
          description: { contains: `payment:${payment.id}` },
        },
      ],
    },
  });
  if (existing) {
    return prisma.task.update({
      where: { id: existing.id },
      data: {
        externalKey,
        title,
        dueAt,
        priority: overdue ? "URGENT" : "HIGH",
        clientId: payment.clientId,
        caseId: payment.caseId,
        serviceCaseId: payment.serviceCaseId,
        description: `Cobrar pago pendiente. (payment:${payment.id})`,
      },
    });
  }

  return prisma.task.create({
    data: {
      organizationId,
      externalKey,
      clientId: payment.clientId,
      caseId: payment.caseId,
      serviceCaseId: payment.serviceCaseId,
      title,
      description: `Cobrar pago pendiente. (payment:${payment.id})`,
      type: "REQUEST_PAYMENT",
      priority: overdue ? "URGENT" : "HIGH",
      status: "PENDING",
      dueAt,
      assignedToId,
      createdById: actorOf(ctx),
    },
  });
}

/**
 * Opportunity con nextFollowUpAt (no WON/LOST) → Task FOLLOW_UP de contacto.
 */
export async function ensureTaskForOpportunityFollowUp(
  ctx: OrgIdOrCtx,
  opportunityId: string,
) {
  const organizationId = orgIdOf(ctx);
  const opp = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId },
    select: {
      id: true,
      stage: true,
      nextFollowUpAt: true,
      ownerId: true,
      clientId: true,
      client: {
        select: {
          firstName: true,
          lastName: true,
          clientCode: true,
          assignedToId: true,
        },
      },
    },
  });
  if (!opp) return null;

  const externalKey = `opportunity:${opp.id}:followup`;
  if (
    opp.stage === "WON" ||
    opp.stage === "LOST" ||
    !opp.nextFollowUpAt
  ) {
    return resolveWorkQueueTask(organizationId, externalKey, "COMPLETED");
  }

  const assignedToId = await resolveTaskAssignee(
    organizationId,
    opp.ownerId ?? opp.client.assignedToId ?? actorOf(ctx),
  );
  if (!assignedToId) return null;

  const overdue = opp.nextFollowUpAt.getTime() < Date.now();
  const title = `Contactar · ${clientLabel(opp.client)}`;
  const existing = await prisma.task.findFirst({
    where: {
      organizationId,
      OR: [
        { externalKey },
        {
          type: "FOLLOW_UP",
          clientId: opp.clientId,
          status: { in: ["PENDING", "IN_PROGRESS"] },
          description: { contains: `opportunity:${opp.id}` },
        },
      ],
    },
  });
  if (existing) {
    return prisma.task.update({
      where: { id: existing.id },
      data: {
        externalKey,
        title,
        dueAt: opp.nextFollowUpAt,
        priority: overdue ? "URGENT" : "HIGH",
        description: `Seguimiento de lead. (opportunity:${opp.id})`,
      },
    });
  }

  return prisma.task.create({
    data: {
      organizationId,
      externalKey,
      clientId: opp.clientId,
      title,
      description: `Seguimiento de lead. (opportunity:${opp.id})`,
      type: "FOLLOW_UP",
      priority: overdue ? "URGENT" : "HIGH",
      status: "PENDING",
      dueAt: opp.nextFollowUpAt,
      assignedToId,
      createdById: actorOf(ctx),
    },
  });
}

/**
 * ServiceCase.nextActionAt → Task FOLLOW_UP “Próxima acción”.
 */
export async function ensureTaskForServiceNextAction(
  ctx: OrgIdOrCtx,
  serviceCaseId: string,
) {
  const organizationId = orgIdOf(ctx);
  const serviceCase = await prisma.serviceCase.findFirst({
    where: { id: serviceCaseId, organizationId },
    select: {
      id: true,
      caseNumber: true,
      nextActionAt: true,
      status: true,
      archivedAt: true,
      clientId: true,
      assignedToId: true,
      creditCase: { select: { id: true, caseCode: true } },
      client: {
        select: { firstName: true, lastName: true, clientCode: true },
      },
    },
  });
  if (!serviceCase) return null;

  const externalKey = `serviceCase:${serviceCase.id}:nextAction`;
  if (
    !serviceCase.nextActionAt ||
    serviceCase.archivedAt ||
    serviceCase.status === "COMPLETED" ||
    serviceCase.status === "CANCELED"
  ) {
    return resolveWorkQueueTask(organizationId, externalKey, "COMPLETED");
  }

  const assignedToId = await resolveTaskAssignee(
    organizationId,
    serviceCase.assignedToId ?? actorOf(ctx),
  );
  if (!assignedToId) return null;

  const code =
    serviceCase.creditCase?.caseCode ?? serviceCase.caseNumber;
  const overdue = serviceCase.nextActionAt.getTime() < Date.now();
  const title = `Próxima acción · ${code}`;
  const existing = await prisma.task.findFirst({
    where: {
      organizationId,
      OR: [
        { externalKey },
        {
          serviceCaseId: serviceCase.id,
          type: "FOLLOW_UP",
          status: { in: ["PENDING", "IN_PROGRESS"] },
          description: { contains: "nextAction" },
        },
      ],
    },
  });
  if (existing) {
    return prisma.task.update({
      where: { id: existing.id },
      data: {
        externalKey,
        title,
        dueAt: serviceCase.nextActionAt,
        priority: overdue ? "URGENT" : "NORMAL",
        caseId: serviceCase.creditCase?.id ?? null,
        description: `Próxima acción del expediente. (nextAction:${serviceCase.id})`,
      },
    });
  }

  return prisma.task.create({
    data: {
      organizationId,
      externalKey,
      clientId: serviceCase.clientId,
      caseId: serviceCase.creditCase?.id ?? null,
      serviceCaseId: serviceCase.id,
      title,
      description: `Próxima acción del expediente. (nextAction:${serviceCase.id})`,
      type: "FOLLOW_UP",
      priority: overdue ? "URGENT" : "NORMAL",
      status: "PENDING",
      dueAt: serviceCase.nextActionAt,
      assignedToId,
      createdById: actorOf(ctx),
    },
  });
}

/**
 * Reconcile de seguridad (cron): materializa señales huérfanas.
 */
export async function reconcileWorkQueueTasks(organizationId?: string) {
  const orgFilter = organizationId ? { organizationId } : {};

  const [payments, opportunities, serviceCases, docs] = await Promise.all([
    prisma.payment.findMany({
      where: { ...orgFilter, status: "PENDING" },
      select: { id: true, organizationId: true },
      take: 200,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.opportunity.findMany({
      where: {
        ...orgFilter,
        stage: { notIn: ["WON", "LOST"] },
        nextFollowUpAt: { not: null },
      },
      select: { id: true, organizationId: true },
      take: 200,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.serviceCase.findMany({
      where: {
        ...orgFilter,
        archivedAt: null,
        status: { in: ["OPEN", "ON_HOLD"] },
        nextActionAt: { not: null },
      },
      select: { id: true, organizationId: true },
      take: 200,
      orderBy: { updatedAt: "desc" },
    }),
    ensureDocsPendingTask(organizationId),
  ]);

  let ensured = 0;
  for (const p of payments) {
    const t = await ensureTaskForPayment(p.organizationId, p.id);
    if (t) ensured += 1;
  }
  for (const o of opportunities) {
    const t = await ensureTaskForOpportunityFollowUp(o.organizationId, o.id);
    if (t) ensured += 1;
  }
  for (const s of serviceCases) {
    const t = await ensureTaskForServiceNextAction(s.organizationId, s.id);
    if (t) ensured += 1;
  }

  return {
    payments: payments.length,
    opportunities: opportunities.length,
    serviceCases: serviceCases.length,
    docs,
    ensured,
  };
}
