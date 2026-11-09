"use server";

import { redirect } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { AUTHORIZE_FIELDS } from "@/src/server/mcp/oauth/authorize";
import { decideApprove, decideDeny, type ConsentOutcome } from "@/src/server/mcp/oauth/consent";

/**
 * Botones de la pantalla de consentimiento del conector de Claude.
 * La organización y el rol salen de la sesión del CRM, nunca del formulario.
 * La decisión de a dónde ir vive en `consent.ts` (probada en scripts/smoke/mcp-http.ts).
 */

function paramsFromForm(formData: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of AUTHORIZE_FIELDS) {
    const value = formData.get(key);
    out[key] = typeof value === "string" ? value : undefined;
  }
  return out;
}

function follow(outcome: ConsentOutcome, params: Record<string, string | undefined>): never {
  if (outcome.kind === "redirect") redirect(outcome.url);
  // Vuelve a la pantalla con los mismos parámetros: ella explica qué falló.
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, v);
  redirect(`/oauth/authorize?${qs.toString()}`);
}

export async function approveMcpAuthorization(formData: FormData): Promise<void> {
  const ctx = await requireOrganization();
  const params = paramsFromForm(formData);
  follow(await decideApprove(ctx, params), params);
}

export async function denyMcpAuthorization(formData: FormData): Promise<void> {
  await requireOrganization();
  const params = paramsFromForm(formData);
  follow(await decideDeny(params), params);
}
