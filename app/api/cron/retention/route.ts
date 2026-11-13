import { NextResponse } from "next/server";
import { safeEqual } from "@/src/lib/security/tokens";
import { purgeDueDocuments } from "@/src/server/retention";
import { purgeMcpArtifacts } from "@/src/server/mcp/purge";

/**
 * GET /api/cron/retention — purga documentos vencidos (S3 hard delete) y limpia los
 * datos técnicos caducados del conector de Claude (llaves, códigos, registros huérfanos).
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
    // La limpieza del conector va aparte: si falla, no tumba la purga de documentos.
    let mcp: Awaited<ReturnType<typeof purgeMcpArtifacts>> | { error: string };
    try {
      mcp = await purgeMcpArtifacts();
    } catch {
      console.error("[cron/retention] limpieza del conector MCP falló");
      mcp = { error: "Limpieza del conector fallida." };
    }
    return NextResponse.json({ ok: true, data: { ...result, mcp } });
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
