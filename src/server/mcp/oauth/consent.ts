import type { OrganizationContext } from "@/src/server/auth/guards";
import { buildAuthorizationRedirect, parseAuthorizeParams } from "./authorize";
import { OAuthError, approve, validateAuthorizeRequest } from "./service";

/**
 * Decisión de los botones de la pantalla de consentimiento, sin `redirect()`: devuelve
 * a dónde ir. Regla de seguridad: solo se vuelve a la `redirect_uri` de Claude cuando
 * ya se comprobó que está registrada para ese cliente; si no, se vuelve a la pantalla.
 */

export type ConsentOutcome = { kind: "redirect"; url: string } | { kind: "back" };

type Params = Record<string, string | string[] | undefined>;

export async function decideApprove(
  ctx: OrganizationContext,
  params: Params,
  now: Date = new Date(),
): Promise<ConsentOutcome> {
  const parsed = parseAuthorizeParams(params);
  if (!parsed.ok) return { kind: "back" };
  const { req, state } = parsed.value;
  try {
    const { code } = await approve(ctx, req, now);
    return { kind: "redirect", url: buildAuthorizationRedirect(req.redirect_uri, { code }, state) };
  } catch (error) {
    // access_denied solo lo lanza approve() después de validar cliente y redirect_uri.
    if (error instanceof OAuthError && error.code === "access_denied") {
      return {
        kind: "redirect",
        url: buildAuthorizationRedirect(req.redirect_uri, { error: "access_denied" }, state),
      };
    }
    if (error instanceof OAuthError) return { kind: "back" };
    throw error;
  }
}

export async function decideDeny(params: Params): Promise<ConsentOutcome> {
  const parsed = parseAuthorizeParams(params);
  if (!parsed.ok) return { kind: "back" };
  const { req, state } = parsed.value;
  try {
    await validateAuthorizeRequest(req);
  } catch (error) {
    if (error instanceof OAuthError) return { kind: "back" };
    throw error;
  }
  return {
    kind: "redirect",
    url: buildAuthorizationRedirect(req.redirect_uri, { error: "access_denied" }, state),
  };
}
