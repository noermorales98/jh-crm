import { NextResponse } from "next/server";
import { requireApiPermission } from "@/src/server/auth/guards";
import { apiErrorResponse } from "@/src/server/http";
import { buildClientActionPlanPdf } from "@/src/server/credit-reports/action-plan";

/** GET /api/clients/[clientId]/action-plan/pdf?reportId= */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const ctx = await requireApiPermission("creditReports.view");
    const reportId = new URL(request.url).searchParams.get("reportId");
    const { pdf, filename } = await buildClientActionPlanPdf(
      ctx,
      clientId,
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
