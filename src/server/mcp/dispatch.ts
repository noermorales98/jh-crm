import { revalidatePath } from "next/cache";
import { prisma } from "@/src/lib/db";
import { can } from "@/src/server/auth/permissions";
import { ForbiddenError, UnauthorizedError } from "@/src/server/auth/guards";
import { writeAuditLog } from "@/src/server/audit";
import { toAuditContext } from "@/src/server/context";
import { NotFoundError } from "@/src/server/errors";
import { runWithRequestOrigin } from "@/src/server/request-origin";
import { assertRateLimit } from "@/src/server/security/rate-limit";
import { hashToken } from "./oauth/core";
import { isConnectionUsable } from "./oauth/service";
import { redactForClaude } from "./redact";
import type { McpContext, Tool } from "./tools/types";

/**
 * Endpoint MCP: autenticación con la llave de acceso y despacho de herramientas.
 * Orden fijo en cada llamada: límite → permiso → validación → servicio (con origen
 * Claude) → auditoría y refresco (si escribe) → limpieza de datos sensibles.
 * Nunca registra argumentos ni resultados.
 */

export const TOOL_CALLS_PER_MINUTE = 120;
const LAST_USED_RESOLUTION_MS = 60 * 1000;

/** Llave presentada que el CRM nunca emitió (ni caducada ni revocada: inventada). */
export class UnknownTokenError extends UnauthorizedError {
  constructor() {
    super();
    this.name = "UnknownTokenError";
  }
}

export interface CallToolOptions {
  tools: Tool[];
  now?: Date;
  revalidate?: (path: string) => void;
}

export async function authenticate(bearer: string | null, now: Date = new Date()): Promise<McpContext> {
  if (typeof bearer !== "string" || !bearer) throw new UnauthorizedError();
  const row = await prisma.mcpToken.findUnique({
    where: { tokenHash: hashToken(bearer) },
    include: { connection: true },
  });
  if (!row) throw new UnknownTokenError();
  if (row.kind !== "ACCESS" || !row.expiresAt || row.expiresAt.getTime() <= now.getTime()) {
    throw new UnauthorizedError();
  }
  // Conexión no revocada, conector encendido, usuario activo y miembro, misma sesión.
  const member = await isConnectionUsable(prisma, row.connection);
  if (!member) throw new UnauthorizedError();
  return {
    userId: row.connection.userId,
    organizationId: row.connection.organizationId,
    // El rol se lee en cada petición: un cambio de rol se aplica al momento.
    role: member.role,
    connectionId: row.connectionId,
  };
}

function defaultRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Fuera de un request de Next (pruebas) no hay caché que refrescar.
  }
}

export async function callTool(
  ctx: McpContext,
  name: string,
  args: unknown,
  options: CallToolOptions,
): Promise<unknown> {
  const now = options.now ?? new Date();
  await assertRateLimit({ key: `mcp-tool:${ctx.connectionId}`, limit: TOOL_CALLS_PER_MINUTE, windowSeconds: 60 });

  const tool = options.tools.find((t) => t.name === name);
  if (!tool) throw new NotFoundError("Herramienta no encontrada.");
  if (!can(ctx.role, tool.permission)) throw new ForbiddenError("Sin permiso para esta acción.");
  const input = tool.inputSchema.parse(args ?? {});

  const result = await runWithRequestOrigin({ via: "claude", connectionId: ctx.connectionId }, async () => {
    const value = await tool.run(ctx, input);
    if (tool.kind !== "read") {
      // La escritura del servicio y su auditoría no comparten transacción: si la auditoría
      // fallara tras escribir, Claude ve el error (riesgo aceptado, ver decisions.md).
      const target = tool.audit(input, value);
      await writeAuditLog(toAuditContext(ctx), {
        action: `mcp.tool.${tool.name}`,
        entityType: target.entityType,
        entityId: target.entityId,
      });
    }
    return value;
  });

  // A partir de aquí el cambio ya está guardado: nada puede convertirlo en error, o Claude
  // reintentaría y lo duplicaría. Refresco y último uso son "mejor esfuerzo".
  if (tool.kind !== "read") {
    const revalidate = options.revalidate ?? defaultRevalidate;
    for (const path of tool.revalidate(result, input)) {
      try {
        revalidate(path);
      } catch {
        // Ignorado a propósito.
      }
    }
  }

  // Último uso, como mucho una vez por minuto (para "Conexiones activas").
  await prisma.mcpConnection
    .updateMany({
      where: {
        id: ctx.connectionId,
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(now.getTime() - LAST_USED_RESOLUTION_MS) } }],
      },
      data: { lastUsedAt: now },
    })
    .catch(() => undefined);

  return redactForClaude(result);
}
