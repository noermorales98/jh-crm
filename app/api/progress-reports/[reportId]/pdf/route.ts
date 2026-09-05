import { NextResponse } from "next/server";
import {
  requireApiPermission,
  requireApiPortalSession,
} from "@/src/server/auth/guards";
import { apiErrorResponse } from "@/src/server/http";
import { ForbiddenError, UnauthorizedError } from "@/src/server/auth/guards";
import * as progressService from "@/src/server/progress-reports";

/** GET /api/progress-reports/[reportId]/pdf — staff o cliente dueño. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params;

    try {
      const ctx = await requireApiPermission("letters.view");
      const { pdf, filename } = await progressService.buildProgressReportPdf(
        ctx,
        reportId,
      );
      return pdfResponse(pdf, filename);
    } catch (error) {
      if (
        !(error instanceof UnauthorizedError) &&
        !(error instanceof ForbiddenError)
      ) {
        throw error;
      }
    }

    const portal = await requireApiPortalSession();
    const { pdf, filename } =
      await progressService.buildProgressReportPdfForPortal(
        portal.clientId,
        portal.organizationId,
        reportId,
      );
    return pdfResponse(pdf, filename);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function pdfResponse(pdf: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
