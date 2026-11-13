import type { z } from "zod";
import type { PermissionAction } from "@/src/server/auth/permissions";
import type { OrganizationContext } from "@/src/server/auth/guards";

/** Contexto de una petición de Claude: la persona, su organización y rol, y la conexión. */
export type McpContext = OrganizationContext & { connectionId: string };

export type ToolKind = "read" | "write" | "destructive";

/** Una ruta a refrescar, o una ruta dinámica con su tipo (igual que `revalidatePath`). */
export type RevalidateTarget = string | { path: string; type: "layout" | "page" };

/**
 * Herramienta del conector. El despachador aplica permiso, validación, origen,
 * auditoría (si no es de lectura), refresco y limpieza; `run` solo llama al servicio.
 */
interface ToolBase<S extends z.ZodType> {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  permission: PermissionAction;
  /** Tiene efectos fuera del CRM (p. ej. manda un mensaje real al cliente). */
  openWorld?: boolean;
  run(ctx: McpContext, input: z.infer<S>): Promise<unknown>;
}

/** Herramienta de lectura: sin auditoría ni refresco. */
export interface ReadTool<S extends z.ZodType = z.ZodType> extends ToolBase<S> {
  kind: "read";
  audit?: never;
  revalidate?: never;
}

/** Herramienta que escribe o borra: auditoría y refresco obligatorios (lo exige el tipo). */
export interface WriteTool<S extends z.ZodType = z.ZodType> extends ToolBase<S> {
  kind: "write" | "destructive";
  /** Qué entidad tocó, para la auditoría `mcp.tool.<nombre>`. */
  audit(input: z.infer<S>, result: unknown): { entityType: string; entityId: string | null };
  /** Rutas del CRM a refrescar (las mismas que la action equivalente). */
  revalidate(result: unknown, input: z.infer<S>): RevalidateTarget[];
}

export type Tool<S extends z.ZodType = z.ZodType> = ReadTool<S> | WriteTool<S>;

export function defineTool<S extends z.ZodType>(tool: Tool<S>): Tool<S> {
  return tool;
}
