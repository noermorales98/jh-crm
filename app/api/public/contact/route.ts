import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/src/server/http";
import { contactFormSchema } from "@/src/lib/validation/contact";
import { createMathChallenge, verifyMathChallenge } from "@/src/lib/contact/challenge";
import { submitContactLead } from "@/src/server/contact";

/**
 * GET  /api/public/contact — reto anti-robot (token firmado; la UI pide un desliz).
 * POST /api/public/contact — envío del formulario de `/`.
 *
 * Sin rate-limit: el reto firmado + honeypot bastan; limitar por IP bloqueaba
 * la carga del formulario (2 instancias + Strict Mode en dev).
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
