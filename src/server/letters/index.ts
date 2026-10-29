import type { CreditBureau, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";
import { clientFullName } from "@/src/server/page-helpers";
import {
  renderTemplate,
  type LetterTemplateVars,
} from "@/src/lib/letters/template";
import { generateDisputeLetterPdf } from "@/src/lib/pdf/dispute-letter";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";
import {
  CFPB_TEMPLATE,
  DISPUTE_STRATEGIES,
  REVIEW_DAYS,
  STRATEGY_TEMPLATES,
  isDisputeStrategy,
  type DisputeStrategy,
} from "@/src/lib/disputes/strategies";

const BUREAU_RECIPIENTS: Record<CreditBureau, string> = {
  EXPERIAN: "Experian — Dispute Department",
  EQUIFAX: "Equifax — Dispute Department",
  TRANSUNION: "TransUnion — Dispute Department",
};

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

async function syncLettersCount(tx: Prisma.TransactionClient, roundId: string) {
  const count = await tx.disputeLetter.count({
    where: { roundId, status: { not: "CANCELLED" } },
  });
  await tx.creditRound.update({
    where: { id: roundId },
    data: { lettersCount: count },
  });
}

async function getOrgPdfInfo(organizationId: string) {
  const { loadPdfOrganization } = await import("@/src/server/pdf/org-info");
  const { info, timezone } = await loadPdfOrganization(organizationId);
  return { ...info, timezone };
}

/**
 * Deja una plantilla por método (y la de la queja al CFPB). Solo crea las que
 * faltan; nunca pisa una que la organización ya editó. La "Disputa general"
 * vieja (sin método) cuenta como GENERAL.
 */
export async function ensureDefaultTemplates(ctx: OrganizationContext) {
  const existing = await prisma.disputeLetterTemplate.findMany({
    where: { organizationId: ctx.organizationId },
    select: { strategy: true, name: true },
  });
  const have = new Set(existing.map((t) => t.strategy ?? (t.name === "Disputa general FCRA" ? "GENERAL" : "")));
  const missing: { strategy: string; name: string; subject: string; content: string }[] = [];
  for (const strategy of DISPUTE_STRATEGIES) {
    if (!have.has(strategy)) missing.push({ strategy, ...STRATEGY_TEMPLATES[strategy] });
  }
  if (!have.has("CFPB")) missing.push({ strategy: "CFPB", ...CFPB_TEMPLATE });
  if (missing.length > 0) {
    await prisma.disputeLetterTemplate.createMany({
      data: missing.map((t) => ({
        organizationId: ctx.organizationId,
        name: t.name,
        subject: t.subject,
        content: t.content,
        strategy: t.strategy,
        version: 1,
        active: true,
      })),
    });
  }
  return listTemplates(ctx);
}

/** Plantilla activa de un método (o la general si falta). */
export async function templateForStrategy(ctx: OrganizationContext, strategy: DisputeStrategy | "CFPB") {
  const templates = await ensureDefaultTemplates(ctx);
  const active = templates.filter((t) => t.active);
  return (
    active.find((t) => t.strategy === strategy) ??
    active.find((t) => t.strategy === "GENERAL" || (t.strategy == null && t.name === "Disputa general FCRA")) ??
    active[0] ??
    null
  );
}

export async function listTemplates(ctx: OrganizationContext) {
  return prisma.disputeLetterTemplate.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function createTemplate(
  ctx: OrganizationContext,
  data: {
    name: string;
    subject: string;
    content: string;
    bureau?: CreditBureau | null;
  },
) {
  return prisma.disputeLetterTemplate.create({
    data: {
      organizationId: ctx.organizationId,
      name: data.name.trim(),
      subject: data.subject.trim(),
      content: data.content,
      bureau: data.bureau ?? null,
      active: true,
    },
  });
}

export async function updateTemplate(
  ctx: OrganizationContext,
  templateId: string,
  data: {
    name?: string;
    subject?: string;
    content?: string;
    bureau?: CreditBureau | null;
    active?: boolean;
  },
) {
  const existing = await prisma.disputeLetterTemplate.findFirst({
    where: { id: templateId, organizationId: ctx.organizationId },
  });
  if (!existing) throw new DomainError("Plantilla no encontrada.");
  return prisma.disputeLetterTemplate.update({
    where: { id: existing.id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.subject !== undefined ? { subject: data.subject.trim() } : {}),
      ...(data.content !== undefined ? { content: data.content } : {}),
      ...(data.bureau !== undefined ? { bureau: data.bureau } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      version: existing.version + (data.content !== undefined ? 1 : 0),
    },
  });
}

type LetterItem = {
  id: string;
  creditorName: string;
  accountNumberMasked: string | null;
  disputeReason: string;
};

async function buildVarsForItems(
  ctx: OrganizationContext,
  roundId: string,
  bureau: CreditBureau,
  disputeItemIds: string[],
): Promise<{ vars: LetterTemplateVars; items: LetterItem[] }> {
  const round = await prisma.creditRound.findFirst({
    where: { id: roundId, organizationId: ctx.organizationId },
    include: {
      case: {
        include: {
          client: true,
        },
      },
    },
  });
  if (!round) throw new DomainError("Ronda no encontrada.");

  const disputeItems = await prisma.disputeItem.findMany({
    where: {
      organizationId: ctx.organizationId,
      roundId,
      id: { in: disputeItemIds },
      status: { not: "CANCELLED" },
      bureau,
    },
    include: {
      creditItem: {
        select: {
          creditorName: true,
          accountNumberMasked: true,
        },
      },
      inquiry: { select: { creditorName: true, inquiryDate: true } },
    },
  });
  if (disputeItems.length === 0) {
    throw new DomainError("Selecciona al menos un elemento disputado de este buró.");
  }

  const items: LetterItem[] = disputeItems.map((d) => ({
    id: d.id,
    creditorName:
      d.creditItem?.creditorName ??
      (d.inquiry
        ? `${d.inquiry.creditorName}${d.inquiry.inquiryDate ? ` (inquiry ${d.inquiry.inquiryDate.toISOString().slice(0, 10)})` : " (inquiry)"}`
        : d.targetLabel ?? "Item"),
    accountNumberMasked: d.creditItem?.accountNumberMasked ?? null,
    disputeReason: d.disputeReason,
  }));

  const settings = await getOrgPdfInfo(ctx.organizationId);
  const client = round.case.client;
  const address = [client.addressLine1, client.addressLine2].filter(Boolean).join(", ");
  const first = items[0]!;
  const itemLines = items
    .map((item, index) => {
      const account = item.accountNumberMasked ? ` - Account ${item.accountNumberMasked}` : "";
      return `${index + 1}. ${item.creditorName}${account}\n   Reason: ${item.disputeReason}`;
    })
    .join("\n");

  const vars: LetterTemplateVars = {
    "client.fullName": clientFullName(client),
    "client.address": address,
    "client.city": client.city ?? "",
    "client.state": client.state ?? "",
    "client.zip": client.postalCode ?? "",
    bureau: CREDIT_BUREAU_LABELS[bureau] ?? bureau,
    creditor: first.creditorName,
    accountNumber: first.accountNumberMasked ?? "****",
    disputeReason: first.disputeReason,
    items: itemLines,
    date: new Date().toLocaleDateString("en-US"),
    "organization.legalName": settings.legalName,
  };

  // Si hay varios ítems, listar acreedores en disputeReason ampliado
  if (items.length > 1) {
    vars.creditor = items.map((d) => d.creditorName).join("; ");
    vars.accountNumber = items.map((d) => d.accountNumberMasked ?? "****").join("; ");
    vars.disputeReason = items.map((d) => `${d.creditorName}: ${d.disputeReason}`).join("\n");
  }

  return { vars, items };
}

export async function previewLetter(
  ctx: OrganizationContext,
  data: {
    roundId: string;
    bureau: CreditBureau;
    templateId: string;
    disputeItemIds: string[];
  },
) {
  const template = await prisma.disputeLetterTemplate.findFirst({
    where: {
      id: data.templateId,
      organizationId: ctx.organizationId,
      active: true,
    },
  });
  if (!template) throw new DomainError("Plantilla no encontrada o inactiva.");

  const { vars, items } = await buildVarsForItems(
    ctx,
    data.roundId,
    data.bureau,
    data.disputeItemIds,
  );

  return {
    subject: renderTemplate(template.subject, vars),
    content: renderTemplate(template.content, vars),
    recipient: BUREAU_RECIPIENTS[data.bureau],
    vars,
    items,
    template,
  };
}

export async function createLetterDraft(
  ctx: OrganizationContext,
  data: {
    roundId: string;
    bureau: CreditBureau;
    templateId: string;
    disputeItemIds: string[];
    subject?: string;
    content?: string;
    recipient?: string;
    notes?: string | null;
  },
) {
  const preview = await previewLetter(ctx, data);
  const round = await prisma.creditRound.findFirst({
    where: { id: data.roundId, organizationId: ctx.organizationId },
    include: { case: { select: { clientId: true, id: true } } },
  });
  if (!round) throw new DomainError("Ronda no encontrada.");

  return prisma.$transaction(async (tx) => {
    const letter = await tx.disputeLetter.create({
      data: {
        organizationId: ctx.organizationId,
        roundId: round.id,
        bureau: data.bureau,
        templateId: preview.template.id,
        recipient: data.recipient?.trim() || preview.recipient,
        subjectSnapshot: data.subject?.trim() || preview.subject,
        contentSnapshot: data.content ?? preview.content,
        status: "READY_FOR_REVIEW",
        notes: emptyToNull(data.notes),
        channel: preview.template.strategy === "CFPB" ? "CFPB" : "MAIL",
        strategy: preview.template.strategy ?? null,
        items: {
          create: data.disputeItemIds.map((disputeItemId) => ({ disputeItemId })),
        },
      },
    });

    await tx.disputeItem.updateMany({
      where: {
        id: { in: data.disputeItemIds },
        organizationId: ctx.organizationId,
      },
      data: { status: "LETTER_GENERATED" },
    });

    await syncLettersCount(tx, round.id);

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "LETTER_CREATED",
        description: `Borrador de carta (${CREDIT_BUREAU_LABELS[data.bureau]}) listo para revisión`,
        clientId: round.case.clientId,
        caseId: round.case.id,
        roundId: round.id,
        metadata: { letterId: letter.id, bureau: data.bureau },
      },
      tx,
    );

    return letter;
  });
}

