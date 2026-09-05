import { NextResponse } from "next/server";
import { requireApiPermission } from "@/src/server/auth/guards";
import { apiErrorResponse } from "@/src/server/http";
import * as letterService from "@/src/server/letters";

/** GET /api/letters/[letterId]/pdf — PDF on-demand, sin guardar en S3. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ letterId: string }> },
) {
  try {
    const ctx = await requireApiPermission("letters.view");
    const { letterId } = await params;
    const { pdf, filename } = await letterService.buildLetterPdf(ctx, letterId);

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
