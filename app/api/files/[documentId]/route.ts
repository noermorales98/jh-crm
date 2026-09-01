import { NextResponse } from "next/server";
import { requireApiPermission } from "@/src/server/auth/guards";
import { apiErrorResponse } from "@/src/server/http";
import * as documentService from "@/src/server/documents";

/** DELETE /api/files/[documentId] — soft delete con auditoría. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const ctx = await requireApiPermission("documents.upload");
    const { documentId } = await params;
    const document = await documentService.softDeleteDocument(ctx, documentId);
    return NextResponse.json({ ok: true, data: { id: document.id } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
