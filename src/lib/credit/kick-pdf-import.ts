/**
 * Dispara el worker del job PDF vía Route Handler (maxDuration 300).
 * Fire-and-forget: no bloquea la UI; el fallo se recupera por cron.
 */
export async function kickCreditPdfImportProcess(jobId: string): Promise<void> {
  try {
    await fetch(`/api/credit-pdf-import/${encodeURIComponent(jobId)}/process`, {
      method: "POST",
      credentials: "same-origin",
      redirect: "manual",
    });
  } catch {
    // Cron / reintento manual recuperan QUEUED.
  }
}
