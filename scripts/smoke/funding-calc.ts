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
  check("línea de negocio: cumple el nivel accesible pero no inventa un monto", line?.status === "READY" && line.range === null && line.potential === null, line);
  check("la línea dice de dónde salen los requisitos y la fecha", /verificado 2026-11-15/.test(line?.note ?? "") && /nivel estándar/.test(line?.note ?? ""), line?.note);
  const bizWeak = computeFunding({ ...agustin, blockingNegatives: 0, scores: [570, 580, 590] }, { hasBusiness: true, monthlyIncome: null, monthlyRevenue: 2000, timeInBusiness: "LT6M", monthlyDebtOverride: null });
  const weakLine = bizWeak.products.find((p) => p.id === "BUSINESS_LINE");
  check("línea: 600 de puntaje, 6 meses y 2,500 al mes son el piso publicado", weakLine?.status === "NOT_YET" && weakLine.checks.filter((c) => c.state === "FAIL").length === 3, weakLine?.checks);
  const bizFloor = computeFunding({ ...agustin, blockingNegatives: 0, scores: [600, 600, 600] }, { hasBusiness: true, monthlyIncome: null, monthlyRevenue: 2500, timeInBusiness: "6TO12M", monthlyDebtOverride: null });
  check("línea: justo en el piso publicado cumple", bizFloor.products.find((p) => p.id === "BUSINESS_LINE")?.status === "READY");
  const bizStandard = computeFunding({ ...agustin, blockingNegatives: 0, scores: [630, 630, 630] }, { hasBusiness: true, monthlyIncome: null, monthlyRevenue: 10000, timeInBusiness: "1TO2Y", monthlyDebtOverride: null });
  check("línea: 625, 12 meses y 10,000 al mes cumplen también el nivel estándar", /También cumple el nivel estándar/.test(bizStandard.products.find((p) => p.id === "BUSINESS_LINE")?.note ?? ""));
  const sbaProduct = biz.products.find((p) => p.id === "SBA_7A");
  check("SBA sin monto y pide 2 años", sbaProduct?.range === null && sbaProduct?.status === "NOT_YET");
  check("SBA no fija un puntaje: lo decide el banco (nota con fuente y fecha)", /ya no fija un puntaje/.test(sbaProduct?.note ?? "") && /verificado 2026-11-15/.test(sbaProduct?.note ?? ""), sbaProduct?.note);
  const sba680 = computeFunding({ ...agustin, blockingNegatives: 0, scores: [655, 655, 655] }, { hasBusiness: true, monthlyIncome: 4000, monthlyRevenue: 20000, timeInBusiness: "2Y_PLUS", monthlyDebtOverride: null });
  check("SBA: 655 ya no se rechaza por el 680 anterior", sba680.products.find((p) => p.id === "SBA_7A")?.status === "READY");
  check("el mejor rango es el del préstamo personal (la línea no tiene monto)", biz.best?.product === "PERSONAL_LOAN" && biz.best.high === 24000, biz.best);
  check("el resultado lleva la versión del cálculo con fecha", /^fc02-2026-11-15$/.test(biz.version), biz.version);

  // Línea de negocio lista pero sin ingreso personal: no hay monto y el panel no debe decir "no califica".
  const lineOnly = computeFunding({ ...agustin, blockingNegatives: 0, scores: [700, 700, 700] }, { hasBusiness: true, monthlyIncome: null, monthlyRevenue: 5000, timeInBusiness: "1TO2Y", monthlyDebtOverride: null });
  check("línea lista sin ingreso: estado READY y sin monto", lineOnly.status === "READY" && lineOnly.best === null && lineOnly.bestPotential === null, lineOnly);
  const panelSrc = readFileSync("src/components/clients/client-funding-panel.tsx", "utf8");
  check("el panel no dice «no califica» cuando el estado es READY sin monto", /result\.status === "READY"\s*\?\s*\n?\s*"Cumple los requisitos publicados/.test(panelSrc) && /else if \(result\.status === "READY"\)/.test(panelSrc));
  // Tasa por puntaje (Experian/Curinos nov 2026): el rango sube cuando baja la tasa.
  const at = (score: number) => computeFunding({ ...agustin, blockingNegatives: 0, scores: [score, score, score], reportMonthlyDebt: 0 }, { ...EMPTY_FUNDING_PROFILE, monthlyIncome: 20000 }).best;
  check("mismo ingreso: a 740 el rango alto no baja del de 640 (tasa 10.99% vs 17.58%)", (at(740)?.high ?? 0) >= (at(640)?.high ?? 1), [at(740), at(640)]);
  check("con 639 no hay préstamo personal (mínimo de referencia 640)", at(639) === null, at(639));
  check("perfil guardado se lee sin confiar en su forma", parseFundingProfile({ monthlyIncome: "x", timeInBusiness: "99Y", hasBusiness: 1 }).monthlyIncome === null);

  const panel = readFileSync("src/components/clients/client-funding-panel.tsx", "utf8");
  check(
    "el panel no promete: dice estimado y no aprobación",
    panel.includes("FUNDING_DISCLAIMER") && panel.includes("no una aprobación") && !/Aprobado|Elegible|garantizado/.test(panel),
  );
  console.log("\nOK funding-calc\n");
}

main();
