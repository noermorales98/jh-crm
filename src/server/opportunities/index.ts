import {
  Prisma,
  type ActivityType,
  type LeadChannel,
  type OpportunityStage,
} from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { nextClientCode } from "@/src/server/folios";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";
import { createCreditCase } from "@/src/server/cases";
import { resolveAssigneeForOrg } from "@/src/server/users";
import { OPPORTUNITY_STAGES } from "@/src/lib/validation/opportunities";
import { labelFor, OPPORTUNITY_STAGE_LABELS } from "@/src/lib/labels";

export const KANBAN_STAGES = OPPORTUNITY_STAGES;

export interface OpportunityCreateData {
  clientId: string;
  ownerId?: string | null;
  stage?: OpportunityStage;
  estimatedValue?: Prisma.Decimal | number | string | null;
  source?: string | null;
  campaign?: string | null;
  nextFollowUpAt?: Date | null;
}

/** Alta de prospecto LD-001: Client LEAD + Opportunity (sin tabla Lead). */
export interface LeadCreateData {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  leadChannel?: LeadChannel | null;
  serviceRequested?: string | null;
  ownerId?: string | null;
  estimatedValue?: Prisma.Decimal | number | string | null;
  campaign?: string | null;
  nextFollowUpAt?: Date | null;
}

function emptyToNull(v?: string | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

function toDecimal(
  v: Prisma.Decimal | number | string | null | undefined,
): Prisma.Decimal | null {
  if (v === undefined || v === null || v === "") return null;
  return new Prisma.Decimal(v);
}

const LEAD_ACTIVITY_TYPES: ActivityType[] = [
  "NOTE",
  "CREATED",
  "CONSULTATION_REQUESTED",
];

const OPPORTUNITY_INCLUDE = {
  client: {
    select: {
      id: true,
      clientCode: true,
      firstName: true,
      lastName: true,
      status: true,
      email: true,
      phone: true,
      source: true,
      leadChannel: true,
      serviceRequested: true,
      preferredContactMethod: true,
      preferredContactTime: true,
      attribution: true,
      assignedToId: true,
      createdAt: true,
      consultations: {
        select: {
          id: true,
          notes: true,
          status: true,
          amount: true,
          requestedAt: true,
        },
        orderBy: { requestedAt: "desc" as const },
        take: 8,
      },
      activities: {
        where: {
          type: { in: LEAD_ACTIVITY_TYPES },
        },
        select: {
          id: true,
          type: true,
          description: true,
          createdAt: true,
          metadata: true,
        },
        orderBy: { createdAt: "desc" as const },
        take: 12,
      },
      notes: {
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" as const },
        take: 40,
      },
    },
  },
  owner: { select: { id: true, name: true } },
  wonCase: { select: { id: true, caseCode: true, serviceCaseId: true } },
  wonServiceCase: {
    select: {
      id: true,
      caseNumber: true,
      status: true,
      serviceId: true,
      creditCase: { select: { id: true, caseCode: true } },
    },
  },
} satisfies Prisma.OpportunityInclude;

async function getOpportunityOrThrow(ctx: OrganizationContext, id: string) {
  const opp = await prisma.opportunity.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: OPPORTUNITY_INCLUDE,
  });
  if (!opp) throw new DomainError("Oportunidad no encontrada.");
  return opp;
}

