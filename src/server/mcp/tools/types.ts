import type { z } from "zod";
import type { PermissionAction } from "@/src/server/auth/permissions";
import type { OrganizationContext } from "@/src/server/auth/guards";

/** Contexto de una petición de Claude: la persona, su organización y rol, y la conexión. */
export type McpContext = OrganizationContext & { connectionId: string };

export type ToolKind = "read" | "write" | "destructive";

/**
 * Herramienta del conector. El despachador aplica permiso, validación, origen,
 * auditoría (si no es de lectura), refresco y limpieza; `run` solo llama al servicio.
 */
export interface Tool<S extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  permission: PermissionAction;
  kind: ToolKind;
  run(ctx: McpContext, input: z.infer<S>): Promise<unknown>;
  /** Obligatorio si kind ≠ read: qué entidad tocó, para la auditoría. */
  audit?(input: z.infer<S>, result: unknown): { entityType: string; entityId: string | null };
  /** Obligatorio si kind ≠ read: rutas del CRM a refrescar. */
  revalidate?(result: unknown, input: z.infer<S>): string[];
}

export function defineTool<S extends z.ZodType>(tool: Tool<S>): Tool<S> {
  return tool;
}
