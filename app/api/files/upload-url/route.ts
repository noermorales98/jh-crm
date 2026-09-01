import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/src/server/auth/guards";
import { apiErrorResponse } from "@/src/server/http";
import * as documentService from "@/src/server/documents";

const bodySchema = z.object({
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
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

/** POST /api/files/upload-url — URL firmada PUT para subida directa al bucket. */
export async function POST(request: Request) {
  try {
    const ctx = await requireApiPermission("documents.upload");
    const body = bodySchema.parse(await request.json());
    const upload = await documentService.requestUpload(ctx, body);
    return NextResponse.json({ ok: true, data: upload });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
