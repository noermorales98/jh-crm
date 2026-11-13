import { casesTools } from "./cases";
import { clientsTools } from "./clients";
import { notesTools } from "./notes";
import { opportunitiesTools } from "./opportunities";
import { quotesTools } from "./quotes";
import { readTools } from "./read";
import { tasksTools } from "./tasks";
import type { Tool } from "./types";

/**
 * Registro de herramientas del conector MCP: lectura genérica más la escritura de cada
 * sección, cada una en su propio archivo. El nombre de cada herramienta es único.
 */
export function allTools(): Tool[] {
  return [
    ...readTools,
    ...clientsTools,
    ...casesTools,
    ...tasksTools,
    ...notesTools,
    ...opportunitiesTools,
    ...quotesTools,
  ];
}