/** Agrupa oportunidades abiertas por etapa (Kanban / Leads UI). */
export async function listByStage(ctx: OrganizationContext) {
  const rows = await prisma.opportunity.findMany({
    where: { organizationId: ctx.organizationId },
    include: {
      ...OPPORTUNITY_INCLUDE,
      // nextFollowUpAt is a scalar on Opportunity — already included
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  const columns: Record<OpportunityStage, typeof rows> = {
    NEW_LEAD: [],
    CONTACTED: [],
    CONSULTATION: [],
    INTAKE_SENT: [],
    INTAKE_COMPLETED: [],
    PROPOSAL: [],
    WAITING_PAYMENT: [],
    WON: [],
    LOST: [],
  };

  for (const row of rows) {
    columns[row.stage].push(row);
  }
  return columns;
}

/**
 * LD-001 — Prospecto = Client (LEAD) + Opportunity en la misma transacción.
 */
export async function createLead(ctx: OrganizationContext, data: LeadCreateData) {
  const firstName = data.firstName.trim();
  if (!firstName) throw new DomainError("El nombre es obligatorio.");

  const assigneeId = await resolveAssigneeForOrg(
    ctx.organizationId,
    data.ownerId ?? ctx.userId,
  );
  if (assigneeId) {
    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: assigneeId,
          organizationId: ctx.organizationId,
        },
      },
      include: { user: { select: { isActive: true } } },
    });
    if (!member || !member.user.isActive) {
      throw new DomainError(
        "El responsable seleccionado no es un miembro activo de la organización.",
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const { code } = await nextClientCode(tx, ctx.organizationId);
    const source = emptyToNull(data.source);
    const client = await tx.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: code,
        firstName,
        lastName: emptyToNull(data.lastName),
        email: emptyToNull(data.email)?.toLowerCase() ?? null,
        phone: emptyToNull(data.phone),
        source,
        leadChannel: data.leadChannel ?? null,
        serviceRequested: emptyToNull(data.serviceRequested),
        status: "LEAD",
        assignedToId: assigneeId,
      },
    });

    const opp = await tx.opportunity.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: client.id,
        ownerId: assigneeId,
        stage: "NEW_LEAD",
        estimatedValue: toDecimal(data.estimatedValue),
        source,
        campaign: emptyToNull(data.campaign),
        nextFollowUpAt: data.nextFollowUpAt ?? null,
      },
      include: OPPORTUNITY_INCLUDE,
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "CREATED",
        description: `Prospecto ${client.clientCode} creado: ${client.firstName}${
          client.lastName ? ` ${client.lastName}` : ""
        }`.trim(),
        clientId: client.id,
        metadata: { clientCode: client.clientCode, asLead: true },
      },
      tx,
    );

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "OPPORTUNITY_CREATED",
        description: `Oportunidad creada en etapa "${labelFor(
          OPPORTUNITY_STAGE_LABELS,
          opp.stage,
        )}".`,
        clientId: client.id,
        metadata: { opportunityId: opp.id, stage: opp.stage },
      },
      tx,
    );

    return { client, opportunity: opp };
  });
}

export interface LeadUpdateData extends LeadCreateData {}

/**
 * LD-002 — Editar persona (Client) + deal (Opportunity). No borra ni cierra.
 * Conserva historial vía ActivityLog. Stage/WON/LOST no se tocan aquí.
 */
export async function updateLead(
  ctx: OrganizationContext,
  opportunityId: string,
  data: LeadUpdateData,
) {
  const firstName = data.firstName.trim();
  if (!firstName) throw new DomainError("El nombre es obligatorio.");

  const existing = await getOpportunityOrThrow(ctx, opportunityId);

  const assigneeId = await resolveAssigneeForOrg(
    ctx.organizationId,
    data.ownerId ?? existing.ownerId ?? ctx.userId,
  );
  if (assigneeId) {
    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: assigneeId,
          organizationId: ctx.organizationId,
        },
      },
      include: { user: { select: { isActive: true } } },
    });
    if (!member || !member.user.isActive) {
      throw new DomainError(
        "El responsable seleccionado no es un miembro activo de la organización.",
      );
    }
  }

  const source = emptyToNull(data.source);

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.update({
      where: { id: existing.clientId },
      data: {
        firstName,
        lastName: emptyToNull(data.lastName),
        email: emptyToNull(data.email)?.toLowerCase() ?? null,
        phone: emptyToNull(data.phone),
        source,
        leadChannel: data.leadChannel ?? null,
        serviceRequested: emptyToNull(data.serviceRequested),
        assignedToId: assigneeId,
      },
    });

    const opp = await tx.opportunity.update({
      where: { id: existing.id },
      data: {
        ownerId: assigneeId,
        estimatedValue: toDecimal(data.estimatedValue),
        source,
        campaign: emptyToNull(data.campaign),
        nextFollowUpAt: data.nextFollowUpAt ?? null,
      },
      include: OPPORTUNITY_INCLUDE,
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "NOTE",
        description: `Lead actualizado: ${client.firstName}${
          client.lastName ? ` ${client.lastName}` : ""
        }`.trim(),
        clientId: client.id,
        metadata: {
          opportunityId: opp.id,
          action: "lead_updated",
          nextFollowUpAt: opp.nextFollowUpAt?.toISOString() ?? null,
        },
      },
      tx,
    );

    return { client, opportunity: opp };
  });
}

