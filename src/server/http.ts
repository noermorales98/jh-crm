import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError } from "./errors";
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
