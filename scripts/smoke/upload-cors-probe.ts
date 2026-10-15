/**
 * Probe CORS del bucket para PUT de subidas firmadas (Preview / prod).
 * No escribe objetos. No imprime secretos.
 *
 *   UPLOAD_CORS_ORIGIN=https://tu-preview.vercel.app npm run smoke:upload-cors
 *   (requiere S3_* en .env.local)
 *
 * Si falla: aplica la config documentada en docs/upload-r2-cors.md
 */
import { isStorageConfigured } from "../../src/lib/storage/s3";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function corsDocHint(origin: string): string {
  return [
    "",
    "CORS del bucket (privado) no permite este Origin. En Cloudflare R2 →",
    "Settings → CORS Policy, aplica algo como:",
    "",
    JSON.stringify(
      [
        {
          AllowedOrigins: [
            origin,
            "https://jh-crm.vercel.app",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
          ],
          AllowedMethods: ["GET", "PUT", "HEAD"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag", "Content-Length"],
          MaxAgeSeconds: 86400,
        },
      ],
      null,
      2,
    ),
    "",
    "Detalle: docs/upload-r2-cors.md",
    "Sin esta config, PDFs ≥4 MB fallan en Preview (PUT firmado).",
  ].join("\n");
}

async function main() {
  console.log("\n[upload-cors-probe] OPTIONS al endpoint S3/R2");

  if (!isStorageConfigured()) {
    console.log("  ⊘ S3_* no configurado — skip (no es fallo de código)");
    console.log("\nSKIP upload-cors-probe\n");
    return;
  }

  const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, "");
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !bucket) {
    throw new Error("S3_ENDPOINT / S3_BUCKET incompletos");
  }

  const origin =
    process.env.UPLOAD_CORS_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://example-preview.vercel.app";

  // Path-style: {endpoint}/{bucket}/probe-key (objeto inexistente; solo OPTIONS)
  const url = `${endpoint}/${bucket}/org/_cors-probe/options-only`;

  console.log(`  Origin: ${origin}`);
  console.log(`  URL:    ${endpoint}/${bucket}/… (sin keys)`);

  const res = await fetch(url, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
  });

  const allowOrigin = res.headers.get("access-control-allow-origin");
  const allowMethods = res.headers.get("access-control-allow-methods") ?? "";
  const allowHeaders = res.headers.get("access-control-allow-headers") ?? "";

  console.log(`  status: ${res.status}`);
  console.log(`  ACAO:   ${allowOrigin ?? "(ausente)"}`);
  console.log(`  ACAM:   ${allowMethods || "(ausente)"}`);

  const originOk =
    allowOrigin === "*" ||
    allowOrigin === origin ||
    (allowOrigin?.includes("*") ?? false);
  const methodOk = /PUT/i.test(allowMethods) || allowMethods === "*";
  const headerOk =
    allowHeaders === "*" ||
    /content-type/i.test(allowHeaders) ||
    allowHeaders.length === 0; // algunos S3 omiten en éxito parcial

  if (!originOk || !methodOk) {
    console.error(corsDocHint(origin));
    check(
      "CORS permite Origin + PUT",
      false,
      { allowOrigin, allowMethods, allowHeaders, status: res.status },
    );
  }

  check("CORS Origin OK", originOk, allowOrigin);
  check("CORS Methods incluyen PUT", methodOk, allowMethods);
  check("CORS Headers OK (o wildcard)", headerOk, allowHeaders);

  console.log("\nOK upload-cors-probe\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