/**
 * LD-004 — Oportunidades abiertas con seguimiento vencido o próximo (7 días).
 */
export async function listFollowUpsDue(
  ctx: OrganizationContext,
  opts?: { withinDays?: number; take?: number },
) {
  const withinDays = opts?.withinDays ?? 7;
  const take = opts?.take ?? 15;
  const now = new Date();
  const until = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

  const rows = await prisma.opportunity.findMany({
    where: {
      organizationId: ctx.organizationId,
      stage: { notIn: ["WON", "LOST"] },
      nextFollowUpAt: { not: null, lte: until },
    },
    include: OPPORTUNITY_INCLUDE,
    orderBy: { nextFollowUpAt: "asc" },
    take,
  });

  return rows.map((row) => ({
    ...row,
    overdue: row.nextFollowUpAt != null && row.nextFollowUpAt.getTime() < now.getTime(),
  }));
}

export async function createOpportunity(
  ctx: OrganizationContext,
  data: OpportunityCreateData,
) {
  const client = await prisma.client.findFirst({
    where: { id: data.clientId, organizationId: ctx.organizationId },
    select: { id: true, firstName: true, lastName: true, status: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");
  if (client.status === "ARCHIVED") {
    throw new DomainError("No se puede crear una oportunidad para un cliente archivado.");
  }

  if (data.ownerId) {
    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: data.ownerId,
          organizationId: ctx.organizationId,
        },
      },
    });
    if (!member) throw new DomainError("El responsable no pertenece a la organización.");
  }

  return prisma.$transaction(async (tx) => {
    const opp = await tx.opportunity.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: client.id,
        ownerId: data.ownerId ?? ctx.userId,
        stage: data.stage ?? "NEW_LEAD",
        estimatedValue: toDecimal(data.estimatedValue),
        source: emptyToNull(data.source),
        campaign: emptyToNull(data.campaign),
        nextFollowUpAt: data.nextFollowUpAt ?? null,
      },
      include: OPPORTUNITY_INCLUDE,
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "OPPORTUNITY_CREATED",
        description: `Oportunidad creada en etapa "${labelFor(OPPORTUNITY_STAGE_LABELS, opp.stage)}".`,
        clientId: client.id,
        metadata: { opportunityId: opp.id, stage: opp.stage },
      },
      tx,
    );

    return opp;
  });
}

export async function updateStage(
  ctx: OrganizationContext,
  opportunityId: string,
  stage: OpportunityStage,
) {
  const opp = await getOpportunityOrThrow(ctx, opportunityId);
  if (opp.stage === "WON" || opp.stage === "LOST") {
    throw new DomainError("No se puede mover una oportunidad cerrada. Crea una nueva si hace falta.");
  }
  if (stage === "WON") {
    throw new DomainError("Usa «Marcar ganada» para cerrar como WON (crea el caso).");
  }
  if (stage === "LOST") {
    throw new DomainError("Usa «Marcar perdida» para cerrar como LOST.");
  }
  if (opp.stage === stage) return opp;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.opportunity.update({
      where: { id: opp.id },
      data: { stage },
      include: OPPORTUNITY_INCLUDE,
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "OPPORTUNITY_STAGE_CHANGED",
        description: `Oportunidad movida de "${labelFor(OPPORTUNITY_STAGE_LABELS, opp.stage)}" a "${labelFor(OPPORTUNITY_STAGE_LABELS, stage)}".`,
        clientId: opp.clientId,
        metadata: {
          opportunityId: opp.id,
          fromStage: opp.stage,
          toStage: stage,
        },
      },
      tx,
    );

    return updated;
  });
}

