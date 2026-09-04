import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError, RateLimitError } from "./errors";
import { ForbiddenError, UnauthorizedError } from "./auth/guards";

/**
 * Mapeo uniforme de errores a respuestas JSON para Route Handlers.
 * Nunca exponer stack traces ni detalles internos al cliente.
 */
export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
  }
  if (error instanceof RateLimitError) {
    return NextResponse.json(
      { ok: false, error: error.message },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "Cache-Control": "no-store",
        },
      },
    );
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return NextResponse.json(
      { ok: false, error: first?.message ?? "Datos inválidos." },
      { status: 422 },
    );
  }
  if (error instanceof DomainError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  console.error("[api] error inesperado:", error);
  return NextResponse.json(
    { ok: false, error: "Error interno. Intenta de nuevo." },
    { status: 500 },
  );
}

/** IP del cliente detrás de proxy (Vercel / Cloudflare). */
export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "unknown";
}
