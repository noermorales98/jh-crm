import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/src/server/http";
import { requireApiOrganization } from "@/src/server/auth/guards";
import { universalSearch } from "@/src/server/search/universal";

export async function GET(request: Request) {
  try {
    const ctx = await requireApiOrganization();
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const hits = await universalSearch(ctx, q);
    return NextResponse.json({ ok: true, hits });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