export async function updateLetterDraft(
  ctx: OrganizationContext,
  letterId: string,
  data: {
    subject?: string;
    content?: string;
    recipient?: string;
    notes?: string | null;
  },
) {
  const letter = await getLetterOrThrow(ctx, letterId);
  if (letter.status !== "DRAFT" && letter.status !== "READY_FOR_REVIEW") {
    throw new DomainError("Solo se pueden editar cartas en borrador o revisión.");
  }

  const updated = await prisma.disputeLetter.update({
    where: { id: letter.id },
    data: {
      ...(data.subject !== undefined ? { subjectSnapshot: data.subject.trim() } : {}),
      ...(data.content !== undefined ? { contentSnapshot: data.content } : {}),
      ...(data.recipient !== undefined ? { recipient: data.recipient.trim() } : {}),
      ...(data.notes !== undefined ? { notes: emptyToNull(data.notes) } : {}),
      status: "READY_FOR_REVIEW",
    },
  });

  await writeActivityLog(toActivityContext(ctx), {
    type: "LETTER_UPDATED",
    description: "Carta de disputa editada (revisión humana)",
    clientId: letter.round.case.clientId,
    caseId: letter.round.caseId,
    roundId: letter.roundId,
    metadata: { letterId: letter.id },
  });

  return updated;
}

