import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse } from "@/src/server/http";
import {
  isIntakeEnabled,
  requestIntakeUploadUrl,
  validateIntakeToken,
} from "@/src/server/intake";

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
    const { token } = await params;
    const link = await validateIntakeToken(token);
    const body = bodySchema.parse(await request.json());
    const upload = await requestIntakeUploadUrl(link, body);
    return NextResponse.json({ ok: true, data: upload });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
