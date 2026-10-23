/** Selección y bloqueo de la revisión de un PDF. No escribe Prisma. */

export function defaultPdfItemSelection(count: number): Record<number, boolean> {
  const selected: Record<number, boolean> = {};
  for (let index = 0; index < count; index += 1) selected[index] = true;
  return selected;
}

export function pdfImportConfirmBlocked(
  coverage: { metricsBlocked?: boolean } | null | undefined,
): boolean {
  return coverage?.metricsBlocked === true;
}

/** Fecha que ya trae la propuesta. Un valor ausente no se sustituye por hoy. */
export function proposedPdfReportDate(value: string | null | undefined): string {
  const text = value?.trim() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

/** Un job guardado cuya propuesta no parsea no se publica. */
export function storedPdfProposalBlocksConfirm(
  stored: boolean,
  proposalParsed: boolean,
): boolean {
  return stored && !proposalParsed;
}
