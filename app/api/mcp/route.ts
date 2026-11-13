import { handleMcpRequest } from "@/src/server/mcp/endpoint";

/** Endpoint MCP para Claude (Streamable HTTP, sin estado). La llave va en Authorization. */
export function POST(request: Request) {
  return handleMcpRequest(request);
}

export function GET(request: Request) {
  return handleMcpRequest(request);
}

export function DELETE(request: Request) {
  return handleMcpRequest(request);
}

export function OPTIONS(request: Request) {
  return handleMcpRequest(request);
}
