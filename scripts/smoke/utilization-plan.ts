/**
 * Score Plan (utilización) con las tarjetas reales del reporte del 3 sep 2026.
 * npx tsx scripts/smoke/utilization-plan.ts
 */
import { readFileSync } from "node:fs";
import {
  bandFor,
  closeCardImpact,
  payToTarget,
  scorePlanCopy,
  totals,
  type PlanCard,
} from "../../src/lib/credit/utilization-plan";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

const card = (creditorName: string, limit: number, balance: number): PlanCard => ({
  key: creditorName,
  creditorName,
  bureaus: ["EQUIFAX"],
  limit,
  balance,
  utilizationBps: Math.round((balance / limit) * 10000),
});

// Credit One 113/500, First Premier 114/600, Tilt 329/2000, Tbom 0/2000.
const cards = [card("Credit One Bank", 500, 113), card("First Premier", 600, 114), card("Tilt/Webbank", 2000, 329), card("Tbom Ccimc", 2000, 0)];

function main() {
  console.log("utilization-plan");
  const now = totals(cards);
  check("total 556 de 5,100 = 11%", now.balance === 556 && now.limit === 5100 && now.utilizationBps === 1090, now);
  check("11% es Aceptable, no Ideal", bandFor(now.utilizationBps) === "OK");
  check("bandas: 9% ideal, 30% alta, 50% muy alta, 0 sin uso", bandFor(900) === "IDEAL" && bandFor(3000) === "HIGH" && bandFor(5000) === "VERY_HIGH" && bandFor(0) === "NONE");

  const plan = payToTarget(cards, 9);
  check("orden: la de mayor % primero", plan.rows[0]?.creditorName === "Credit One Bank", plan.rows);
  check("Credit One paga 68 (113 → 45 = 9%)", plan.rows[0]?.payment === 68 && plan.rows[0]?.afterBps === 900, plan.rows[0]);
  check("todas quedan en ≤ 9% y el total también", plan.rows.every((r) => r.afterBps <= 900) && (plan.afterBps ?? 99999) <= 900, plan);
  check("Credit One 23% NO aparece como 'ya está bien'", !plan.alreadyIdeal.some((r) => r.creditorName === "Credit One Bank"));
  check("Tbom en 0% sí está bien", plan.alreadyIdeal.some((r) => r.creditorName === "Tbom Ccimc"));
  check("meta 29%: ya está en meta, no pide pagos", payToTarget(cards, 29).totalPayment === 0);

  const close = closeCardImpact(cards, "Tilt/Webbank");
  check("cerrar Tilt: 11% → 18% (el saldo sigue contando)", close?.afterBps === 1794, close);

  const copy = scorePlanCopy({ clientName: "Agustin Islas", cards, plan });
  check("el texto para el cliente trae pagos y no promete puntos", copy.includes("Credit One Bank: paga $68") && !/\bpts\b|puntos de score/i.test(copy) && copy.includes("no una garantía"), copy);

  const panel = readFileSync("src/components/clients/client-score-plan-panel.tsx", "utf8");
  check("el panel no muestra puntos ni beta", !/\bpts\b/.test(panel) && !/beta/i.test(panel));
  console.log("\nOK utilization-plan\n");
}

main();
