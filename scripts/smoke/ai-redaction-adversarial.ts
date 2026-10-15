/**
 * TEST-006 / JH-007 — redacción adversarial sintética (texto + filename).
 * Sin red, sin OpenRouter, sin DB.
 *
 * Uso: npx tsx scripts/smoke/ai-redaction-adversarial.ts
 *      npm run smoke:ai-redaction-adversarial
 */
import {
  redactBureauText,
  sanitizeFileNameForAI,
} from "../../src/server/credit-import/redact";
import { sanitizeTextForAI } from "../../src/lib/ai/sanitize";

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

function assertAbsent(label: string, haystack: string, needle: string) {
  check(`${label} ausente`, !haystack.includes(needle));
}

console.log("\n[TEST-006] AI redaction adversarial (sintético)");

const payload = [
  "Subject: Jane Synthetic",
  "SSN: 123-45-6789",
  "SSN bare 987654321",
  "SSN spaced 111 22 3333",
  "ITIN: 900-70-0000",
  "DOB: 1990-05-15",
  "Date of Birth: 05/15/1990",
  "Email: jane.synthetic@example.test",
  "Phone: (469) 555-0100",
  "Account 12345678901234 balance 500",
  "Score EQ 720 EX 710 TU 705",
].join("\n");

const redacted = redactBureauText(payload);

assertAbsent("SSN dashed", redacted, "123-45-6789");
assertAbsent("SSN bare", redacted, "987654321");
assertAbsent("SSN spaced", redacted, "111 22 3333");
assertAbsent("ITIN", redacted, "900-70-0000");
assertAbsent("DOB ISO", redacted, "1990-05-15");
assertAbsent("DOB US", redacted, "05/15/1990");
assertAbsent("email", redacted, "jane.synthetic@example.test");
assertAbsent("phone", redacted, "469");
assertAbsent("account", redacted, "12345678901234");
check("score 720 conservado", redacted.includes("720"));
check("score 710 conservado", redacted.includes("710"));
check("nombre sintético conservado", redacted.includes("Jane Synthetic"));

const dirtyName =
  "reporte_Jane_123-45-6789_jane.synthetic@example.test_4695550100.pdf";
const safeName = sanitizeFileNameForAI(dirtyName);
assertAbsent("filename SSN", safeName, "123-45-6789");
assertAbsent("filename email", safeName, "jane.synthetic@example.test");
assertAbsent("filename phone digits run", safeName, "4695550100");
check("filename conserva .pdf", safeName.toLowerCase().endsWith(".pdf"));
check(
  "filename no vacío",
  safeName.replace(/\.pdf$/i, "").length > 0,
);

// sanitizeTextForAI sigue enmascarando SSN en notas de chat
check(
  "sanitizeTextForAI dashed",
  sanitizeTextForAI("nota 222-33-4444") === "nota ***-**-****",
);

// Casos borde filename
check(
  "filename vacío → document.pdf",
  sanitizeFileNameForAI("   ") === "document.pdf",
);
check(
  "filename solo extensión",
  sanitizeFileNameForAI(".pdf").toLowerCase().includes("pdf"),
);

console.log("\nOK ai-redaction-adversarial (TEST-006)\n");
