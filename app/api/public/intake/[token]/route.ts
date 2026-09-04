import { NextResponse } from "next/server";
import { apiErrorResponse, clientIpFromRequest } from "@/src/server/http";
import { getIntakeFormData, isIntakeEnabled, validateIntakeToken } from "@/src/server/intake";
import {
  assertRateLimit,
  sweepOldRateLimitBuckets,
} from "@/src/server/security/rate-limit";

/**
 * GET /api/public/intake/[token]
 * Valida el token y devuelve datos mínimos no sensibles del formulario.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isIntakeEnabled()) {
    return NextResponse.json({ ok: false, error: "No encontrado." }, { status: 404 });
  }
  try {
    const ip = clientIpFromRequest(request);
    await assertRateLimit({
      key: `intake:get:ip:${ip}`,
      limit: 60,
      windowSeconds: 60 * 60,
    });
    sweepOldRateLimitBuckets();

    const { token } = await params;
    const link = await validateIntakeToken(token);
    const data = await getIntakeFormData(link);
    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
