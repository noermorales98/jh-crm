import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { hashToken, isAllowedRedirectUri, newOpaqueToken, verifyPkce } from "./core";

/**
 * Servidor OAuth 2.1 del conector MCP: registro dinámico de clientes, consentimiento,
 * código por llaves (PKCE S256), rotación del refresh con detección de reuso y
 * revocación. Solo se guardan hashes de códigos y tokens.
 */

export type OAuthErrorCode =
  | "invalid_request"
  | "invalid_grant"
  | "unauthorized_client"
  | "access_denied"
  | "invalid_redirect_uri"
  | "invalid_client_metadata";

export class OAuthError extends Error {
  constructor(
    public readonly code: OAuthErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "OAuthError";
  }
}

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
}

export interface AuthorizeRequest {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
}

export const ACCESS_TOKEN_TTL_SECONDS = 3600;
export const AUTH_CODE_TTL_SECONDS = 600;
export const MAX_REDIRECT_URIS = 5;
export const MAX_CLIENT_NAME_LENGTH = 200;

export function isMcpConnectorFeatureOn(): boolean {
  return process.env.FEATURE_MCP_CONNECTOR === "true";
}

type Db = Prisma.TransactionClient | typeof prisma;

// ── Registro dinámico (RFC 7591) ───────────────────────────────────────────

export async function registerClient(input: {
  client_name?: unknown;
  redirect_uris?: unknown;
}): Promise<{ client_id: string; client_name: string; redirect_uris: string[] }> {
  const uris = input.redirect_uris;
  if (
    !Array.isArray(uris) ||
    uris.length === 0 ||
    uris.length > MAX_REDIRECT_URIS ||
    !uris.every((u) => typeof u === "string" && isAllowedRedirectUri(u))
  ) {
    throw new OAuthError("invalid_redirect_uri");
  }
  const rawName = input.client_name ?? "Claude";
  if (typeof rawName !== "string") throw new OAuthError("invalid_client_metadata");
  const name = rawName.trim() || "Claude";
  if (name.length > MAX_CLIENT_NAME_LENGTH) throw new OAuthError("invalid_client_metadata");

  const redirectUris = [...new Set(uris as string[])];
  const client = await prisma.mcpClient.create({
    data: { clientName: name, redirectUris },
  });
  return { client_id: client.id, client_name: name, redirect_uris: redirectUris };
}

/** Cliente y redirect_uri ya validados para la pantalla de consentimiento. */
export async function validateAuthorizeRequest(req: AuthorizeRequest) {
  if (
    typeof req.client_id !== "string" ||
    typeof req.redirect_uri !== "string" ||
    typeof req.code_challenge !== "string" ||
    typeof req.code_challenge_method !== "string"
  ) {
    throw new OAuthError("invalid_request");
  }
  const client = await prisma.mcpClient.findUnique({ where: { id: req.client_id } });
  if (!client) throw new OAuthError("unauthorized_client");
  const registered = Array.isArray(client.redirectUris) ? (client.redirectUris as unknown[]) : [];
  if (!registered.includes(req.redirect_uri)) throw new OAuthError("invalid_request");
  if (req.code_challenge_method !== "S256") throw new OAuthError("invalid_request");
  if (!/^[A-Za-z0-9_-]{43}$/.test(req.code_challenge)) throw new OAuthError("invalid_request");
  return { clientId: client.id, clientName: client.clientName };
}

// ── Estado de la persona y su organización ─────────────────────────────────

/**
 * La persona debe ser un usuario del equipo, activo y miembro de la organización, con el
 * conector encendido. Devuelve su sessionVersion actual. Rechaza sesiones del portal.
 */
async function loadActiveMember(db: Db, userId: string, organizationId: string) {
  if (!isMcpConnectorFeatureOn()) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      isActive: true,
      sessionVersion: true,
      memberships: { where: { organizationId }, select: { role: true } },
    },
  });
  if (!user?.isActive || user.memberships.length === 0) return null;
  const settings = await db.organizationSettings.findUnique({
    where: { organizationId },
    select: { mcpEnabled: true },
  });
  if (!settings?.mcpEnabled) return null;
  return { sessionVersion: user.sessionVersion, role: user.memberships[0].role };
}

/** ¿Sigue valiendo esta conexión? (no revocada, conector encendido, usuario y sesión intactos). */
export async function isConnectionUsable(
  db: Db,
  connection: { revokedAt: Date | null; userId: string; organizationId: string; sessionVersion: number },
) {
  if (connection.revokedAt) return null;
  const member = await loadActiveMember(db, connection.userId, connection.organizationId);
  if (!member || member.sessionVersion !== connection.sessionVersion) return null;
  return member;
}

// ── Consentimiento ─────────────────────────────────────────────────────────

export async function approve(
  ctx: OrganizationContext,
  req: AuthorizeRequest,
  now: Date = new Date(),
): Promise<{ code: string; connectionId: string }> {
  const { clientId } = await validateAuthorizeRequest(req);
  const member = await loadActiveMember(prisma, ctx.userId, ctx.organizationId);
  if (!member) throw new OAuthError("access_denied");

  const code = newOpaqueToken();
  const connection = await prisma.$transaction(async (tx) => {
    const conn = await tx.mcpConnection.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        clientId,
        sessionVersion: member.sessionVersion,
      },
    });
    await tx.mcpAuthCode.create({
      data: {
        codeHash: hashToken(code),
        connectionId: conn.id,
        codeChallenge: req.code_challenge,
        redirectUri: req.redirect_uri,
        expiresAt: new Date(now.getTime() + AUTH_CODE_TTL_SECONDS * 1000),
      },
    });
    return conn;
  });
  return { code, connectionId: connection.id };
}

