/**
 * Smoke sin DB: orgDateInputSchema + resolveOrgDateInput + zonedNoonInDays.
 * Uso: npm run smoke:org-date
 */
import {
  optionalDateSchema,
  orgDateInputSchema,
  resolveOrgDateInput,
} from "../../src/lib/validation/common";
import { zonedNoonInDays } from "../../src/lib/format/dates";

const TZ = "America/Chicago";

let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function resolve(input: unknown) {
  return resolveOrgDateInput(orgDateInputSchema.parse(input), TZ, 12);
}

console.log("resolveOrgDateInput (America/Chicago, 12:00)");

const ymdCases: Array<{ input: string; expected: string; note: string }> = [
  { input: "2026-09-25", expected: "2026-09-25T17:00:00.000Z", note: "día normal (CDT)" },
  { input: "2026-03-08", expected: "2026-03-08T17:00:00.000Z", note: "inicio DST (CDT)" },
  { input: "2026-11-01", expected: "2026-11-01T18:00:00.000Z", note: "fin DST (CST)" },
  { input: "2026-01-15", expected: "2026-01-15T18:00:00.000Z", note: "invierno (CST)" },
];
for (const c of ymdCases) {
  const got = resolve(c.input);
  check(
    `${c.input} → ${c.expected} (${c.note})`,
    got instanceof Date && got.toISOString() === c.expected,
    `got ${got instanceof Date ? got.toISOString() : String(got)}`,
  );
}

const instant = "2026-09-25T15:30:00.000Z";
const gotInstant = resolve(instant);
check(
  "instante completo se respeta",
  gotInstant instanceof Date && gotInstant.toISOString() === instant,
  `got ${String(gotInstant)}`,
);

const date = new Date("2026-09-25T15:30:00.000Z");
const gotDate = resolve(date);
check(
  "Date se respeta",
  gotDate instanceof Date && gotDate.getTime() === date.getTime(),
);

check("null → null (borrar)", resolve(null) === null);
check("undefined → undefined (sin cambio)", resolve(undefined) === undefined);

// "" se rechaza igual que con optionalDateSchema (los forms mandan null).
check(
  '"" se rechaza igual que optionalDateSchema',
  !orgDateInputSchema.safeParse("").success &&
    !optionalDateSchema.safeParse("").success,
);
check("texto inválido se rechaza", !orgDateInputSchema.safeParse("mañana").success);

console.log("\nzonedNoonInDays");
const now = new Date("2026-09-24T03:30:00.000Z"); // 23-sep 22:30 CDT
check(
  "+2 días desde 23-sep noche local → 25-sep 12:00 CDT",
  zonedNoonInDays(now, TZ, 2).toISOString() === "2026-09-25T17:00:00.000Z",
  zonedNoonInDays(now, TZ, 2).toISOString(),
);
const beforeDst = new Date("2026-10-31T20:00:00.000Z"); // 31-oct 15:00 CDT
check(
  "+1 día cruzando fin de DST → 1-nov 12:00 CST",
  zonedNoonInDays(beforeDst, TZ, 1).toISOString() === "2026-11-01T18:00:00.000Z",
  zonedNoonInDays(beforeDst, TZ, 1).toISOString(),
);

if (failed > 0) {
  console.error(`\n${failed} fallo(s).`);
  process.exit(1);
}
console.log("\nOK");
