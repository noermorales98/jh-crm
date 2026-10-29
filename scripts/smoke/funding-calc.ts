/**
 * Calculadora de fondeo con el caso real (reporte del 3 sep 2026).
 * npx tsx scripts/smoke/funding-calc.ts
 */
import { readFileSync } from "node:fs";
import {
  EMPTY_FUNDING_PROFILE,
  computeFunding,
  parseFundingProfile,
  referenceScore,
  type FundingCreditFacts,
} from "../../src/lib/credit/funding-calc";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

const agustin: FundingCreditFacts = {
  scores: [648, 718, 721],
  blockingNegatives: 6,
  utilizationBps: 1090,
  inquiries6m: 3,
  reportMonthlyDebt: 85,
};

function main() {
  console.log("funding-calc");
  check("puntaje de referencia = el del medio (718)", referenceScore(agustin.scores) === 718);
  check("dos puntajes = promedio", referenceScore([640, 700, null]) === 670);

  const empty = computeFunding(agustin, EMPTY_FUNDING_PROFILE);
  check("sin ingreso: faltan datos y lo pide", empty.status !== "READY" && empty.todo.some((t) => t.includes("ingreso")), empty.todo);
  check("con 6 negativas pide limpiarlas primero", empty.todo[0]?.includes("6 cuentas negativas") === true, empty.todo);
  check("sin ingreso no inventa monto", empty.best === null && empty.bestPotential === null);

  const withIncome = computeFunding(agustin, { ...EMPTY_FUNDING_PROFILE, monthlyIncome: 4000 });
  check("con negativas no califica hoy", withIncome.status === "NOT_YET" && withIncome.best === null);
  const potential = withIncome.bestPotential;
  check("potencial tras reparar: tope por ingreso (≤ 16,000 – 24,000)", potential?.low === 16000 && potential?.high === 24000, potential);

  const clean = computeFunding({ ...agustin, blockingNegatives: 0 }, { ...EMPTY_FUNDING_PROFILE, monthlyIncome: 4000 });
  check("limpio y con ingreso: listo y con rango hoy", clean.status === "READY" && clean.best?.product === "PERSONAL_LOAN", clean);

  const tight = computeFunding({ ...agustin, blockingNegatives: 0, reportMonthlyDebt: 1700 }, { ...EMPTY_FUNDING_PROFILE, monthlyIncome: 4000 });
  check("deudas ≥ 40% del ingreso: no da monto", tight.best === null && tight.todo.some((t) => t.includes("pagos mensuales")), tight.todo);

  const biz = computeFunding(
    { ...agustin, blockingNegatives: 0 },
    { hasBusiness: true, monthlyIncome: 4000, monthlyRevenue: 20000, timeInBusiness: "1TO2Y", monthlyDebtOverride: null },
  );
  const line = biz.products.find((p) => p.id === "BUSINESS_LINE");
  check("línea de negocio: 10–15% de ventas anuales (24,000 – 36,000)", line?.range?.low === 24000 && line.range.high === 36000, line);
  check("SBA sin monto y pide 2 años", biz.products.find((p) => p.id === "SBA_7A")?.range === null && biz.products.find((p) => p.id === "SBA_7A")?.status === "NOT_YET");
  check("el mejor rango no suma productos", biz.best?.high === 36000, biz.best);

  check("perfil guardado se lee sin confiar en su forma", parseFundingProfile({ monthlyIncome: "x", timeInBusiness: "99Y", hasBusiness: 1 }).monthlyIncome === null);

  const panel = readFileSync("src/components/clients/client-funding-panel.tsx", "utf8");
  check(
    "el panel no promete: dice estimado y no aprobación",
    panel.includes("FUNDING_DISCLAIMER") && panel.includes("no una aprobación") && !/Aprobado|Elegible|garantizado/.test(panel),
  );
  console.log("\nOK funding-calc\n");
}

main();
