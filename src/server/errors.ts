import { Prisma } from "@prisma/client";

/**
 * Error de dominio: mensaje legible en español, seguro para mostrar al
 * usuario. Los servicios lanzan DomainError para reglas de negocio
 * (etapa inválida, cotización no editable, almacenamiento no configurado…).
 * Las Server Actions lo convierten en { ok: false, error }.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

/**
 * Recurso no encontrado (HTTP 404 en Route Handlers).
 * Usar cuando el denegado debe ser indistinguible de “no existe”
 * (p.ej. ACL portal PDF cross-client — JH-002).
 */
export class NotFoundError extends DomainError {
  readonly status = 404;
  constructor(message = "No encontrado.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Demasiadas peticiones (APIs públicas). */
export class RateLimitError extends Error {
  readonly status = 429;
  constructor(message = "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.") {
    super(message);
    this.name = "RateLimitError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

/**
 * Errores de control de Next (redirect()/notFound()) deben propagarse,
 * no convertirse en { ok: false }.
 */
export function isNextControlError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    /^(NEXT_REDIRECT|NEXT_NOT_FOUND)/.test((error as { digest: string }).digest)
  );
}

function isPrismaTransactionTimeout(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2028"
  ) {
    return true;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return /transaction already closed|expired transaction|timeout for this transaction/i.test(
    msg,
  );
}

/** Mensaje seguro para devolver al cliente desde una Server Action. */
export function actionErrorMessage(error: unknown): string {
  if (isDomainError(error)) return error.message;
  if (
    error instanceof Error &&
    (error.name === "ForbiddenError" || error.name === "UnauthorizedError")
  ) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    error.constructor?.name === "ZodError" &&
    "issues" in error
  ) {
    const issues = (error as { issues: { message: string }[] }).issues;
    if (issues[0]?.message) return issues[0].message;
  }
  if (isPrismaTransactionTimeout(error)) {
    return "La operación tardó demasiado. Intenta de nuevo.";
  }
  console.error("[action] error inesperado:", error);
  return "Ocurrió un error inesperado. Intenta de nuevo.";
}

/** Resultado uniforme de Server Actions para formularios cliente. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionFail(error: unknown): ActionResult<never> {
  return { ok: false, error: actionErrorMessage(error) };
}
