import { corsPreflightResponse, handleToken } from "@/src/server/mcp/oauth/http";

/** Canje de código y rotación del refresh del conector MCP de Claude. */
export function POST(request: Request) {
  return handleToken(request);
}

export function OPTIONS() {
  return corsPreflightResponse();
}
