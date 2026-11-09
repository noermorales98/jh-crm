import { corsPreflightResponse, handleRevoke } from "@/src/server/mcp/oauth/http";

/** Revocación de llaves del conector MCP de Claude (RFC 7009). */
export function POST(request: Request) {
  return handleRevoke(request);
}

export function OPTIONS() {
  return corsPreflightResponse();
}