// ── Emisión de llaves ──────────────────────────────────────────────────────

async function issueTokens(db: Db, connectionId: string, now: Date): Promise<OAuthTokens> {
  const access = newOpaqueToken();
  const refreshToken = newOpaqueToken();
  await db.mcpToken.createMany({
    data: [
      {
        tokenHash: hashToken(access),
        connectionId,
        kind: "ACCESS",
        expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000),
      },
      { tokenHash: hashToken(refreshToken), connectionId, kind: "REFRESH", expiresAt: null },
    ],
  });
  return {
    access_token: access,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/** Lanzado dentro de una transacción para deshacer la marca de uso sin castigar al cliente. */
class RollbackUnusable extends Error {}

/** Relee la conexión dentro de la transacción: una revocación reciente no se pierde. */
async function usableConnection(tx: Prisma.TransactionClient, connectionId: string) {
  const conn = await tx.mcpConnection.findUnique({ where: { id: connectionId } });
  if (!conn || !(await isConnectionUsable(tx, conn))) throw new RollbackUnusable();
  return conn;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

async function revokeConnection(connectionId: string, now: Date) {
  await prisma.mcpConnection.updateMany({
    where: { id: connectionId, revokedAt: null },
    data: { revokedAt: now },
  });
}

export async function exchangeCode(
  input: { code: string; code_verifier: string; client_id: string; redirect_uri: string },
  now: Date = new Date(),
): Promise<OAuthTokens> {
  if (
    !isString(input.code) ||
    !isString(input.code_verifier) ||
    !isString(input.client_id) ||
    !isString(input.redirect_uri)
  ) {
    throw new OAuthError("invalid_grant");
  }
  const row = await prisma.mcpAuthCode.findUnique({
    where: { codeHash: hashToken(input.code) },
    include: { connection: true },
  });
  if (!row) throw new OAuthError("invalid_grant");

  // Reuso de un código: alguien más lo tiene. Se corta la conexión entera.
  if (row.usedAt) {
    await revokeConnection(row.connectionId, now);
    throw new OAuthError("invalid_grant");
  }
  if (
    row.expiresAt.getTime() <= now.getTime() ||
    row.connection.clientId !== input.client_id ||
    row.redirectUri !== input.redirect_uri ||
    !verifyPkce(input.code_verifier, row.codeChallenge, "S256")
  ) {
    throw new OAuthError("invalid_grant");
  }

  let outcome: OAuthTokens | "race" | "unusable";
  try {
    outcome = await prisma.$transaction(async (tx) => {
      // Marca de uso condicional: si dos peticiones llegan a la vez, solo una gana.
      const claimed = await tx.mcpAuthCode.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return "race" as const;
      await usableConnection(tx, row.connectionId);
      return issueTokens(tx, row.connectionId, now);
    });
  } catch (error) {
    // Conexión no utilizable (org apagada, usuario o sesión cambiados): la marca se
    // deshace con la transacción y el código no se quema.
    if (error instanceof RollbackUnusable) outcome = "unusable";
    else throw error;
  }
  if (outcome === "race") {
    // Dos usos simultáneos del mismo código: igual que el reuso, se corta la conexión.
    await revokeConnection(row.connectionId, now);
    throw new OAuthError("invalid_grant");
  }
  if (outcome === "unusable") throw new OAuthError("invalid_grant");
  return outcome;
}

export async function refresh(
  input: { refresh_token: string; client_id: string },
  now: Date = new Date(),
): Promise<OAuthTokens> {
  if (!isString(input.refresh_token) || !isString(input.client_id)) {
    throw new OAuthError("invalid_grant");
  }
  const row = await prisma.mcpToken.findUnique({
    where: { tokenHash: hashToken(input.refresh_token) },
    include: { connection: true },
  });
  if (!row || row.kind !== "REFRESH") throw new OAuthError("invalid_grant");

  // Reuso de un refresh ya rotado: posible robo. Se corta la conexión entera.
  if (row.usedAt) {
    await revokeConnection(row.connectionId, now);
    throw new OAuthError("invalid_grant");
  }
  if (row.connection.clientId !== input.client_id) throw new OAuthError("invalid_grant");

  let outcome: OAuthTokens | "race" | "unusable";
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const claimed = await tx.mcpToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return "race" as const;
      await usableConnection(tx, row.connectionId);
      return issueTokens(tx, row.connectionId, now);
    });
  } catch (error) {
    // Conexión no utilizable ahora (p. ej. org apagada): se deshace la marca, así que
    // el mismo refresh vuelve a servir cuando se reactive (AC-14).
    if (error instanceof RollbackUnusable) outcome = "unusable";
    else throw error;
  }
  if (outcome === "race") {
    // Otra petición rotó este refresh a la vez: se trata como reuso.
    await revokeConnection(row.connectionId, now);
    throw new OAuthError("invalid_grant");
  }
  if (outcome === "unusable") throw new OAuthError("invalid_grant");
  return outcome;
}

/** RFC 7009: responde siempre igual; un refresh corta la conexión, un access caduca. */
export async function revokeToken(token: string, now: Date = new Date()): Promise<void> {
  if (!isString(token)) return;
  const row = await prisma.mcpToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row) return;
  if (row.kind === "REFRESH") {
    await revokeConnection(row.connectionId, now);
  } else {
    // updateMany: si la purga ya borró la fila, no falla (RFC 7009 pide respuesta uniforme).
    await prisma.mcpToken.updateMany({ where: { id: row.id }, data: { expiresAt: now } });
  }
}