/**
 * Marca FINAL tras revisión humana. No genera ni guarda PDF en S3.
 */
export async function finalizeLetter(ctx: OrganizationContext, letterId: string) {
  const letter = await getLetterOrThrow(ctx, letterId);
  if (letter.status !== "READY_FOR_REVIEW" && letter.status !== "DRAFT") {
    throw new DomainError("La carta debe estar en revisión antes de marcarla como final.");
  }
  if (!letter.contentSnapshot.trim()) {
    throw new DomainError("El contenido de la carta está vacío.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.disputeLetter.update({
      where: { id: letter.id },
      data: {
        status: "FINAL",
        finalizedAt: new Date(),
      },
    });

    await syncLettersCount(tx, letter.roundId);

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "LETTER_FINALIZED",
        description: `Carta finalizada (${CREDIT_BUREAU_LABELS[letter.bureau]})`,
        clientId: letter.round.case.clientId,
        caseId: letter.round.caseId,
        roundId: letter.roundId,
        metadata: { letterId: letter.id },
      },
      tx,
    );

    return { letter: updated };
  });
}

/** PDF on-demand desde el snapshot de la carta (sin persistir). */
export async function buildLetterPdf(
  ctx: OrganizationContext,
  letterId: string,
): Promise<{ pdf: Buffer; filename: string }> {
  const letter = await getLetterOrThrow(ctx, letterId);
  if (letter.status === "CANCELLED") {
    throw new DomainError("No se puede descargar una carta cancelada.");
  }
  const org = await getOrgPdfInfo(ctx.organizationId);
  const folio = `LTR-${letter.round.roundNumber}-${letter.bureau.slice(0, 3)}`;
  const pdf = generateDisputeLetterPdf({
    organization: org,
    folio,
    subject: letter.subjectSnapshot,
    recipient: letter.recipient,
    body: letter.contentSnapshot,
    issuedAt: letter.finalizedAt ?? letter.generatedAt,
    timezone: org.timezone,
  });
  return { pdf, filename: `${folio}.pdf` };
}

