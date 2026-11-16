/**
 * Fuentes de las reglas de crédito: cada cifra del cálculo sale de `sources.ts`
 * con su fuente y su fecha. npx tsx scripts/smoke/credit-sources.ts
 */
import { readFileSync } from "node:fs";
import {
  BANKRUPTCY_YEARS,
  BUSINESS_LINE_TIERS,
  NEGATIVE_YEARS,
  PERSONAL_LOAN_APR_BY_SCORE,
  SOURCES,
  SOURCES_VERIFIED_AT,
  sourceTag,
} from "../../src/lib/credit/sources";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

console.log("credit-sources");
const all = Object.values(SOURCES);
check("toda fuente tiene fecha de verificación", all.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.verifiedAt)));
check("toda fuente que no es criterio propio trae enlace https", all.filter((x) => x.kind !== "PRUDENT").every((x) => x.url?.startsWith("https://")), all.filter((x) => x.kind !== "PRUDENT" && !x.url?.startsWith("https://")));
check("los criterios propios se etiquetan como tales y no llevan enlace", all.filter((x) => x.kind === "PRUDENT").every((x) => x.url == null || x.id === "INQUIRIES_6M"));
check("las cifras de mercado caducan: verificadas hace menos de 6 meses", all.filter((x) => x.kind === "MARKET").every((x) => Date.now() - Date.parse(x.verifiedAt) < 183 * 86_400_000), SOURCES_VERIFIED_AT);
check("quiebras 10 años y el resto 7 (15 U.S.C. §1681c)", BANKRUPTCY_YEARS === 10 && NEGATIVE_YEARS === 7);
check("tasas del préstamo personal bajan al subir el puntaje", PERSONAL_LOAN_APR_BY_SCORE.every((row, i, rows) => i === 0 || row.apr > rows[i - 1]!.apr));
check("niveles de línea: el estándar pide más que el accesible", BUSINESS_LINE_TIERS[1]!.minScore > BUSINESS_LINE_TIERS[0]!.minScore && BUSINESS_LINE_TIERS[1]!.minMonthlyRevenue > BUSINESS_LINE_TIERS[0]!.minMonthlyRevenue);
check("la etiqueta que se muestra lleva el tipo y la fecha", /mercado, verificado \d{4}-\d{2}-\d{2}/.test(sourceTag("PERSONAL_LOAN_APR")));

// Los umbrales del cálculo no se escriben a mano: se leen de `sources.ts`.
const calc = readFileSync("src/lib/credit/funding-calc.ts", "utf8");
check("funding-calc no trae la tasa 26 % ni el 680 de la SBA escritos a mano", !/apr:\s*0\.26|SBA_MIN_SCORE\s*=\s*680|BUSINESS_LINE_MIN_SCORE|BUSINESS_LINE_MIN_REVENUE/.test(calc));
check("funding-calc ya no calcula un monto de línea con un porcentaje propio", !/annual \* 0\.1/.test(calc));
console.log("\nOK credit-sources\n");
