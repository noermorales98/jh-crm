import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, clientIpFromRequest } from "@/src/server/http";
import {
  isIntakeEnabled,
  submitIntake,
  validateIntakeToken,
} from "@/src/server/intake";
import { assertValidIntakeConsent } from "@/src/server/intake/consent";
import {
  assertRateLimit,
  sweepOldRateLimitBuckets,
} from "@/src/server/security/rate-limit";
import {
  emailSchema,
  postalCodeSchema,
  usPhoneSchema,
  usStateSchema,
} from "@/src/lib/validation/common";
import { intakePayloadSchema } from "@/src/lib/validation/intake-payload";

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
  payload: intakePayloadSchema.optional(),
  consent: z.object({
    consentType: z.string().trim().min(1).max(100),
    version: z.string().trim().min(1).max(50),
    textHash: z.string().trim().regex(/^[a-f0-9]{64}$/i, "Hash del texto inválido."),
    signerName: z.string().trim().max(100).nullish(),
  }),
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
      key: `intake:submit:ip:${ip}`,
      limit: 10,
      windowSeconds: 60 * 60,
    });
    await assertRateLimit({
      key: `intake:submit:token:${token.slice(0, 80)}`,
      limit: 5,
      windowSeconds: 60 * 60,
    });
    sweepOldRateLimitBuckets();

    const link = await validateIntakeToken(token);
    const body = submitSchema.parse(await request.json());
    assertValidIntakeConsent(body.consent);

    const meta = {
      ipAddress: ip === "unknown" ? null : ip,
      userAgent: request.headers.get("user-agent"),
    };

    const emptyToNull = (v?: string | null) => (v?.trim() ? v.trim() : null);
    const result = await submitIntake(
      link,
      {
        firstName: body.firstName,
        lastName: emptyToNull(body.lastName),
        email: emptyToNull(body.email),
        phone: emptyToNull(body.phone),
        addressLine1: emptyToNull(body.addressLine1),
        addressLine2: emptyToNull(body.addressLine2),
        city: emptyToNull(body.city),
        state: emptyToNull(body.state),
        postalCode: emptyToNull(body.postalCode),
        payload: body.payload,
        consent: body.consent,
        documents: body.documents ?? [],
      },
      meta,
    );

    try {
      const { notifyIntakeSubmitted } = await import("@/src/server/intake/notify");
      await notifyIntakeSubmitted(link.organizationId, {
        clientId: result.clientId,
        submissionId: result.submissionId,
        firstName: body.firstName,
        lastName: emptyToNull(body.lastName),
        email: emptyToNull(body.email),
        phone: emptyToNull(body.phone),
        documentCount: body.documents?.length ?? 0,
      });
    } catch (error) {
      console.error(
        "[intake] no se pudo notificar el registro:",
        error instanceof Error ? error.message : "error",
      );
    }

    return NextResponse.json(
      { ok: true, data: { submissionId: result.submissionId } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
