/**
 * Revisión de cuentas negativas con el caso real (reporte del 3 sep 2026):
 * una tarjeta por deuda, motivos sugeridos y texto de carta.
 * npx tsx scripts/smoke/credit-negative-review.ts
 */
import { disputeTextFor, groupNegativeDebts } from "../../src/lib/credit/negative-review";
import type { PracticalItem } from "../../src/lib/credit/practical";

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
    bureau: "EQUIFAX",
    balance: null,
    creditLimit: null,
    dateOpened: null,
    dateReported: null,
    accountStatus: null,
    paymentStatus: null,
    openClosedStatus: null,
    remarks: null,
    ownershipType: null,
    isNegative: true,
    negativeType: null,
    ...partial,
  };
}

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const asOf = d("2026-09-03");

const items: PracticalItem[] = [
  // Discover ****3433: Equifax la reporta en cobranza, Experian cerrada con 120 días.
  item({ creditorName: "Discover Card", accountNumberMasked: "xxxxxxxx 3433", bureau: "EQUIFAX", balance: 844, creditLimit: 500, accountStatus: "Collection Account", dateOpened: d("2021-07-01") }),
  item({ creditorName: "Discover Card", accountNumberMasked: "xxxxxxxx 3433", bureau: "EXPERIAN", balance: 844, creditLimit: 500, accountStatus: "Closed", paymentStatus: "Over 120 Days Past Due", dateOpened: d("2021-07-01") }),
  item({ creditorName: "Discover Card", accountNumberMasked: "xxxxxxxx 3433", bureau: "TRANSUNION", balance: 844, creditLimit: 500, accountStatus: "Collection Account", dateOpened: d("2021-07-01") }),
  // Portfolio Recovery (cobranza) y Synchrony (acreedor original) con la misma cuenta ****7457.
  item({ creditorName: "Portfolio Recovery A", accountNumberMasked: "xxxxxxxxxxxxxxxx 7457", balance: 483, accountStatus: "Collection Account", dateOpened: d("2020-10-01") }),
  item({ creditorName: "Synchrony Bank", accountNumberMasked: "xxxxxxxx7457", bureau: "EXPERIAN", balance: 483, accountStatus: "Charged Off", dateOpened: d("2016-03-01") }),
  // Antigua (abierta en 2016) y sin número.
  item({ creditorName: "Jpmcb Card Services", bureau: "EQUIFAX", balance: 1000, accountStatus: "Collection Account", dateOpened: d("2016-10-01") }),
  // Positiva: no entra.
  item({ creditorName: "Credit One Bank", accountNumberMasked: "****8382", balance: 113, creditLimit: 500, accountStatus: "Pays as Agreed", isNegative: false }),
];

function main() {
  console.log("credit-negative-review");
  const debts = groupNegativeDebts(items, asOf);
  const discover = debts.find((x) => x.creditorName === "Discover Card");
  check("Discover ****3433 es una sola deuda con 3 burós", discover?.rows.length === 3 && discover.last4 === "3433", discover);
  check("cuenta positiva no aparece", !debts.some((x) => x.creditorName === "Credit One Bank"));
  check(
    "Discover: diferencias de estado entre burós",
    discover?.reasons.some((r) => r.code === "INCONSISTENT" && r.detail.includes("estado")) === true,
    discover?.reasons,
  );
  check(
    "Discover: la tabla marca 'Estado de la cuenta' y no cuenta datos ausentes",
    discover?.fields.find((f) => f.label === "Estado de la cuenta")?.differs === true &&
      discover?.fields.find((f) => f.label === "Estado de pago")?.differs === false,
    discover?.fields,
  );
  check(
    "Discover: saldo mayor al límite",
    discover?.reasons.some((r) => r.code === "INCOMPLETE" && r.detail.includes("saldo mayor al límite")) === true,
  );
  const pra = debts.find((x) => x.creditorName === "Portfolio Recovery A");
  check("cobranza y acreedor original con ****7457 = posible duplicado", pra?.reasons.some((r) => r.code === "DUPLICATE") === true, pra?.reasons);
  const jpm = debts.find((x) => x.creditorName === "Jpmcb Card Services");
  check("abierta hace más de 7 años = revisar antigüedad", jpm?.reasons.some((r) => r.code === "OBSOLETE") === true, jpm?.reasons);
  check("sin número de cuenta = datos incompletos", jpm?.reasons.some((r) => r.code === "INCOMPLETE") === true);

  const text = disputeTextFor({ reasons: ["INCONSISTENT", "INCOMPLETE"], answer: "NOT_MINE", clientWords: "Nunca abrí esta cuenta" });
  check("motivo de carta en inglés y de máximo 200", text.reason.startsWith("I do not recognize this account.") && text.reason.length <= 200, text.reason);
  check("detalle incluye palabras del cliente", text.details.includes("Consumer statement: Nunca abrí esta cuenta"));
  check("sin motivos usa verificación FCRA 611", disputeTextFor({ reasons: [], answer: null, clientWords: null }).reason.includes("section 611"));
  console.log("\nOK credit-negative-review\n");
}

main();