/**
 * Cierra como WON: ServiceCase+CreditCase + Client ACTIVE + won ids en una tx (BR-012 / LD-005).
 * No duplica Client; no toca source / leadChannel / attribution (BR-011).
 */
export async function markWon(ctx: OrganizationContext, opportunityId: string) {
  const opp = await getOpportunityOrThrow(ctx, opportunityId);
  if (opp.stage === "WON") {
    throw new DomainError("La oportunidad ya está marcada como ganada.");
  }
  if (opp.stage === "LOST") {
    throw new DomainError("No se puede ganar una oportunidad perdida.");
  }
  if (opp.wonCaseId || opp.wonServiceCaseId) {
    throw new DomainError(
      "Esta oportunidad ya tiene un caso vinculado; no se puede volver a convertir.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const clientRow = await tx.client.findFirst({
      where: { id: opp.clientId, organizationId: ctx.organizationId },
      select: { id: true, status: true },
    });
    if (!clientRow) throw new DomainError("Cliente no encontrado.");

    const creditCase = await createCreditCase(
      ctx,
      {
        clientId: opp.clientId,
        assignedToId: opp.ownerId,
        summary: `Caso creado desde oportunidad comercial.`,
      },
      tx,
    );

    if (!creditCase.serviceCaseId) {
      throw new DomainError(
        "La conversión WON requiere ServiceCase; CreditCase quedó sin vínculo.",
      );
    }

    // Solo LEAD → ACTIVE (ciclo comercial). No tocar ACTIVE/ARCHIVED aquí.
    if (clientRow.status === "LEAD") {
      await tx.client.update({
        where: { id: opp.clientId },
        data: { status: "ACTIVE" },
      });
    }

    // BR-011: no tocamos source / leadChannel / attribution — solo status si LEAD.
    // Fase 4 / D5: wonServiceCaseId es el único enlace WON nuevo;
    // wonCaseId queda sin escritura (solo lectura legacy).
    const updated = await tx.opportunity.update({
      where: { id: opp.id },
      data: {
        stage: "WON",
        wonServiceCaseId: creditCase.serviceCaseId,
        lostReason: null,
        nextFollowUpAt: null,
      },
      include: OPPORTUNITY_INCLUDE,
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "OPPORTUNITY_WON",
        description: `Oportunidad ganada → caso ${creditCase.caseCode}.`,
        clientId: opp.clientId,
        caseId: creditCase.id,
        serviceCaseId: creditCase.serviceCaseId,
        metadata: {
          opportunityId: opp.id,
          caseId: creditCase.id,
          caseCode: creditCase.caseCode,
          serviceCaseId: creditCase.serviceCaseId,
          clientWasLead: clientRow.status === "LEAD",
        },
      },
      tx,
    );

    return updated;
  });
}

export async function markLost(
  ctx: OrganizationContext,
  opportunityId: string,
  lostReason: string,
) {
  const opp = await getOpportunityOrThrow(ctx, opportunityId);
  if (opp.stage === "WON") {
    throw new DomainError("No se puede marcar como perdida una oportunidad ganada.");
  }
  if (opp.stage === "LOST") {
    throw new DomainError("La oportunidad ya está marcada como perdida.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.opportunity.update({
      where: { id: opp.id },
      data: {
        stage: "LOST",
        lostReason: lostReason.trim(),
      },
      include: OPPORTUNITY_INCLUDE,
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "OPPORTUNITY_STAGE_CHANGED",
        description: `Oportunidad marcada como perdida: ${lostReason.trim().slice(0, 120)}`,
        clientId: opp.clientId,
        metadata: {
          opportunityId: opp.id,
          fromStage: opp.stage,
          toStage: "LOST",
        },
      },
      tx,
    );

    return updated;
  });
}
