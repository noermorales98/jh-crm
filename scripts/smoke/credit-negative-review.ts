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

  // Caso real (PDF del 3 sep 2026): TransUnion enmascara otro número.
  const real: PracticalItem[] = [
    item({ creditorName: "Jpmcb Card Services", accountNumberMasked: "xxxxxxxx 9622", bureau: "EQUIFAX", balance: 0, creditLimit: 1000, accountStatus: "Collection Account", openClosedStatus: "Closed", dateOpened: d("2016-10-01"), dateReported: d("2026-07-01") }),
    item({ creditorName: "Jpmcb Card Services", accountNumberMasked: "xxxxxxxx 9622", bureau: "EXPERIAN", balance: 1118, creditLimit: 1000, accountStatus: "Over 120 Days Past Due", openClosedStatus: "Closed", dateOpened: d("2016-10-01"), dateReported: d("2023-03-01") }),
    item({ creditorName: "Jpmcb Card Services", accountNumberMasked: "xxxxxxxxxxxx 1456", bureau: "TRANSUNION", balance: 0, creditLimit: 1000, accountStatus: "Closed", remarks: "PAID CHARGE OFF", negativeType: "CHARGE_OFF", openClosedStatus: "Closed", dateOpened: d("2016-10-01"), dateReported: d("2023-02-01") }),
    item({ creditorName: "Jpmcb Card Services", accountNumberMasked: "xxxxxxxx 2338", bureau: "EQUIFAX", balance: 0, creditLimit: 700, accountStatus: "Collection Account", dateOpened: d("2017-05-01"), dateReported: d("2026-07-01") }),
    item({ creditorName: "Jpmcb Card Services", accountNumberMasked: "xxxxxxxx 2338", bureau: "EXPERIAN", balance: 0, creditLimit: 700, accountStatus: "Collection Account", dateOpened: d("2017-05-01"), dateReported: d("2023-02-01") }),
    item({ creditorName: "Merrick Bk", accountNumberMasked: "xxxxxxxxxxxx 8772", bureau: "TRANSUNION", balance: 1820, creditLimit: 1400, accountStatus: "Closed", remarks: "ACCOUNT CHARGED TO PROFIT AND LOSS", negativeType: "CHARGE_OFF" }),
    item({ creditorName: "Portfolio Recovery A", accountNumberMasked: "xxxxxxxxxxxxxxxx 6081", balance: 2149, accountStatus: "Collection Account", dateOpened: d("2021-10-01") }),
  ];
  const realDebts = groupNegativeDebts(real, asOf);
  const jpm9622 = realDebts.find((x) => x.last4 === "9622");
  check("JPMCB ****9622 junta la fila de TransUnion ****1456", jpm9622?.rows.length === 3, realDebts.map((x) => [x.creditorName, x.last4, x.rows.length]));
  check("JPMCB ****2338 queda aparte (otra apertura y límite)", realDebts.find((x) => x.last4 === "2338")?.rows.length === 2);
  check("4 deudas en el caso real", realDebts.length === 4, realDebts.length);
  const jpmDetail = jpm9622?.reasons.find((r) => r.code === "INCONSISTENT")?.detail ?? "";
  check("explica saldo en un buró y 0 en otros", jpmDetail.includes("Experian reporta saldo 1,118"), jpmDetail);
  check("detecta buró sin actualizar", jpmDetail.includes("no la actualiza desde"), jpmDetail);
  check(
    "número de cuenta distinto no cuenta como diferencia",
    jpm9622?.fields.find((f) => f.label === "Número de cuenta")?.differs === false,
  );
  check(
    "antigüedad pide la fecha de primera morosidad, no afirma que expiró",
    jpm9622?.reasons.find((r) => r.code === "OBSOLETE")?.detail.includes("primera morosidad") === true,
  );
  const merrick = realDebts.find((x) => x.creditorName === "Merrick Bk");
  check(
    "Merrick: saldo mayor al límite y sin apertura",
    merrick?.reasons.some((r) => r.code === "INCOMPLETE" && r.detail.includes("saldo mayor al límite") && r.detail.includes("sin fecha de apertura")) === true,
    merrick?.reasons,
  );
  check("cobranza sola sin pistas = solo verificación", realDebts.find((x) => x.last4 === "6081")?.reasons[0]?.code === "VERIFY");

  const text = disputeTextFor({ reasons: ["INCONSISTENT", "INCOMPLETE"], answer: "NOT_MINE", clientWords: "Nunca abrí esta cuenta" });
  check("motivo de carta en inglés y de máximo 200", text.reason.startsWith("I do not recognize this account.") && text.reason.length <= 200, text.reason);
  check("detalle incluye palabras del cliente", text.details.includes("Consumer statement: Nunca abrí esta cuenta"));
  check("sin motivos usa verificación FCRA 611", disputeTextFor({ reasons: [], answer: null, clientWords: null }).reason.includes("section 611"));
  console.log("\nOK credit-negative-review\n");
}

main();
