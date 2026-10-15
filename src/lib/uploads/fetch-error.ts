/**
 * Clasifica fallos de subida/borrado de archivos en el cliente.
 * Un TypeError de fetch (CORS, red, redirect: "error") NO implica sesión caducada.
 */

export type UploadErrorKind = "auth" | "storage" | "network" | "other";

export type UploadErrorPhase =
  | "prepare"
  | "put"
  | "confirm"
  | "upload"
  | "delete";

export type ClassifyUploadErrorInput = {
  error: unknown;
  phase?: UploadErrorPhase;
  httpStatus?: number | null;
  responseBody?: unknown;
};

const SESSION_EXPIRED_MESSAGE =
  "Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo.";

const NETWORK_MESSAGE =
  "No se pudo conectar con el servidor o el almacenamiento. Revisa la red e intenta de nuevo.";

const STORAGE_MESSAGE = "La subida al almacenamiento falló. Intenta de nuevo.";

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (value && typeof value === "object" && "error" in value) {
    const err = (value as { error: unknown }).error;
    if (typeof err === "string") return err;
    if (err && typeof err === "object" && "message" in err) {
      const msg = (err as { message: unknown }).message;
      if (typeof msg === "string") return msg;
    }
  }
  if (value && typeof value === "object" && "message" in value) {
    const msg = (value as { message: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "";
}

function looksLikeAuth(text: string, httpStatus?: number | null): boolean {
  if (httpStatus === 401) return true;
  return /sesi[oó]n expir|iniciar sesi[oó]n|unauthorized|no autenticad|no autorizado|protected deployment/i.test(
    text,
  );
}

function looksLikeStorage(text: string, phase?: UploadErrorPhase): boolean {
  if (phase === "put") return true;
  return /almacenamiento|storage|S3|bucket|HeadObject|objeto ausente/i.test(
    text,
  );
}

/**
 * Comportamiento anterior del DocumentUploader (incorrecto):
 * cualquier TypeError → “sesión expirada”.
 */
export function legacyClassifyUploadTypeError(error: unknown): string {
  if (error instanceof TypeError) {
    return SESSION_EXPIRED_MESSAGE;
  }
  return error instanceof Error
    ? error.message
    : "No se pudo subir el archivo.";
}

export function classifyUploadError(input: ClassifyUploadErrorInput): {
  kind: UploadErrorKind;
  message: string;
} {
  const { error, phase, httpStatus, responseBody } = input;
  const fromError = asText(error);
  const fromBody = asText(responseBody);
  const combined = `${fromError} ${fromBody}`.trim();

  if (looksLikeAuth(combined, httpStatus)) {
    return {
      kind: "auth",
      message:
        fromBody || fromError || SESSION_EXPIRED_MESSAGE,
    };
  }

  if (looksLikeStorage(combined, phase)) {
    return {
      kind: "storage",
      message: fromError || fromBody || STORAGE_MESSAGE,
    };
  }

  if (
    error instanceof TypeError ||
    /failed to fetch|networkerror|load failed|fetch failed/i.test(combined)
  ) {
    return { kind: "network", message: NETWORK_MESSAGE };
  }

  return {
    kind: "other",
    message: fromError || fromBody || "No se pudo subir el archivo.",
  };
}

export const UPLOAD_ERROR_MESSAGES = {
  sessionExpired: SESSION_EXPIRED_MESSAGE,
  network: NETWORK_MESSAGE,
  storage: STORAGE_MESSAGE,
} as const;
