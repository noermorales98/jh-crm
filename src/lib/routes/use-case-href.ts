"use client";

import { useParams } from "next/navigation";
import { caseHref, legacyCaseHref } from "./case-routes";

/**
 * Enlace al caso desde componentes client: usa el clientId de la URL
 * (/crm/clientes/:clientId/…) y, fuera de la ficha, la ruta de compatibilidad.
 */
export function useCaseHref() {
  const params = useParams<{ clientId?: string }>();
  const clientId = typeof params?.clientId === "string" ? params.clientId : null;
  return (caseId: string, sub = "") =>
    clientId ? caseHref(clientId, caseId, sub) : legacyCaseHref(caseId, sub);
}
