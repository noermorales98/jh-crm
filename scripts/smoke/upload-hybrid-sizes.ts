/**
 * PDFs sintéticos ~1 MB y ~5 MB: strategy + putObjectBytes / PUT firmado.
 * Sin datos reales de clientes. Requiere S3_* para la parte de red.
 *
 *   npm run smoke:upload-hybrid
 *
 * Tras put firmado, borra el objeto. No crea filas Document.
 */
import { randomUUID } from "node:crypto";
import {
  SAME_ORIGIN_UPLOAD_MAX_BYTES,
  buildStorageKey,
} from "../../src/lib/storage/policy";
import {
  createPresignedUploadUrl,
  deleteObject,
  isStorageConfigured,
  putObjectBytes,
} from "../../src/lib/storage/s3";
import { chooseCrmUploadStrategy } from "../../src/lib/uploads/crm-upload-strategy";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

/** PDF mínimo + padding a targetBytes (sin contenido real de buró). */
function syntheticPdf(targetBytes: number): Uint8Array {
  const header = Buffer.from(
    "%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
    "utf8",
  );
  if (targetBytes <= header.byteLength) {
    return new Uint8Array(header);
  }
  const out = new Uint8Array(targetBytes);
  out.set(header, 0);
  // Relleno determinista (no aleatorio) para smoke estable.
  for (let i = header.byteLength; i < targetBytes; i++) {
    out[i] = i % 251;
  }
  return out;
}

async function main() {
  console.log("\n[upload-hybrid-sizes] PDFs sintéticos 1 MB / 5 MB");

  const oneMb = 1 * 1024 * 1024;
  const fiveMb = 5 * 1024 * 1024;

  check("strategy 1 MB = same-origin", chooseCrmUploadStrategy(oneMb) === "same-origin");
  check("strategy 5 MB = presigned", chooseCrmUploadStrategy(fiveMb) === "presigned");
  check(
    "5 MB >= umbral same-origin",
    fiveMb >= SAME_ORIGIN_UPLOAD_MAX_BYTES,
  );

  const pdf1 = syntheticPdf(oneMb);
  const pdf5 = syntheticPdf(fiveMb);
  check("sintético 1 MB tamaño", pdf1.byteLength === oneMb);
  check("sintético 5 MB tamaño", pdf5.byteLength === fiveMb);
  check("magic %PDF", Buffer.from(pdf1.slice(0, 4)).toString() === "%PDF");

  if (!isStorageConfigured()) {
    console.log("  ⊘ S3_* no configurado — solo strategy/sizes (OK parcial)");
    console.log("\nOK upload-hybrid-sizes (sin S3)\n");
    return;
  }

  const orgId = "smoke-upload-hybrid";
  const key1 = buildStorageKey(orgId, randomUUID());
  const key5 = buildStorageKey(orgId, randomUUID());

  try {
    await putObjectBytes({
      storageKey: key1,
      mimeType: "application/pdf",
      body: pdf1,
    });
    check("putObjectBytes ~1 MB (camino servidor)", true);

    const signed = await createPresignedUploadUrl({
      storageKey: key5,
      mimeType: "application/pdf",
      sizeBytes: pdf5.byteLength,
    });
    check("presign URL generada", Boolean(signed.url && signed.storageKey));

    const origin =
      process.env.UPLOAD_CORS_ORIGIN?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      "http://localhost:3000";

    const putRes = await fetch(signed.url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        Origin: origin,
      },
      body: Buffer.from(pdf5),
    });

    if (!putRes.ok) {
      console.error(
        `  PUT status ${putRes.status}. Si es CORS/red desde Preview, ver docs/upload-r2-cors.md`,
      );
    }
    check(
      `PUT firmado ~5 MB (Origin ${origin})`,
      putRes.ok,
      { status: putRes.status },
    );
  } finally {
    await deleteObject(key1).catch(() => undefined);
    await deleteObject(key5).catch(() => undefined);
  }

  console.log("\nOK upload-hybrid-sizes\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
