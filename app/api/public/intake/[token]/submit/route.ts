import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse } from "@/src/server/http";
import {
  isIntakeEnabled,
  submitIntake,
  validateIntakeToken,
} from "@/src/server/intake";
import {
  emailSchema,
  postalCodeSchema,
  usPhoneSchema,
  usStateSchema,
} from "@/src/lib/validation/common";

const submitSchema = z.object({
  firstName: z.string().trim().min(1, "El nombre es obligatorio.").max(100),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  email: emailSchema.optional().or(z.literal("")),
  phone: usPhoneSchema,
  addressLine1: z.string().trim().max(200).optional().or(z.literal("")),
  addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  state: usStateSchema,
  postalCode: postalCodeSchema,
  consent: z
    .object({
      consentType: z.string().trim().min(1).max(100),
      version: z.string().trim().min(1).max(50),
      textHash: z.string().trim().regex(/^[a-f0-9]{64}$/i, "Hash del texto inválido."),
      signerName: z.string().trim().max(100).nullish(),
    })
    .nullish(),
  documents: z
    .array(
      z.object({
        storageKey: z.string().min(1).max(500),
        originalName: z.string().trim().min(1).max(255),
        mimeType: z.string().min(1).max(100),
        sizeBytes: z.number().int().positive(),
        category: z
          .enum([
            "IDENTITY",
            "PROOF_OF_ADDRESS",
            "SSN_DOCUMENT",
            "CREDIT_REPORT",
            "DISPUTE_LETTER",
            "UPDATE_REPORT",
            "PAYMENT_PROOF",
            "OTHER",
          ])
          .optional(),
        checksumSha256: z.string().trim().regex(/^[a-f0-9]{64}$/i).nullish(),
      }),
    )
    .max(20)
    .optional(),
});

/**
 * POST /api/public/intake/[token]/submit
 * Crea/actualiza cliente + IntakeSubmission + ConsentRecord + useCount.
 * TODO(rate-limit): añadir limitador por IP/token cuando haya store
 * compartido (Redis/Upstash); la estructura del handler ya lo contempla.
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
    const body = submitSchema.parse(await request.json());

    const meta = {
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent"),
    };

    const emptyToNull = (v?: string | null) => (v?.trim() ? v.trim() : null);
    const result = await submitIntake(link, {
      firstName: body.firstName,
      lastName: emptyToNull(body.lastName),
      email: emptyToNull(body.email),
      phone: emptyToNull(body.phone),
      addressLine1: emptyToNull(body.addressLine1),
      addressLine2: emptyToNull(body.addressLine2),
      city: emptyToNull(body.city),
      state: emptyToNull(body.state),
      postalCode: emptyToNull(body.postalCode),
      consent: body.consent ?? null,
      documents: body.documents ?? [],
    }, meta);

    return NextResponse.json({ ok: true, data: { submissionId: result.submissionId } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
