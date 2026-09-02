import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/src/server/http";
import { contactFormSchema } from "@/src/lib/validation/contact";
import { createMathChallenge, verifyMathChallenge } from "@/src/lib/contact/challenge";
import { submitContactLead } from "@/src/server/contact";

/**
 * GET  /api/public/contact — reto anti-robot (token firmado; la UI pide un desliz).
 * POST /api/public/contact — envío del formulario de `/`.
 * TODO(rate-limit): limitar por IP cuando haya store compartido.
 */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...createMathChallenge() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = contactFormSchema.parse(await request.json());

    if (body.website?.trim()) {
      return NextResponse.json({ ok: true });
    }

    verifyMathChallenge(body.challengeToken, body.challengeAnswer);
    await submitContactLead({
      name: body.name,
      email: body.email,
      phone: body.phone,
      message: body.message,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
