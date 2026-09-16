import { NextResponse } from "next/server";
import { listPublicTestimonials } from "@/src/server/testimonials";
import { apiErrorResponse } from "@/src/server/http";

/** TM-004: lectura anónima; sin caché para respetar retiros de consentimiento. */
export async function GET() {
  try {
    return NextResponse.json(
      { ok: true, testimonials: await listPublicTestimonials() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const response = apiErrorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
