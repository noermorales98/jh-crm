import type { Role } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { INTAKE_PRIMARY_GOAL_LABELS, labelFor } from "@/src/lib/labels";
import { intakePayloadSchema } from "@/src/lib/validation/intake-payload";
import type { OrganizationContext } from "@/src/server/auth/guards";

const INTAKE_FLAG_LABELS: Record<string, string> = {
  hasCollection: "Colecciones",
  hasChargeOff: "Charge-offs",
  hasLatePayments: "Pagos atrasados",
  hasRepossession: "Reposesión",
  hasBankruptcy: "Bancarrota",
  hasHardInquiries: "Consultas duras",
};

/** D5: resumen de intake visible a OWNER, ADMIN y SPECIALIST. */
export function canViewIntakeSummary(role: Role | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "SPECIALIST";
}

export type IntakeSummaryDto = {
  submissionId: string;
  submittedAt: Date;
  primaryGoal: string | null;
  primaryGoalLabel: string | null;
  consultationReason: string | null;
  flags: string[];
  documentCount: number;
  reportProvider: string | null;
  hasRecentReportAccess: boolean | null;
};

function asPayload(raw: unknown) {
  const parsed = intakePayloadSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : null;
}

export function buildIntakeSummaryDto(
  submission: {
    id: string;
    submittedAt: Date;
    payloadJson: unknown;
  },
  documentCount: number,
): IntakeSummaryDto {
  const payload = asPayload(submission.payloadJson);
  const flags: string[] = [];
  if (payload) {
    for (const [key, label] of Object.entries(INTAKE_FLAG_LABELS)) {
      if ((payload as Record<string, unknown>)[key] === true) {
        flags.push(label);
      }
    }
  }
  const reason = payload?.consultationReason?.trim() || null;
  const goal = payload?.primaryGoal ?? null;

  return {
    submissionId: submission.id,
    submittedAt: submission.submittedAt,
    primaryGoal: goal,
    primaryGoalLabel: goal
      ? labelFor(INTAKE_PRIMARY_GOAL_LABELS, goal)
      : null,
    consultationReason: reason
      ? reason.length > 180
        ? `${reason.slice(0, 177)}…`
        : reason
      : null,
    flags: flags.slice(0, 4),
    documentCount,
    reportProvider: payload?.reportProvider?.trim() || null,
    hasRecentReportAccess: payload?.hasRecentReportAccess ?? null,
  };
}

/**
 * Última submission del cliente + conteo de docs del intake (slim, sin N+1).
 */
export async function getLatestIntakeSummary(
  ctx: OrganizationContext,
  clientId: string,
): Promise<IntakeSummaryDto | null> {
  if (!canViewIntakeSummary(ctx.role)) return null;

  const submission = await prisma.intakeSubmission.findFirst({
    where: { organizationId: ctx.organizationId, clientId },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      submittedAt: true,
      payloadJson: true,
      intakeLinkId: true,
    },
  });
  if (!submission) return null;

  const documentCount = await prisma.document.count({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      hardDeletedAt: null,
      // Docs subidos en la ventana del submit o vinculados al link no tienen
      // submissionId; contamos docs del cliente creados cerca del submit.
      createdAt: {
        gte: new Date(submission.submittedAt.getTime() - 60_000),
        lte: new Date(submission.submittedAt.getTime() + 10 * 60_000),
      },
    },
  });

  return buildIntakeSummaryDto(submission, documentCount);
}

/** Una línea corta para detalle de tarea lead. */
export function intakeSummaryOneLiner(
  summary: IntakeSummaryDto | null,
): string | null {
  if (!summary) return null;
  const parts: string[] = [];
  if (summary.primaryGoalLabel) parts.push(summary.primaryGoalLabel);
  if (summary.flags.length) parts.push(summary.flags.slice(0, 2).join(", "));
  if (summary.consultationReason) {
    parts.push(
      summary.consultationReason.length > 80
        ? `${summary.consultationReason.slice(0, 77)}…`
        : summary.consultationReason,
    );
  }
  return parts.length ? parts.join(" · ") : "Formulario completado";
}
