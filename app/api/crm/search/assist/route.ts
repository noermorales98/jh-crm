import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse } from "@/src/server/http";
import { requireApiOrganization } from "@/src/server/auth/guards";
import { assistSearch } from "@/src/server/ai/tasks";

const bodySchema = z.object({
  q: z.string().trim().min(2).max(200),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireApiOrganization();
    const json: unknown = await request.json().catch(() => ({}));
    const { q } = bodySchema.parse(json);
    const result = await assistSearch(ctx, q);
    return NextResponse.json({
      ok: true,
      intent: result.intent,
      hits: result.hits,
      summary: result.summary,
      label: result.label,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
