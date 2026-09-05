import {
  Prisma,
  type OpportunityStage,
} from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { writeActivityLog } from "@/src/server/activity";
import { toActivityContext } from "@/src/server/context";
import { createCreditCase } from "@/src/server/cases";
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
    },
  },
  owner: { select: { id: true, name: true } },
  wonCase: { select: { id: true, caseCode: true } },
} as const;

async function getOpportunityOrThrow(ctx: OrganizationContext, id: string) {
  const opp = await prisma.opportunity.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: OPPORTUNITY_INCLUDE,
  });
  if (!opp) throw new DomainError("Oportunidad no encontrada.");
  return opp;
}

/** Agrupa oportunidades abiertas por etapa (Kanban). */
export async function listByStage(ctx: OrganizationContext) {
  const rows = await prisma.opportunity.findMany({
    where: { organizationId: ctx.organizationId },
    include: OPPORTUNITY_INCLUDE,
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
 * Cierra como WON: crea CreditCase, pone cliente ACTIVE y guarda wonCaseId.
 */
export async function markWon(ctx: OrganizationContext, opportunityId: string) {
  const opp = await getOpportunityOrThrow(ctx, opportunityId);
  if (opp.stage === "WON") {
    throw new DomainError("La oportunidad ya está marcada como ganada.");
  }
  if (opp.stage === "LOST") {
    throw new DomainError("No se puede ganar una oportunidad perdida.");
  }

  const creditCase = await createCreditCase(ctx, {
    clientId: opp.clientId,
    assignedToId: opp.ownerId,
    summary: `Caso creado desde oportunidad comercial.`,
  });

  return prisma.$transaction(async (tx) => {
    await tx.client.update({
      where: { id: opp.clientId },
      data: { status: "ACTIVE" },
    });

    const updated = await tx.opportunity.update({
      where: { id: opp.id },
      data: {
        stage: "WON",
        wonCaseId: creditCase.id,
        lostReason: null,
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
        metadata: {
          opportunityId: opp.id,
          caseId: creditCase.id,
          caseCode: creditCase.caseCode,
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
