/**
 * TEST-003 / JH-004 — política de dedupe (sin DB).
 * Ver docs/CLIENT_DEDUPE_POLICY.md.
 */
import {
  classifyImportRows,
  normalizeImportEmail,
  parseImportCsv,
  shouldSkipCreateForExistingEmail,
} from "../../src/server/clients/import-csv";

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

console.log("\n[TEST-003] client dedupe policy");

check(
  "normalize email",
  normalizeImportEmail("  Foo@Example.COM ") === "foo@example.com",
);

const csv = "email,nombre\na@x.com,A\na@x.com,B\nb@x.com,C\n";
const classified = classifyImportRows(parseImportCsv(csv), new Map());
check(
  "duplicate_in_file",
  classified.filter((r) => r.status === "duplicate_in_file").length === 1,
);
check(
  "create remaining",
  classified.filter((r) => r.status === "create").length === 2,
);

const existing = new Map([["a@x.com", "client-1"]]);
const againstDb = classifyImportRows(parseImportCsv(csv), existing);
check(
  "exists vs DB",
  againstDb.some((r) => r.status === "exists" && r.existingClientId === "client-1"),
);

const race = shouldSkipCreateForExistingEmail(
  "A@X.com",
  new Map([["a@x.com", "id-9"]]),
);
check("race skip", race.skip === true && race.skip && race.existingClientId === "id-9");
check(
  "race allow new",
  shouldSkipCreateForExistingEmail("new@x.com", existing).skip === false,
);

console.log("\nOK client-dedupe-policy (TEST-003)\n");
