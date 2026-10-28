import { NextResponse } from "next/server";
import { requireApiPermission } from "@/src/server/auth/guards";
import { apiErrorResponse } from "@/src/server/http";
import { buildScorePlanPdf } from "@/src/server/credit-reports/score-plan";
import { DEFAULT_TARGET_PCT } from "@/src/lib/credit/utilization-plan";

/** GET /api/clients/[clientId]/score-plan/pdf?reportId=&target= */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const ctx = await requireApiPermission("creditReports.view");
    const search = new URL(request.url).searchParams;
    const raw = Number(search.get("target"));
    const target = Number.isInteger(raw) && raw >= 0 && raw <= 100 ? raw : DEFAULT_TARGET_PCT;
    const { pdf, filename } = await buildScorePlanPdf(ctx, clientId, search.get("reportId"), target);
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
