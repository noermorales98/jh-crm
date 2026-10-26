import { NextResponse } from "next/server";
import { safeEqual } from "@/src/lib/security/tokens";
import {
  CREDIT_PDF_JOB_CRON_BATCH,
  CREDIT_PDF_JOB_CRON_DEADLINE_BUFFER_MS,
  recoverCreditPdfImportJobs,
} from "@/src/server/credit-import/jobs";

/**
 * GET /api/cron/credit-pdf-import
 *
 * Recupera CreditPdfImportJob QUEUED (tras margen de after()) y RUNNING
 * con lease vencido. Authorization: Bearer <CRON_SECRET>.
 *
 * Pensado para cron-job.org cada 1–2 minutos.
 * No escribe contenido de PDF ni PII en la respuesta.
 */
/**
 * Tope Hobby Vercel = 300s. PDFs largos se recuperan con reclaims del cron
 * (cron-job.org cada 1–2 min) + lease corto.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !safeEqual(token, secret)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const started = Date.now();
  const deadline = new Date(
    started + maxDuration * 1000 - CREDIT_PDF_JOB_CRON_DEADLINE_BUFFER_MS,
  );

  try {
    const data = await recoverCreditPdfImportJobs({
      limit: CREDIT_PDF_JOB_CRON_BATCH,
      deadline,
      now: new Date(started),
    });

    return NextResponse.json({
      ok: true,
      data: {
        ...data,
        elapsedMs: Date.now() - started,
      },
    });
  } catch (error) {
    console.error("[cron/credit-pdf-import]", {
      message: error instanceof Error ? error.message : "error",
    });
    return NextResponse.json(
      { ok: false, error: "Error al recuperar importaciones PDF." },
      { status: 500 },
    );
  }
}
