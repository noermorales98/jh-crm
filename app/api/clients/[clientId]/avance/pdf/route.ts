import { NextResponse } from "next/server";
import { requireApiPermission } from "@/src/server/auth/guards";
import { apiErrorResponse } from "@/src/server/http";
import { getAvanceViewForOrg } from "@/src/server/avance/view";
import { generateAvancePdf } from "@/src/lib/pdf/avance";
import { loadPdfOrganization } from "@/src/server/pdf/org-info";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const ctx = await requireApiPermission("creditReports.view");
    const reportId = new URL(request.url).searchParams.get("reportId");
    const view = await getAvanceViewForOrg(ctx, clientId, reportId);
    const { info, timezone } = await loadPdfOrganization(ctx.organizationId);
    const pdf = generateAvancePdf(
      view,
      {
        ...info,
        legalName: info.legalName || view.organizationName,
      },
      timezone,
    );
    const day = (view.reportDate ?? new Date()).toISOString().slice(0, 10);
    const filename = `avance-${view.clientName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40)}-${day}.pdf`;
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
