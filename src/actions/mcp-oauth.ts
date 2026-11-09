"use server";

import { redirect } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { isNextControlError } from "@/src/server/errors";
import { buildAuthorizationRedirect, parseAuthorizeParams } from "@/src/server/mcp/oauth/authorize";
import { OAuthError, approve, validateAuthorizeRequest } from "@/src/server/mcp/oauth/service";

/**
 * Botones de la pantalla de consentimiento del conector de Claude.
 * La organización y el rol salen de la sesión del CRM, nunca del formulario.
 */

const FIELDS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "resource",
] as const;

function paramsFromForm(formData: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of FIELDS) {
    const value = formData.get(key);
    out[key] = typeof value === "string" && value !== "" ? value : undefined;
  }
  return out;
}

/** Vuelve a la pantalla con los mismos parámetros: ella explica qué falló. */
function backToConsent(params: Record<string, string | undefined>): never {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, v);
  redirect(`/oauth/authorize?${qs.toString()}`);
}

export async function approveMcpAuthorization(formData: FormData): Promise<void> {
  const ctx = await requireOrganization();
  const params = paramsFromForm(formData);
  const parsed = parseAuthorizeParams(params);
  if (!parsed.ok) backToConsent(params);
  const { req, state } = parsed.value;
  let target: string;
  try {
    const { code } = await approve(ctx, req);
    target = buildAuthorizationRedirect(req.redirect_uri, { code }, state);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    if (error instanceof OAuthError && error.code === "access_denied") {
      // La redirect_uri ya se validó contra el cliente registrado dentro de approve().
      target = buildAuthorizationRedirect(req.redirect_uri, { error: "access_denied" }, state);
    } else {
      backToConsent(params);
    }
  }
  redirect(target);
}

export async function denyMcpAuthorization(formData: FormData): Promise<void> {
  await requireOrganization();
  const params = paramsFromForm(formData);
  const parsed = parseAuthorizeParams(params);
  if (!parsed.ok) backToConsent(params);
  const { req, state } = parsed.value;
  try {
    // Solo se vuelve a una dirección registrada por ese cliente.
    await validateAuthorizeRequest(req);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    backToConsent(params);
  }
  redirect(buildAuthorizationRedirect(req.redirect_uri, { error: "access_denied" }, state));
}
