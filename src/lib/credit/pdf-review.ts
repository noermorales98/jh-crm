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
