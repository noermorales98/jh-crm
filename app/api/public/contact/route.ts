import { NextResponse } from "next/server";
import { apiErrorResponse, clientIpFromRequest } from "@/src/server/http";
import { contactFormSchema } from "@/src/lib/validation/contact";
import { createMathChallenge, verifyMathChallenge } from "@/src/lib/contact/challenge";
import { submitContactLead } from "@/src/server/contact";
import {
  assertRateLimit,
  sweepOldRateLimitBuckets,
} from "@/src/server/security/rate-limit";

/**
 * GET  /api/public/contact — reto anti-robot (token firmado; la UI pide un desliz).
 * POST /api/public/contact — envío del formulario de `/`.
 */
export async function GET(request: Request) {
  try {
    const ip = clientIpFromRequest(request);
    await assertRateLimit({
      key: `contact:get:ip:${ip}`,
      limit: 30,
      windowSeconds: 60 * 60,
    });
    return NextResponse.json({ ok: true, ...createMathChallenge() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ip = clientIpFromRequest(request);
    await assertRateLimit({
      key: `contact:post:ip:${ip}`,
      limit: 8,
      windowSeconds: 60 * 60,
    });
    sweepOldRateLimitBuckets();

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
