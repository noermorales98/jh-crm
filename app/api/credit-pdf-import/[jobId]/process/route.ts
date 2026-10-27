import { after, NextResponse } from "next/server";
import { requireApiPermission } from "@/src/server/auth/guards";
import { apiErrorResponse } from "@/src/server/http";
import { DomainError } from "@/src/server/errors";
import { prisma } from "@/src/lib/db";
import { processCreditPdfImportJob } from "@/src/server/credit-import/jobs";

/**
 * POST /api/credit-pdf-import/[jobId]/process
 *
 * Arranca el worker del job (tras subir el PDF). Route Handler + after()
 * con maxDuration alto: más fiable en Vercel que after() solo en Server Action.
 */
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const ctx = await requireApiPermission("creditReports.manage");
    const { jobId } = await params;
    if (!jobId?.trim()) {
      throw new DomainError("Job no indicado.");
    }

    const job = await prisma.creditPdfImportJob.findFirst({
      where: { id: jobId, organizationId: ctx.organizationId },
      select: {
        id: true,
        status: true,
        createdById: true,
      },
    });
    if (!job) throw new DomainError("Importación no encontrada.");
    if (
      job.createdById !== ctx.userId &&
      ctx.role !== "OWNER" &&
      ctx.role !== "ADMIN"
    ) {
      throw new DomainError("No tienes acceso a este análisis.");
    }

    if (job.status === "QUEUED" || job.status === "RUNNING") {
      after(() => processCreditPdfImportJob(job.id));
    }

    return NextResponse.json({
      ok: true,
      data: { jobId: job.id, status: job.status, kicked: true },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