export async function markLetterSent(
  ctx: OrganizationContext,
  letterId: string,
  data: { trackingNumber?: string | null; notes?: string | null },
) {
  const letter = await getLetterOrThrow(ctx, letterId);
  if (letter.status !== "FINAL" && letter.status !== "SENT") {
    throw new DomainError("Solo se pueden marcar como enviadas las cartas finalizadas.");
  }

  const updated = await prisma.disputeLetter.update({
    where: { id: letter.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      followUpAt: letter.followUpAt ?? new Date(Date.now() + REVIEW_DAYS * 86_400_000),
      trackingNumber: emptyToNull(data.trackingNumber),
      ...(data.notes !== undefined ? { notes: emptyToNull(data.notes) } : {}),
    },
  });

  await prisma.disputeItem.updateMany({
    where: {
      letterLinks: { some: { letterId: letter.id } },
      organizationId: ctx.organizationId,
    },
    data: { status: "SENT" },
  });

  await writeActivityLog(toActivityContext(ctx), {
    type: "LETTER_UPDATED",
    description: `Carta marcada como enviada (${CREDIT_BUREAU_LABELS[letter.bureau]})`,
    clientId: letter.round.case.clientId,
    caseId: letter.round.caseId,
    roundId: letter.roundId,
    metadata: { letterId: letter.id, trackingNumber: updated.trackingNumber },
  });

  return updated;
}

/** Guarda el Complaint ID del CFPB y/o la fecha de revisión de una carta o queja. */
export async function updateLetterFollowUp(
  ctx: OrganizationContext,
  letterId: string,
  data: { complaintId?: string | null; followUpAt?: Date | null },
) {
  const letter = await getLetterOrThrow(ctx, letterId);
  const complaintId = data.complaintId !== undefined ? emptyToNull(data.complaintId)?.slice(0, 40) ?? null : undefined;
  return prisma.disputeLetter.update({
    where: { id: letter.id },
    data: {
      ...(complaintId !== undefined ? { complaintId } : {}),
      ...(data.followUpAt !== undefined ? { followUpAt: data.followUpAt } : {}),
    },
  });
}

