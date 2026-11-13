import { corsPreflightResponse, protectedResourceMetadataResponse } from "@/src/server/mcp/oauth/http";

/** Servido en /.well-known/oauth-protected-resource[/api/mcp] (rewrite en next.config.ts). */
export function GET() {
  return protectedResourceMetadataResponse();
}

export function OPTIONS() {
  return corsPreflightResponse();
}
