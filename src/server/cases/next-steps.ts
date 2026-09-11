import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { labelFor, ROUND_STATUS_LABELS } from "@/src/lib/labels";
import type { RoundStatus } from "@prisma/client";

export type CaseNextStep = {
  id: string;
  title: string;
  detail?: string;
  href?: string;
  tone?: "danger" | "warning" | "neutral";
};

const ACTIONABLE_ROUND: RoundStatus[] = [
  "DRAFT",
  "PREPARING",
  "SENT",
  "WAITING_UPDATE",
  "REVIEWING",
];

const PENDING_LETTER = ["DRAFT", "READY_FOR_REVIEW"] as const;

/**
 * Hasta 3 acciones concretas para el resumen del caso.
 * Ronda activa: última no cancelada (por roundNumber desc).
 */
export async function getCaseNextSteps(
  ctx: OrganizationContext,
  caseId: string,
): Promise<CaseNextStep[]> {
  const creditCase = await prisma.creditCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: {
      id: true,
      state: true,
      serviceCase: { select: { nextActionAt: true } },
    },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");

  const steps: CaseNextStep[] = [];
  const base = `/crm/casos/${creditCase.id}`;

  if (creditCase.state !== "OPEN") {
    const title =
      creditCase.state === "PAUSED"
        ? "Este caso está en pausa"
        : creditCase.state === "COMPLETED"
          ? "Este caso está completado"
          : "Este caso está cancelado";
    steps.push({
      id: "case-inactive",
      title,
      detail: "No hay acciones operativas pendientes aquí.",
      tone: "neutral",
    });
    return steps;
  }

  const now = new Date();
  if (
    creditCase.serviceCase.nextActionAt &&
    creditCase.serviceCase.nextActionAt < now
  ) {
    steps.push({
      id: "next-action-overdue",
      title: "Próxima acción vencida",
      detail: "Actualiza la fecha de la próxima acción.",
      href: `${base}#proxima-accion`,
      tone: "danger",
    });
  }

  const activeRound = await prisma.creditRound.findFirst({
    where: {
      caseId,
      organizationId: ctx.organizationId,
      status: { not: "CANCELLED" },
    },
    orderBy: { roundNumber: "desc" },
    select: { id: true, roundNumber: true, status: true },
  });

  if (!activeRound) {
    steps.push({
      id: "no-round",
      title: "Crear la primera ronda",
      detail: "Sin rondas aún en este caso.",
      href: `${base}/rondas`,
      tone: "warning",
    });
  } else {
    const pendingLetters = await prisma.disputeLetter.count({
      where: {
        organizationId: ctx.organizationId,
        roundId: activeRound.id,
        status: { in: [...PENDING_LETTER] },
      },
    });

    if (pendingLetters > 0) {
      steps.push({
        id: "letters-pending",
        title: "Revisar cartas de la ronda",
        detail: `${pendingLetters} carta${pendingLetters === 1 ? "" : "s"} en borrador o por revisar · Ronda #${activeRound.roundNumber}`,
        href: `${base}/rondas/${activeRound.id}`,
        tone: "warning",
      });
    } else if (ACTIONABLE_ROUND.includes(activeRound.status)) {
      steps.push({
        id: "continue-round",
        title: `Continuar ronda #${activeRound.roundNumber}`,
        detail: labelFor(ROUND_STATUS_LABELS, activeRound.status),
        href: `${base}/rondas/${activeRound.id}`,
        tone:
          activeRound.status === "DRAFT" || activeRound.status === "PREPARING"
            ? "warning"
            : "neutral",
      });
    }
  }

  if (steps.length < 3) {
    const latestReport = await prisma.clientProgressReport.findFirst({
      where: { organizationId: ctx.organizationId, caseId },
      orderBy: { reportDate: "desc" },
      select: { id: true, periodLabel: true },
    });
    if (latestReport) {
      steps.push({
        id: "latest-progress",
        title: "Ver último reporte de progreso",
        detail: latestReport.periodLabel,
        href: `${base}/reportes/${latestReport.id}`,
        tone: "neutral",
      });
    }
  }

  if (steps.length === 0) {
    steps.push({
      id: "all-clear",
      title: "Todo al día",
      detail: creditCase.serviceCase.nextActionAt
        ? "No hay urgencias. Revisa la próxima acción programada."
        : "Programa la próxima acción cuando corresponda.",
      href: `${base}#proxima-accion`,
      tone: "neutral",
    });
  }

  return steps.slice(0, 3);
}
