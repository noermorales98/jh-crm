/**
 *   npx tsx scripts/smoke/digest-hour.ts
 */
import { digestDedupeKey, isDigestHour } from "../../src/lib/digest-hour";

const chicagoEight = new Date("2026-09-01T13:00:00.000Z");
if (!isDigestHour(chicagoEight, "America/Chicago", 8)) {
  throw new Error("esperaba true a las 8 Chicago");
}
if (isDigestHour(chicagoEight, "America/Chicago", 9)) {
  throw new Error("no debe coincidir hora 9");
}
const key = digestDedupeKey("org1", "user1", chicagoEight, "America/Chicago");
if (key !== "digest:org1:user1:2026-09-01") {
  throw new Error(`dedupe inesperado: ${key}`);
}
console.log("ok");
