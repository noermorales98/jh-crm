/**
 * Clasificación de errores de subida (sin red ni DB).
 *
 *   npm run smoke:upload-errors
 *
 * Demuestra que el mapeo antiguo TypeError→sesión es incorrecto
 * y que el clasificador nuevo diferencia auth / red / almacenamiento.
 */
import {
  UPLOAD_ERROR_MESSAGES,
  classifyUploadError,
  legacyClassifyUploadTypeError,
} from "../../src/lib/uploads/fetch-error";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function main() {
  console.log("\n[upload-errors] classifyUploadError vs legacy TypeError");

  const corsTypeError = new TypeError("Failed to fetch");

  check(
    "ANTES: TypeError de PUT se etiquetaba como sesión expirada",
    legacyClassifyUploadTypeError(corsTypeError) ===
      UPLOAD_ERROR_MESSAGES.sessionExpired,
    legacyClassifyUploadTypeError(corsTypeError),
  );

  const putNetwork = classifyUploadError({
    error: corsTypeError,
    phase: "put",
  });
  check(
    "DESPUÉS: TypeError en fase put → storage (no sesión)",
    putNetwork.kind === "storage" &&
      putNetwork.message !== UPLOAD_ERROR_MESSAGES.sessionExpired,
    putNetwork,
  );

  const plainNetwork = classifyUploadError({
    error: corsTypeError,
    phase: "upload",
  });
  check(
    "TypeError en upload same-origin → network (no sesión)",
    plainNetwork.kind === "network" &&
      plainNetwork.message === UPLOAD_ERROR_MESSAGES.network,
    plainNetwork,
  );

  const authStatus = classifyUploadError({
    error: new Error("x"),
    httpStatus: 401,
    responseBody: { ok: false, error: "No autenticado." },
  });
  check(
    "HTTP 401 → auth",
    authStatus.kind === "auth" && /autenticad|sesi/i.test(authStatus.message),
    authStatus,
  );

  const authBody = classifyUploadError({
    error: new Error("Unexpected"),
    httpStatus: 200,
    responseBody: {
      ok: false,
      error: "Tu sesión expiró. Vuelve a iniciar sesión.",
    },
  });
  check("cuerpo con sesión expirada → auth", authBody.kind === "auth", authBody);

  const storageExplicit = classifyUploadError({
    error: new Error("La subida al almacenamiento falló."),
    phase: "upload",
  });
  check(
    "mensaje de almacenamiento → storage",
    storageExplicit.kind === "storage",
    storageExplicit,
  );

  const redirectLike = classifyUploadError({
    error: new TypeError("Failed to fetch"),
    phase: "prepare",
    httpStatus: 401,
  });
  check(
    "TypeError + 401 (redirect/auth) → auth, no network genérico",
    redirectLike.kind === "auth",
    redirectLike,
  );

  const other = classifyUploadError({
    error: new Error("Solo se aceptan PDF, JPG y PNG."),
  });
  check(
    "error de validación → other con el mensaje original",
    other.kind === "other" && other.message.includes("PDF"),
    other,
  );

  console.log("\nOK upload-errors\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
