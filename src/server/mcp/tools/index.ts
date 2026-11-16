import { casesTools } from "./cases";
import { catalogTools } from "./catalog";
import { clientsTools } from "./clients";
import { comparisonsTools } from "./comparisons";
import { consultationsTools } from "./consultations";
import { contractsTools } from "./contracts";
import { creditReportsTools } from "./credit-reports";
import { fundingTools } from "./funding";
import { disputesTools } from "./disputes";
import { lettersTools } from "./letters";
import { mailsTools } from "./mails";
import { notesTools } from "./notes";
import { opportunitiesTools } from "./opportunities";
import { paymentsTools } from "./payments";
import { processorsTools } from "./processors";
import { quotesTools } from "./quotes";
import { readTools } from "./read";
import { roundsTools } from "./rounds";
import { testimonialsTools } from "./testimonials";
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
    ...roundsTools,
    ...disputesTools,
    ...lettersTools,
    ...creditReportsTools,
    ...consultationsTools,
    ...paymentsTools,
    ...contractsTools,
    ...catalogTools,
    ...processorsTools,
    ...testimonialsTools,
    ...comparisonsTools,
    ...fundingTools,
    ...mailsTools,
  ];
}
