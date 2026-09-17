import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/src/server/payments/stripe";
import { DomainError } from "@/src/server/errors";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await context.params;
    if (!organizationId?.trim()) {
      return NextResponse.json({ ok: false, error: "organizationId requerido" }, { status: 400 });
    }
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ ok: false, error: "Falta stripe-signature" }, { status: 400 });
    }
    const rawBody = await request.text();
    const result = await handleStripeWebhook(
      organizationId,
      rawBody,
      signature,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof DomainError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Error de webhook";
    const status =
      error instanceof DomainError && message.includes("Firma")
        ? 400
        : error instanceof DomainError
          ? 400
          : 500;
    console.error("[stripe webhook]", message);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
