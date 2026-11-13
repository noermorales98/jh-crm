import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ZodError } from "zod";
import { sanitizeTextForAI } from "@/src/lib/ai/sanitize";
import { ForbiddenError, UnauthorizedError } from "@/src/server/auth/guards";
import { DomainError, NotFoundError, RateLimitError } from "@/src/server/errors";
import { authenticate, callTool } from "./dispatch";
import { appBaseUrl, protectedResourceMetadataUrl } from "./oauth/http";
import { isMcpConnectorFeatureOn } from "./oauth/service";
import { allTools } from "./tools";
import type { McpContext, Tool } from "./tools/types";

/**
 * Endpoint MCP (`/api/mcp`): un servidor sin estado por petición, con las herramientas
 * ligadas a la persona de la llave. Sin llave válida → 401 con la pista de OAuth.
 */

export const MCP_SERVER_INSTRUCTIONS = [
  "Conector del CRM de J&H Multiservices. Responde en español.",
  "Usa `listar`, `ver` y `buscar` para leer; el resto de herramientas crean, editan o borran.",
  "Antes de usar una herramienta que borra, archiva o cancela, explica qué vas a hacer y pide confirmación.",
  "Nunca verás SSN/ITIN ni números de cuenta completos: no los pidas.",
  "Incluye los enlaces del CRM que devuelven las herramientas para que la persona pueda abrirlos.",
].join(" ");

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function unauthorized(): Response {
  return withCors(
    new Response(JSON.stringify({ error: "invalid_token" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${protectedResourceMetadataUrl()}/api/mcp"`,
      },
    }),
  );
}

function bearerFrom(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** Mensaje para Claude, en español y sin trazas internas. */
export function toolErrorMessage(error: unknown): string {
  if (error instanceof UnauthorizedError) return "No autorizado.";
  if (error instanceof ForbiddenError) return "Sin permiso para esta acción con tu rol.";
  if (error instanceof NotFoundError) return "No encontrado.";
  if (error instanceof RateLimitError) return "Demasiadas peticiones. Espera un minuto y vuelve a intentarlo.";
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const where = issue?.path?.length ? ` (${issue.path.join(".")})` : "";
    return sanitizeTextForAI(`Datos inválidos${where}: ${issue?.message ?? "revisa los campos."}`);
  }
  // Los mensajes de reglas de negocio pueden citar datos: se limpian como los resultados.
  if (error instanceof DomainError) return sanitizeTextForAI(error.message);
  return "Error interno del CRM. No se hizo ningún cambio que no se haya confirmado.";
}

function buildServer(ctx: McpContext, tools: Tool[]): McpServer {
  const server = new McpServer(
    { name: "jh-crm", title: "J&H CRM", version: "1.0.0" },
    { instructions: MCP_SERVER_INSTRUCTIONS },
  );
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema as never,
        annotations: {
          title: tool.title,
          readOnlyHint: tool.kind === "read",
          destructiveHint: tool.kind === "destructive",
          openWorldHint: false,
        },
      },
      (async (args: unknown) => {
        try {
          const result = await callTool(ctx, tool.name, args, { tools });
          return { content: [{ type: "text" as const, text: JSON.stringify(result ?? null) }] };
        } catch (error) {
          return { isError: true, content: [{ type: "text" as const, text: toolErrorMessage(error) }] };
        }
      }) as never,
    );
  }
  return server;
}

export interface McpRequestOptions {
  tools?: Tool[];
}

export async function handleMcpRequest(request: Request, options: McpRequestOptions = {}): Promise<Response> {
  if (!isMcpConnectorFeatureOn()) return new Response("Not found", { status: 404 });
  if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
  // La URL pública del CRM tiene que estar configurada antes de aceptar nada.
  appBaseUrl();

  let ctx: McpContext;
  try {
    ctx = await authenticate(bearerFrom(request));
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorized();
    throw error;
  }

  const tools = options.tools ?? allTools();
  const server = buildServer(ctx, tools);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return withCors(await transport.handleRequest(request));
  } finally {
    await server.close().catch(() => undefined);
  }
}
