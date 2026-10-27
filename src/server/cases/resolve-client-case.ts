import type { CaseState } from "@prisma/client";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";

export type ClientCaseOption = {
  id: string;
  caseCode: string;
  state: CaseState;
  serviceName: string | null;
};

/**
 * Casos de crédito del cliente + el elegido: ?servicio= si es suyo; si no,
 * el abierto más reciente; si no hay abierto, el más reciente.
 */
export async function resolveClientCase(
  ctx: OrganizationContext,
  clientId: string,
  requested?: string | null,
): Promise<{ caseId: string; cases: ClientCaseOption[] } | null> {
  const rows = await prisma.creditCase.findMany({
    where: { organizationId: ctx.organizationId, clientId },
    orderBy: [{ openedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      caseCode: true,
      state: true,
      serviceCase: { select: { service: { select: { name: true } } } },
    },
  });
  if (rows.length === 0) return null;
  const cases = rows.map((row) => ({
    id: row.id,
    caseCode: row.caseCode,
    state: row.state,
    serviceName: row.serviceCase?.service?.name ?? null,
  }));
  const chosen =
    cases.find((c) => c.id === requested) ??
    cases.find((c) => c.state === "OPEN") ??
    cases[0];
  return { caseId: chosen.id, cases };
}

/** Caso dueño de una entidad (reporte, importación, comparación…), validando cliente. */
export async function caseIdForClientEntity(
  ctx: OrganizationContext,
  clientId: string,
  entity: { caseId: string; clientId: string } | null,
): Promise<string | null> {
  if (!entity || entity.clientId !== clientId) return null;
  const owned = await prisma.creditCase.findFirst({
    where: { id: entity.caseId, organizationId: ctx.organizationId, clientId },
    select: { id: true },
  });
  return owned?.id ?? null;
}
