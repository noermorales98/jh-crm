import { NextResponse } from "next/server";
import { requireApiOrganization } from "@/src/server/auth/guards";
import { apiErrorResponse } from "@/src/server/http";
import { can } from "@/src/server/auth/permissions";
import { ForbiddenError } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";
import * as documentService from "@/src/server/documents";

/**
 * GET /api/files/[documentId]/download
 * Valida sesión/organización, audita si el documento es sensible y
 * redirige (302) a una URL firmada de corta duración.
 *
 * Query: ?inline=1 → Content-Disposition: inline (previsualizar en el navegador).
 * Sin query → attachment (descarga con extensión correcta, p. ej. .pdf).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const ctx = await requireApiOrganization();
    const { documentId } = await params;
    const { searchParams } = new URL(request.url);
    const inline =
      searchParams.get("inline") === "1" ||
      searchParams.get("inline") === "true";

    // Verificación de permiso según sensibilidad antes de generar la URL.
    const doc = await prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId: ctx.organizationId,
        deletedAt: null,
        hardDeletedAt: null,
      },
      select: { sensitivity: true },
    });
    if (doc && doc.sensitivity !== "INTERNAL" && !can(ctx.role, "documents.downloadSensitive")) {
      throw new ForbiddenError("No tienes permiso para descargar documentos sensibles.");
    }

    const { url } = await documentService.requestDownload(ctx, documentId, {
      disposition: inline ? "inline" : "attachment",
    });
    return NextResponse.redirect(url, 302);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
