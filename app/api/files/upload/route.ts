import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/src/server/auth/guards";
import { apiErrorResponse } from "@/src/server/http";
import * as documentService from "@/src/server/documents";
import { DomainError } from "@/src/server/errors";
import { getUploadMaxBytes, isAllowedMimeType } from "@/src/lib/storage/policy";

export const maxDuration = 60;

const metaSchema = z.object({
  clientId: z.string().min(1),
  caseId: z.string().min(1).nullish(),
  roundId: z.string().min(1).nullish(),
  paymentId: z.string().min(1).nullish(),
  category: z.enum([
    "IDENTITY",
    "PROOF_OF_ADDRESS",
    "SSN_DOCUMENT",
    "CREDIT_REPORT",
    "DISPUTE_LETTER",
    "UPDATE_REPORT",
    "PAYMENT_PROOF",
    "OTHER",
  ]),
  sensitivity: z.enum(["INTERNAL", "CONFIDENTIAL", "HIGHLY_SENSITIVE"]).optional(),
  originalName: z.string().trim().min(1).max(255).optional(),
});

/**
 * POST /api/files/upload
 * multipart: file + metadatos → putObjectBytes + confirmUpload (sin CORS del bucket).
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireApiPermission("documents.upload");
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

    const meta = metaSchema.parse({
      clientId: form.get("clientId"),
      caseId: emptyToNull(form.get("caseId")),
      roundId: emptyToNull(form.get("roundId")),
      paymentId: emptyToNull(form.get("paymentId")),
      category: form.get("category"),
      sensitivity: emptyToNull(form.get("sensitivity")) ?? undefined,
      originalName: emptyToNull(form.get("originalName")) ?? undefined,
    });

    const body = new Uint8Array(await file.arrayBuffer());
    const document = await documentService.uploadDocumentDirect(ctx, {
      clientId: meta.clientId,
      caseId: meta.caseId,
      roundId: meta.roundId,
      paymentId: meta.paymentId,
      category: meta.category,
      sensitivity: meta.sensitivity,
      originalName: (meta.originalName || file.name || "documento").slice(0, 255),
      mimeType: file.type,
      sizeBytes: body.byteLength,
      body,
    });

    return NextResponse.json(
      {
        ok: true,
        data: { id: document.id, storageKey: document.storageKey },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
