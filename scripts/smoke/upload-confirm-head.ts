/**
 * PR-DC-CONFIRM — HeadObject al confirmar upload (sin firmar ContentLength).
 *
 *   npm run smoke:upload-confirm
 *
 * Requiere S3_* en .env.local (sandbox).
 */
import {
  deleteObject,
  isStorageConfigured,
  putObjectBytes,
} from "../../src/lib/storage/s3";
import { DomainError } from "../../src/server/errors";
import { assertStoredObjectMatchesClaim } from "../../src/server/storage/assert-stored-upload";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

async function main() {
  console.log("\n[PR-DC-CONFIRM] assertStoredObjectMatchesClaim");

  if (!isStorageConfigured()) {
    throw new Error(
      "Faltan S3_*. Este smoke requiere almacenamiento sandbox en .env.local.",
    );
  }

  const storageKey = `org/smoke-dc-confirm/documents/dc-${Date.now()}`;
  // PNG 1x1 mínimo
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  await putObjectBytes({
    storageKey,
    mimeType: "image/png",
    body: png,
  });

  try {
    const ok = await assertStoredObjectMatchesClaim({
      storageKey,
      mimeType: "image/png",
      sizeBytes: png.byteLength,
    });
    check("sizeBytes del Head coincide", ok.sizeBytes === png.byteLength);

    // Re-subir: el assert de tamaño malo borra el objeto; hay que volver a poner.
    await putObjectBytes({
      storageKey,
      mimeType: "image/png",
      body: png,
    });

    let wrongSizeThrown = false;
    try {
      await assertStoredObjectMatchesClaim({
        storageKey,
        mimeType: "image/png",
        sizeBytes: png.byteLength + 999,
      });
    } catch (e) {
      wrongSizeThrown = e instanceof DomainError;
      check(
        "sizeBytes mentiroso → DomainError",
        wrongSizeThrown,
        e instanceof Error ? e.message : e,
      );
    }
    check("lanzó en size mentiroso", wrongSizeThrown);

    // Objeto ya borrado por el assert fallido
    let missingThrown = false;
    try {
      await assertStoredObjectMatchesClaim({
        storageKey,
        mimeType: "image/png",
        sizeBytes: png.byteLength,
      });
    } catch (e) {
      missingThrown = e instanceof DomainError;
      check(
        "objeto ausente → DomainError",
        missingThrown,
        e instanceof Error ? e.message : e,
      );
    }
    check("lanzó si no hay objeto", missingThrown);
  } finally {
    try {
      await deleteObject(storageKey);
    } catch {
      /* ya puede estar borrado */
    }
  }

  console.log("\nOK upload-confirm-head\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
