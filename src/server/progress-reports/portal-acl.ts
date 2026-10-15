/**
 * JH-002 — reglas de ACL portal para reportes de progreso (sin I/O).
 * El handler aplica el mismo predicado contra Prisma.
 */

export type ProgressReportPortalScope = {
  reportId: string;
  organizationId: string;
  clientId: string;
};

/** Where clause canónico: reporte del tenant y del cliente dueño. */
export function progressReportPortalWhere(scope: ProgressReportPortalScope) {
  return {
    id: scope.reportId,
    organizationId: scope.organizationId,
    case: {
      clientId: scope.clientId,
      organizationId: scope.organizationId,
    },
  };
}

/**
 * Decide si un snapshot de reporte (con case.clientId) es del portal actual.
 * Usado en smokes y para documentar la regla.
 */
export function isProgressReportOwnedByPortal(input: {
  reportOrganizationId: string;
  caseClientId: string | null | undefined;
  caseOrganizationId: string | null | undefined;
  portalClientId: string;
  portalOrganizationId: string;
}): boolean {
  if (!input.caseClientId || !input.caseOrganizationId) return false;
  return (
    input.reportOrganizationId === input.portalOrganizationId &&
    input.caseOrganizationId === input.portalOrganizationId &&
    input.caseClientId === input.portalClientId
  );
}
