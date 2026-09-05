import { NextResponse } from "next/server";
import { requireApiPermission } from "@/src/server/auth/guards";
import { apiErrorResponse } from "@/src/server/http";
import * as progressService from "@/src/server/progress-reports";

/** GET /api/progress-reports/[reportId]/pdf — PDF on-demand, sin guardar en S3. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const ctx = await requireApiPermission("letters.view");
    const { reportId } = await params;
    const { pdf, filename } = await progressService.buildProgressReportPdf(
      ctx,
      reportId,
    );

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
