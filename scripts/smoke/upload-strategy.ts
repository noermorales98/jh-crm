/**
 * Selección de camino CRM (same-origin vs presigned) y topes por categoría.
 * Sin red ni DB.
 *
 *   npm run smoke:upload-strategy
 */
import {
  CREDIT_REPORT_UPLOAD_MAX_BYTES,
  SAME_ORIGIN_UPLOAD_MAX_BYTES,
  assertAllowedFile,
  getUploadMaxBytesForCategory,
} from "../../src/lib/storage/policy";
import { chooseCrmUploadStrategy } from "../../src/lib/uploads/crm-upload-strategy";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function main() {
  console.log("\n[upload-strategy] chooseCrmUploadStrategy + límites categoría");

  check(
    "1 MiB → same-origin",
    chooseCrmUploadStrategy(1 * 1024 * 1024) === "same-origin",
  );
  check(
    "umbral-1 → same-origin",
    chooseCrmUploadStrategy(SAME_ORIGIN_UPLOAD_MAX_BYTES - 1) === "same-origin",
  );
  check(
    "umbral exacto → presigned",
    chooseCrmUploadStrategy(SAME_ORIGIN_UPLOAD_MAX_BYTES) === "presigned",
  );
  check(
    "5 MB → presigned",
    chooseCrmUploadStrategy(5 * 1024 * 1024) === "presigned",
  );

  check(
    "CREDIT_REPORT tope 12 MB",
    getUploadMaxBytesForCategory("CREDIT_REPORT") ===
      CREDIT_REPORT_UPLOAD_MAX_BYTES,
  );
  check(
    "UPDATE_REPORT tope 12 MB",
    getUploadMaxBytesForCategory("UPDATE_REPORT") ===
      CREDIT_REPORT_UPLOAD_MAX_BYTES,
  );
  check(
    "IDENTITY tope >= 12 MB (UPLOAD_MAX_MB)",
    getUploadMaxBytesForCategory("IDENTITY") >= CREDIT_REPORT_UPLOAD_MAX_BYTES,
  );

  let threw = false;
  try {
    assertAllowedFile(
      "application/pdf",
      CREDIT_REPORT_UPLOAD_MAX_BYTES + 1,
      "CREDIT_REPORT",
    );
  } catch {
    threw = true;
  }
  check("CREDIT_REPORT rechaza >12 MB", threw);

  threw = false;
  try {
    assertAllowedFile(
      "application/pdf",
      CREDIT_REPORT_UPLOAD_MAX_BYTES,
      "CREDIT_REPORT",
    );
  } catch {
    threw = true;
  }
  check("CREDIT_REPORT acepta 12 MB exactos", !threw);

  console.log("\nOK upload-strategy\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
