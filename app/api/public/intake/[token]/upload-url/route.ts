import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, clientIpFromRequest } from "@/src/server/http";
import {
  isIntakeEnabled,
  requestIntakeUploadUrl,
  validateIntakeToken,
} from "@/src/server/intake";
import {
  assertRateLimit,
  sweepOldRateLimitBuckets,
} from "@/src/server/security/rate-limit";

const bodySchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
});

/**
 * POST /api/public/intake/[token]/upload-url
 * URL firmada PUT con la misma whitelist MIME/tamaño que el área privada.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isIntakeEnabled()) {
    return NextResponse.json({ ok: false, error: "No encontrado." }, { status: 404 });
  }
  try {
    const ip = clientIpFromRequest(request);
    const { token } = await params;
    await assertRateLimit({
      key: `intake:upload:ip:${ip}`,
      limit: 40,
      windowSeconds: 60 * 60,
    });
    await assertRateLimit({
      key: `intake:upload:token:${token.slice(0, 80)}`,
      limit: 20,
      windowSeconds: 60 * 60,
    });
    sweepOldRateLimitBuckets();

    const link = await validateIntakeToken(token);
    const body = bodySchema.parse(await request.json());
    const upload = await requestIntakeUploadUrl(link, body);
    return NextResponse.json(
      { ok: true, data: upload },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