/**
 * Cartas de una ronda armadas solas: una por buró y método (con la plantilla
 * de ese método). Con cfpb=true arma, además, una queja al CFPB por buró.
 */
export async function generateLettersByStrategy(
  ctx: OrganizationContext,
  input: { roundId: string; cfpb?: boolean },
): Promise<{ letters: number; complaints: number }> {
  const items = await prisma.disputeItem.findMany({
    where: {
      organizationId: ctx.organizationId,
      roundId: input.roundId,
      status: { in: ["SELECTED", "DRAFT"] },
    },
    select: { id: true, bureau: true, strategy: true },
  });
  if (items.length === 0) throw new DomainError("No hay disputas sin carta en esta ronda.");
  const groups = new Map<string, { bureau: CreditBureau; strategy: DisputeStrategy; ids: string[] }>();
  for (const item of items) {
    const strategy: DisputeStrategy = isDisputeStrategy(item.strategy) ? item.strategy : "GENERAL";
    const key = `${item.bureau}#${strategy}`;
    const group = groups.get(key) ?? { bureau: item.bureau, strategy, ids: [] };
    group.ids.push(item.id);
    groups.set(key, group);
  }
  let letters = 0;
  for (const group of groups.values()) {
    const template = await templateForStrategy(ctx, group.strategy);
    if (!template) continue;
    await createLetterDraft(ctx, {
      roundId: input.roundId,
      bureau: group.bureau,
      templateId: template.id,
      disputeItemIds: group.ids,
    });
    letters += 1;
  }
  let complaints = 0;
  if (input.cfpb) {
    const cfpb = await templateForStrategy(ctx, "CFPB");
    const byBureau = new Map<CreditBureau, string[]>();
    for (const item of items) byBureau.set(item.bureau, [...(byBureau.get(item.bureau) ?? []), item.id]);
    for (const [bureau, ids] of byBureau) {
      if (!cfpb) break;
      const preview = await previewLetter(ctx, { roundId: input.roundId, bureau, templateId: cfpb.id, disputeItemIds: ids });
      await prisma.disputeLetter.create({
        data: {
          organizationId: ctx.organizationId,
          roundId: input.roundId,
          bureau,
          templateId: cfpb.id,
          recipient: "Consumer Financial Protection Bureau",
          subjectSnapshot: preview.subject,
          contentSnapshot: preview.content,
          status: "READY_FOR_REVIEW",
          channel: "CFPB",
          strategy: "CFPB",
        },
      });
      complaints += 1;
    }
  }
  return { letters, complaints };
}

async function getLetterOrThrow(ctx: OrganizationContext, letterId: string) {
  const letter = await prisma.disputeLetter.findFirst({
    where: { id: letterId, organizationId: ctx.organizationId },
    include: {
      round: {
        include: {
          case: { select: { id: true, clientId: true, caseCode: true } },
        },
      },
      items: true,
      document: { select: { id: true, displayName: true, originalName: true } },
      template: { select: { id: true, name: true } },
    },
  });
  if (!letter) throw new DomainError("Carta no encontrada.");
  return letter;
}

export async function getLetter(ctx: OrganizationContext, letterId: string) {
  return getLetterOrThrow(ctx, letterId);
}

export async function listLettersForRound(ctx: OrganizationContext, roundId: string) {
  return prisma.disputeLetter.findMany({
    where: { organizationId: ctx.organizationId, roundId, status: { not: "CANCELLED" } },
    orderBy: [{ bureau: "asc" }, { generatedAt: "desc" }],
    include: {
      document: { select: { id: true, displayName: true } },
      _count: { select: { items: true } },
    },
  });
}
