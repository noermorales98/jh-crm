import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  clientIpFromRequest,
} from "@/src/server/http";
import { contactFormSchema } from "@/src/lib/validation/contact";
import {
  createMathChallenge,
  verifyMathChallenge,
} from "@/src/lib/contact/challenge";
import { submitContactLead } from "@/src/server/contact";
import {
  assertRateLimit,
  sweepOldRateLimitBuckets,
} from "@/src/server/security/rate-limit";

/**
 * GET  /api/public/contact — reto anti-robot (token firmado).
 * POST /api/public/contact — envío del formulario de `/`.
 *
 * Rate limit solo en POST (IP + email). GET queda libre: limitar la
 * carga del reto bloqueaba el formulario (Strict Mode / varias instancias).
 * organizationId del body se ignora: el schema no lo admite y la org
 * sale solo de PUBLIC_ORG_ID en el servidor.
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

    const ip = clientIpFromRequest(request);
    const email = body.email.trim().toLowerCase();
    await assertRateLimit({
      key: `contact:post:ip:${ip}`,
      limit: 20,
      windowSeconds: 60 * 60,
    });
    await assertRateLimit({
      key: `contact:post:email:${email}`,
      limit: 10,
      windowSeconds: 60 * 60,
    });
    sweepOldRateLimitBuckets();

    verifyMathChallenge(body.challengeToken, body.challengeAnswer);
    const result = await submitContactLead({
      name: body.name,
      email: body.email,
      phone: body.phone,
      message: body.message,
      serviceRequested: body.serviceRequested,
      state: body.state,
      preferredContactMethod: body.preferredContactMethod,
      preferredContactTime: body.preferredContactTime,
      smsConsent: body.smsConsent === true,
      attribution: {
        utm_source: body.utm_source,
        utm_medium: body.utm_medium,
        utm_campaign: body.utm_campaign,
        utm_content: body.utm_content,
        utm_term: body.utm_term,
        fbclid: body.fbclid,
        gclid: body.gclid,
        landingPage: body.landingPage,
        referrer: body.referrer,
        sms_consent: body.smsConsent === true,
      },
    });

    return NextResponse.json({
      ok: true,
      message: result.message,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
