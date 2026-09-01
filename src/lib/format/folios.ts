/**
 * Folios legibles por humanos, con prefijo configurable por organización.
 * El número proviene de los contadores atómicos de OrganizationSettings,
 * actualizados dentro de la misma transacción que crea la entidad.
 */

export function buildFolio(prefix: string, sequence: number): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

export function buildQuoteFolio(prefix: string, sequence: number): string {
  return buildFolio(prefix || "Q", sequence);
}

export function buildReceiptFolio(prefix: string, sequence: number): string {
  return buildFolio(prefix || "REC", sequence);
}

/**
 * Clientes y casos usan secuencia simple sin año: CL-0001 / CASE-0001.
 */
function buildSimpleCode(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}

export function buildClientCode(prefix: string, sequence: number): string {
  return buildSimpleCode(prefix || "CL", sequence);
}

export function buildCaseCode(prefix: string, sequence: number): string {
  return buildSimpleCode(prefix || "CASE", sequence);
}
