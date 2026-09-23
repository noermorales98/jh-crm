/**
 * Smoke sin DB: classifyTaskDue + zonedWeekRange (DST) + zonedDateAtHour.
 * Uso: npm run smoke:ts-due
 */
import {
  classifyTaskDue,
  zonedDateAtHour,
  zonedWeekRange,
} from "../../src/lib/format/dates";

const TZ = "America/Chicago";
const now = new Date("2026-09-23T20:00:00.000Z"); // 15:00 CDT

let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("classifyTaskDue (America/Chicago, now=2026-09-23T20:00Z)");

const cases: Array<{
  dueAt: string | null;
  expected: ReturnType<typeof classifyTaskDue>;
  note: string;
}> = [
  {
    dueAt: "2026-09-23T14:00:00.000Z",
    expected: "today",
    note: "09:00 local 23 — today, no vencida",
  },
  {
    dueAt: "2026-09-23T04:00:00.000Z",
    expected: "overdue",
    note: "22-sep 23:00 local — overdue",
  },
  {
    dueAt: "2026-09-24T04:59:00.000Z",
    expected: "today",
    note: "23:59 local 23 — today",
  },
  {
    dueAt: "2026-09-24T05:00:00.000Z",
    expected: "week",
    note: "00:00 local 24 — week",
  },
  {
    dueAt: "2026-10-01T12:00:00.000Z",
    expected: "later",
    note: "later",
  },
  {
    dueAt: null,
    expected: "none",
    note: "null → none",
  },
];

for (const c of cases) {
  const got = classifyTaskDue(c.dueAt, now, TZ);
  check(
    `${c.note} → ${c.expected}`,
    got === c.expected,
    `got ${got}`,
  );
}

console.log("zonedWeekRange DST (now=2026-10-28 Chicago → end = Nov 4 local midnight)");
const dstNow = new Date("2026-10-28T17:00:00.000Z");
const week = zonedWeekRange(dstNow, TZ);
const nov4Start = new Date("2026-11-04T06:00:00.000Z"); // CST after fall-back
check(
  "week.end === medianoche local 4 nov",
  week.end.getTime() === nov4Start.getTime(),
  `got ${week.end.toISOString()} expected ${nov4Start.toISOString()}`,
);

console.log("zonedDateAtHour");
const noonCdt = zonedDateAtHour("2026-09-23", TZ, 12);
check(
  "2026-09-23 Chicago 12 → 17:00Z",
  noonCdt.toISOString() === "2026-09-23T17:00:00.000Z",
  `got ${noonCdt.toISOString()}`,
);
const noonCst = zonedDateAtHour("2026-11-02", TZ, 12);
check(
  "2026-11-02 Chicago 12 → 18:00Z (CST)",
  noonCst.toISOString() === "2026-11-02T18:00:00.000Z",
  `got ${noonCst.toISOString()}`,
);
const savedAsToday = classifyTaskDue(
  noonCdt,
  new Date("2026-09-23T13:00:00.000Z"),
  TZ,
);
check(
  "tarea a mediodía local con now=13:00Z → today",
  savedAsToday === "today",
  `got ${savedAsToday}`,
);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
