/**
 * Lectura práctica del Análisis de Crédito (estilo Fondify) con el caso real
 * comparado: 4 tarjetas abiertas, límite 5 100, utilización 556 / 5 100.
 * npx tsx scripts/smoke/credit-practical.ts
 */
import {
  averageAgeMonths,
  classifyNegative,
  inquiriesInWindow,
  practicalCards,
  practicalNegatives,
  totalUtilizationBps,
  type PracticalItem,
} from "../../src/lib/credit/practical";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

let seq = 0;
function item(partial: Partial<PracticalItem>): PracticalItem {
  seq += 1;
  return {
    id: `i${seq}`,
    creditorName: "X",
    accountNumberMasked: null,
    accountType: null,
    bureau: "EXPERIAN",
    balance: null,
    creditLimit: null,
    dateOpened: null,
    dateReported: null,
    accountStatus: null,
    paymentStatus: null,
    openClosedStatus: null,
    remarks: null,
    ownershipType: null,
    isNegative: false,
    negativeType: null,
    ...partial,
  };
}

const asOf = new Date("2026-09-03T00:00:00.000Z");
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const bureaus = ["EXPERIAN", "EQUIFAX", "TRANSUNION"] as const;

const items: PracticalItem[] = [
  // Tilt: Equifax/TransUnion con un número de cuenta y Experian con otro (713P / EK).
  ...(["EQUIFAX", "TRANSUNION"] as const).map((bureau) =>
    item({ creditorName: "Tilt/webbank", accountNumberMasked: "xxxxxx 713P", bureau, balance: 331, creditLimit: 2000, openClosedStatus: "Open", paymentStatus: "Pays as Agreed", dateOpened: d("2026-02-01") }),
  ),
  item({ creditorName: "Tilt/webbank", accountNumberMasked: "xxxx EK", bureau: "EXPERIAN", balance: 331, creditLimit: 2000, openClosedStatus: "Open", paymentStatus: "Pays as Agreed", dateOpened: d("2026-02-01") }),
  ...bureaus.map((bureau) =>
    item({ creditorName: "First Premier", bureau, balance: 112, creditLimit: 600, openClosedStatus: "Open", paymentStatus: "Pays as Agreed", dateOpened: d("2025-11-01") }),
  ),
  ...bureaus.map((bureau) =>
    item({ creditorName: "Credit One Bank", accountNumberMasked: "****8382", bureau, balance: 113, creditLimit: 500, openClosedStatus: "Open", paymentStatus: "Pays as Agreed", dateOpened: d("2026-01-01") }),
  ),
  item({ creditorName: "Tbom Ccimc", balance: 0, creditLimit: 2000, accountType: "Revolving", paymentStatus: "Pays as Agreed", dateOpened: d("2026-07-01") }),
  // Discover cerrada con 120 días de atraso: no es tarjeta abierta.
  ...bureaus.map((bureau) =>
    item({ creditorName: "Discover Card", accountNumberMasked: "****3433", bureau, balance: 844, creditLimit: 500, accountStatus: "Closed", paymentStatus: "Over 120 Days Past Due", isNegative: true, negativeType: "COLLECTION", dateOpened: d("2021-07-01"), dateReported: d("2026-08-01") }),
  ),
  // La IA la marcó charge-off pero el estado dice al día.
  item({ creditorName: "DISCOVER CARD", accountStatus: "Pays as Agreed", paymentStatus: "Pays as Agreed", isNegative: true, negativeType: "CHARGE_OFF", dateOpened: d("2022-03-01") }),
  item({ creditorName: "PORTFOLIO RECOVERY A", accountStatus: "Collection Account", balance: 2149, isNegative: true, negativeType: "COLLECTION" }),
  // Atraso viejo: último reporte hace más de 3 años.
  item({ creditorName: "Jpmcb Card", bureau: "EQUIFAX", accountStatus: "Closed", paymentStatus: "30 Days Late", isNegative: true, negativeType: "LATE_PAYMENT", dateOpened: d("2016-10-01"), dateReported: d("2022-03-01") }),
  // Cerradas al día: cuentan para la edad promedio.
  ...bureaus.map((bureau) =>
    item({ creditorName: "Famsa Inc", bureau, accountStatus: "Closed", paymentStatus: "Pays as Agreed", dateOpened: d("2015-11-01") }),
  ),
];

function main() {
  console.log("credit-practical");
  const cards = practicalCards(items);
  const limit = cards.reduce((sum, c) => sum + c.limit, 0);
  const balance = cards.reduce((sum, c) => sum + c.balance, 0);
  check("4 tarjetas abiertas (Tilt una sola vez, Discover cerrada fuera)", cards.length === 4, cards.map((c) => c.creditorName));
  check("límite total 5 100 y saldo 556", limit === 5100 && balance === 556, { limit, balance });
  check("utilización total 10.9% (saldo/límite)", totalUtilizationBps(cards) === 1090, totalUtilizationBps(cards));
  check("Tilt aparece en los 3 burós", cards.find((c) => c.creditorName === "Tilt/webbank")?.bureaus.length === 3);

  check("cerrada, con saldo y 120+ días de atraso = charge-off", classifyNegative(items.find((i) => i.creditorName === "Discover Card")!) === "CHARGE_OFF");
  check("'Pays as Agreed' marcada charge-off = no negativa", classifyNegative(items.find((i) => i.creditorName === "DISCOVER CARD")!) === null);
  check("cuenta en cobranza = colección", classifyNegative(items.find((i) => i.creditorName === "PORTFOLIO RECOVERY A")!) === "COLLECTION");

  const negatives = practicalNegatives(items, asOf);
  const old = negatives.find((n) => n.item.creditorName === "Jpmcb Card");
  check("atraso con más de 3 años no bloquea", old?.old === true, old);
  check("charge-off reciente sí bloquea", negatives.filter((n) => n.item.creditorName === "Discover Card").every((n) => !n.old));

  const equifaxAge = averageAgeMonths(items.filter((i) => i.bureau === "EQUIFAX"), asOf);
  check("edad promedio incluye cerradas (más de 2.5 años en Equifax)", equifaxAge != null && equifaxAge > 30, equifaxAge);

  const window = inquiriesInWindow(
    [{ inquiryDate: d("2026-07-15") }, { inquiryDate: d("2025-12-01") }, { inquiryDate: null }],
    asOf,
  );
  check("consultas: solo últimos 6 meses y sin fecha aparte", window.counted === 1 && window.undated === 1, window);
  console.log("\nOK credit-practical\n");
}

main();
