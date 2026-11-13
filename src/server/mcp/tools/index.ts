import { readTools } from "./read";
import type { Tool } from "./types";

/**
 * Registro de herramientas del conector MCP. Cada sección aporta su lista desde su
 * propio archivo (T017–T022). El nombre de cada herramienta es único.
 */
export function allTools(): Tool[] {
  return [...readTools];
}
