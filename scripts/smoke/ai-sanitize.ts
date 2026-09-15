/**
 * Smoke AI-002: sanitizeForAI / sanitizeTextForAI (sin DB).
 *
 * Uso: npx tsx scripts/smoke/ai-sanitize.ts
 */
import { sanitizeForAI, sanitizeTextForAI } from "../../src/lib/ai/sanitize";

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

console.log("\n[AI-002] sanitizeForAI");

// 1. Texto libre
check(
  "enmascara 123-45-6789",
  sanitizeTextForAI("Su SSN es 123-45-6789, anótalo") ===
    "Su SSN es ***-**-****, anótalo",
);
check(
  "enmascara 9 dígitos seguidos",
  sanitizeTextForAI("ssn 123456789 ok") === "ssn ***-**-**** ok",
);
check(
  "no toca importes ni teléfonos",
  sanitizeTextForAI("Pagó $1,250.00 y su tel es 4691234567") ===
    "Pagó $1,250.00 y su tel es 4691234567",
);

// 2. Objetos de persona
const brief = {
  id: "c1",
  firstName: "María",
  lastName: "García",
  email: "maria@example.com",
  phone: "4691234567",
  city: "Dallas",
  addressLine1: "123 Main St",
  addressLine2: null,
  postalCode: "75201",
  ssnLast4: "6789",
  ssnEncrypted: "v1:abc:def",
  dateOfBirthEncrypted: "v1:abc:ghi",
  state: "TX",
  notes: "Me dio su SSN 987-65-4321 por teléfono",
  cases: [
    {
      id: "case1",
      state: "OPEN",
      summary: "Cliente refiere ITIN 900123456",
      items: [{ creditorName: "CapOne", accountReference: "XXXX-9911" }],
    },
  ],
  amounts: { agreed: { toString: () => "1000" } },
};

const clean = sanitizeForAI(brief) as Record<string, unknown>;

check("conserva nombre", clean.firstName === "María");
check("conserva email (contacto staff)", clean.email === "maria@example.com");
check("conserva teléfono", clean.phone === "4691234567");
check("elimina ssnLast4", !("ssnLast4" in clean));
check("elimina ssnEncrypted", !("ssnEncrypted" in clean));
check("elimina cualquier *Encrypted", !("dateOfBirthEncrypted" in clean));
check("elimina addressLine1", !("addressLine1" in clean));
check("elimina postalCode", !("postalCode" in clean));
check("elimina city en persona", !("city" in clean));
check(
  "mantiene state (ámbito persona: se conserva por ambigüedad con CaseState)",
  clean.state === "TX",
);
check(
  "enmascara SSN en texto libre anidado",
  clean.notes === "Me dio su SSN ***-**-**** por teléfono",
);

const cleanCases = clean.cases as Array<Record<string, unknown>>;
check("no rompe state del caso", cleanCases[0].state === "OPEN");
check(
  "enmascara ITIN de 9 dígitos en summary",
  cleanCases[0].summary === "Cliente refiere ITIN ***-**-****",
);
const items = cleanCases[0].items as Array<Record<string, unknown>>;
check("elimina accountReference", !("accountReference" in items[0]));
check("conserva creditorName", items[0].creditorName === "CapOne");

// 3. No muta el original
check("no muta el objeto original", brief.ssnLast4 === "6789");

// 4. Objetos no planos (Decimal-like) sobreviven
class Decimal {
  constructor(private v: string) {}
  toString() {
    return this.v;
  }
}
const withDecimal = sanitizeForAI({ total: new Decimal("250.50") }) as {
  total: Decimal;
};
check(
  "objetos no planos pasan intactos",
  withDecimal.total.toString() === "250.50",
);

// 5. Nulos/undefined/arrays raíz
check("null pasa", sanitizeForAI(null) === null);
check(
  "array raíz se recorre",
  (sanitizeForAI([{ ssn: "1" }, { ok: 1 }]) as Array<object>).length === 2 &&
    !("ssn" in (sanitizeForAI([{ ssn: "1" }]) as Array<object>)[0]),
);

console.log("\nOK — sanitizeForAI cumple la política docs/13.\n");
