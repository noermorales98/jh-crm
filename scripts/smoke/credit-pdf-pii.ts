/**
 * PR-SEC-PII — redactBureauText + extracción sin adjuntar PDF (sin red).
 *
 * Uso: npx tsx scripts/smoke/credit-pdf-pii.ts
 *      npm run smoke:credit-pdf-pii
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { redactBureauText } from "../../src/server/credit-import/redact";
import { classifyAndExtractFromPdf } from "../../src/server/credit-import/extract";

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function main() {
  console.log("\n[PR-SEC-PII] redactBureauText");

  const raw = [
    "Name: Jane Doe",
    "SSN: 123-45-6789",
    "SSN bare 123456789",
    "DOB: 1990-05-15",
    "Date of Birth: 05/15/1990",
    "Account 12345678901234 balance 500",
    "Score 720",
  ].join("\n");

  const redacted = redactBureauText(raw);
  check("SSN dashed no queda", !redacted.includes("123-45-6789"));
  check("SSN bare no queda", !redacted.includes("123456789"));
  check("DOB ISO no queda", !redacted.includes("1990-05-15"));
  check("DOB US no queda", !redacted.includes("05/15/1990"));
  check("cuenta larga no queda", !redacted.includes("12345678901234"));
  check("score de 3 dígitos se conserva", redacted.includes("720"));
  check("nombre se conserva", redacted.includes("Jane Doe"));

  console.log("\n[PR-SEC-PII] classifyAndExtractFromPdf sparse (sin OpenRouter)");

  const sparse = await classifyAndExtractFromPdf({
    fileName: "scan-sintetico.pdf",
    extract: {
      text: "pocos chars",
      pageCount: 1,
      mode: "sparse",
      charCount: 12,
    },
  });

  check("documentKind UNKNOWN", sparse.documentKind === "UNKNOWN");
  check("confidence low", sparse.confidence === "low");
  check(
    "warning de no adjuntar PDF",
    sparse.warnings.some((w) =>
      w.toLowerCase().includes("no se adjuntó el pdf"),
    ),
  );
  check("sin ítems inventados", (sparse.report?.items?.length ?? 0) === 0);

  console.log("\n[PR-SEC-PII] código sin rama multimodal type:file");

  const extractSrc = readFileSync(
    join(process.cwd(), "src/server/credit-import/extract.ts"),
    "utf8",
  );
  check(
    "extract.ts no adjunta type file",
    !extractSrc.includes('type: "file"') &&
      !extractSrc.includes("type: 'file'"),
  );
  check("extract.ts no usa pdfBytes", !extractSrc.includes("pdfBytes"));

  console.log("\nOK credit-pdf-pii\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
