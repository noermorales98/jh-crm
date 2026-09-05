import { NextResponse } from "next/server";
import { safeEqual } from "@/src/lib/security/tokens";
import { purgeDueDocuments } from "@/src/server/retention";

/**
 * GET /api/cron/retention — purga documentos vencidos (S3 hard delete).
 *
 * Protección: Authorization: Bearer <CRON_SECRET> (comparación timing-safe).
 * Idempotente: documentos con hardDeletedAt no se vuelven a procesar.
 */

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !safeEqual(token, secret)) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await purgeDueDocuments();
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    console.error("[cron/retention]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Error de retención.",
      },
      { status: 500 },
    );
  }
}
