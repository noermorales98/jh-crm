import { authorizationServerMetadataResponse, corsPreflightResponse } from "@/src/server/mcp/oauth/http";

/** Servido en /.well-known/oauth-authorization-server (rewrite en next.config.ts). */
export function GET() {
  return authorizationServerMetadataResponse();
}

export function OPTIONS() {
  return corsPreflightResponse();
}
