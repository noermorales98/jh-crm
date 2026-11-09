import { corsPreflightResponse, handleRegister } from "@/src/server/mcp/oauth/http";

/** Registro dinámico de clientes OAuth (RFC 7591) para el conector MCP de Claude. */
export function POST(request: Request) {
  return handleRegister(request);
}

export function OPTIONS() {
  return corsPreflightResponse();
}
