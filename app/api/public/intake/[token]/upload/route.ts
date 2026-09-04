import { NextResponse } from "next/server";
import { apiErrorResponse, clientIpFromRequest } from "@/src/server/http";
import {
  isIntakeEnabled,
  uploadIntakeFile,
  validateIntakeToken,
} from "@/src/server/intake";
import {
  assertRateLimit,
  sweepOldRateLimitBuckets,
} from "@/src/server/security/rate-limit";
import { getUploadMaxBytes, isAllowedMimeType } from "@/src/lib/storage/policy";
import { DomainError } from "@/src/server/errors";

export const maxDuration = 60;

/**
 * POST /api/public/intake/[token]/upload
 * multipart field "file" → guarda en R2 vía servidor (sin CORS del browser).
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
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new DomainError("Archivo requerido.");
    }
    if (!isAllowedMimeType(file.type)) {
      throw new DomainError("Solo se aceptan PDF, JPG y PNG.");
    }
    if (file.size <= 0 || file.size > getUploadMaxBytes()) {
      throw new DomainError(
        `El archivo excede el límite de ${process.env.UPLOAD_MAX_MB ?? "15"} MB.`,
      );
    }

    const body = new Uint8Array(await file.arrayBuffer());
    const uploaded = await uploadIntakeFile(link, {
      originalName: file.name || "documento",
      mimeType: file.type,
      body,
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          storageKey: uploaded.storageKey,
          originalName: uploaded.originalName,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
