/**
 * TEST-002 / JH-003 — CSV multilínea, escapes, UTF-8, aliases ES (sin DB).
 *
 * Uso: npx tsx scripts/smoke/csv-import-hardening.ts
 *      npm run smoke:csv-import-hardening
 */
import {
  MAX_CLIENT_IMPORT_ROWS,
  assertImportFileMeta,
  assertLooksLikeCsvText,
  classifyImportRows,
  normalizeHeaderCell,
  parseCsvRows,
  parseImportCsv,
} from "../../src/server/clients/import-csv";
import { DomainError } from "../../src/server/errors";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

console.log("\n[TEST-002] CSV import hardening");

check(
  "header acentos",
  normalizeHeaderCell("Correo Electrónico") === "correo_electronico",
);

const multiline = [
  "nombre,apellido,correo",
  '"Ana","López Pérez","ana@example.com"',
  '"Bob","Linea1',
  'Linea2","bob@example.com"',
].join("\n");
const multiRows = parseCsvRows(multiline);
check("multilinea → 3 filas", multiRows.length === 3, multiRows);
check(
  "apellido multilinea conservado",
  multiRows[2]?.[1] === "Linea1\nLinea2",
  multiRows[2],
);

const escaped = parseCsvRows('nombre,notas\n"Ada","dijo ""hola"""\n');
check("escape comillas", escaped[1]?.[1] === 'dijo "hola"', escaped[1]);

const esCsv = [
  "Nombre,Apellidos,Correo electrónico",
  "María,García Núñez,maria@example.com",
  "José,,jose@example.com",
].join("\n");
const parsedEs = parseImportCsv(esCsv);
check("aliases ES filas", parsedEs.length === 2);
check("first María", parsedEs[0]?.firstName === "María");
check("last García Núñez", parsedEs[0]?.lastName === "García Núñez");
check(
  "email María",
  parsedEs[0]?.emailRaw.toLowerCase() === "maria@example.com",
);
check("José sin apellido", parsedEs[1]?.lastName === "");

const reordered = parseImportCsv(
  "correo,apellido,nombre\nx@y.com,Perez,Luis\n",
);
check("columnas reordenadas email", reordered[0]?.emailRaw === "x@y.com");
check("columnas reordenadas first", reordered[0]?.firstName === "Luis");

const bom = parseImportCsv("\uFEFFnombre,correo\nPat,pat@example.com\n");
check("BOM UTF-8", bom[0]?.firstName === "Pat");

try {
  assertImportFileMeta("x.xlsx");
  check("xlsx bloqueado", false);
} catch (e) {
  check("xlsx DomainError", e instanceof DomainError);
}

try {
  assertLooksLikeCsvText("PK\u0003\u0004");
  check("zip magic bloqueado", false);
} catch (e) {
  check("zip DomainError", e instanceof DomainError);
}

try {
  parseCsvRows('"abierto sin cierre');
  check("comillas abiertas", false);
} catch (e) {
  check("comillas abiertas DomainError", e instanceof DomainError);
}

const classified = classifyImportRows(
  parseImportCsv(
    "email,nombre\na@a.com,A\na@a.com,B\n\nb@b.com,C\n".replace(
      "\n\n",
      "\n",
    ),
  ),
  new Map(),
);
check(
  "duplicate_in_file",
  classified.some((r) => r.status === "duplicate_in_file"),
);

check("límite documentado", MAX_CLIENT_IMPORT_ROWS === 500);

console.log("\nOK csv-import-hardening (TEST-002)\n");
