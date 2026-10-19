/**
 * Contratos de crédito: ausencia, cero, centavos, fecha parcial y scores.
 *
 *   npm run smoke:credit-contracts
 *
 * Sin red y sin DATABASE_URL.
 */
import {
  adaptLegacyCreditItem,
  legacyItemHasInvalidMoney,
  parseMoney,
  parsePartialDate,
  percentToBps,
  sameCurrency,
  scoresComparable,
} from "../../src/lib/credit/contracts";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function main() {
  console.log("\n[credit-contracts] calidad y precisión");

  const zero = parseMoney("0.00", "rep-1");
  check("cero conocido", zero.quality === "KNOWN" && zero.value?.cents === 0);
  check("cero no trae moneda USD", zero.value?.currency == null);

  const absent = parseMoney(null, "rep-1");
  check("null es MISSING", absent.quality === "MISSING" && absent.value == null);
  check("null no es 0", absent.value?.cents !== 0);

  const empty = parseMoney("", "rep-1");
  check("vacío es MISSING", empty.quality === "MISSING");

  const dollars = parseMoney("10.25", "rep-1");
  check("10.25 = 1025 centavos", dollars.quality === "KNOWN" && dollars.value?.cents === 1025);

  const negative = parseMoney("-8.10", "rep-1");
  check("saldo a favor conservado", negative.value?.cents === -810);

  const extra = parseMoney("10.255", "rep-1");
  check("más de 2 decimales es INVALID", extra.quality === "INVALID" && extra.value == null);

  const locale = parseMoney("1.234,56", "rep-1");
  check("locale ambiguo es INVALID", locale.quality === "INVALID");
  const usThousands = parseMoney("1,234.56", "rep-1");
  check("miles con coma es INVALID sin locale", usThousands.quality === "INVALID");

  const usd = parseMoney("10.25", "rep-1", "USD");
  const mxn = parseMoney("10.25", "rep-1", "MXN");
  check("USD y MXN no se mezclan", !sameCurrency(usd.value?.currency ?? null, mxn.value?.currency ?? null));
  check("sin moneda no se asume USD", !sameCurrency(dollars.value?.currency ?? null, "USD"));

  const ten = percentToBps("10", "rep-1");
  check("10% = 1000 bps", ten.quality === "KNOWN" && ten.value === 1000);
  const zeroPct = percentToBps(0, "rep-1");
  check("0% es conocido", zeroPct.quality === "KNOWN" && zeroPct.value === 0);
  const missingPct = percentToBps(null, "rep-1");
  check("porcentaje null es MISSING", missingPct.quality === "MISSING");
  check("101% es INVALID", percentToBps("101", "rep-1").quality === "INVALID");

  const year = parsePartialDate("2020", "rep-1");
  check(
    "año no inventa día 1",
    year.quality === "KNOWN" &&
      year.value?.precision === "YEAR" &&
      year.value.month == null &&
      year.value.day == null,
  );
  const month = parsePartialDate("2020-03", "rep-1");
  check(
    "mes no inventa día",
    month.value?.precision === "MONTH" && month.value.day == null,
  );
  check("2020-02-31 es INVALID", parsePartialDate("2020-02-31", "rep-1").quality === "INVALID");
  check("fecha null es MISSING", parsePartialDate(null, "rep-1").quality === "MISSING");

  const noFamily = scoresComparable(
    { bureau: "EXPERIAN", family: null, version: "8", variant: "classic" },
    { bureau: "EXPERIAN", family: "FICO", version: "8", variant: "classic" },
  );
  check("sin familia no es comparable", !noFamily.comparable && noFamily.reason === "MISSING_IDENTITY");
  const different = scoresComparable(
    { bureau: "EXPERIAN", family: "FICO", version: "8", variant: "classic" },
    { bureau: "EXPERIAN", family: "VANTAGE", version: "3", variant: "classic" },
  );
  check("familias distintas no se restan", !different.comparable && different.reason === "DIFFERENT_IDENTITY");
  const same = scoresComparable(
    { bureau: "EXPERIAN", family: "FICO", version: "8", variant: "classic" },
    { bureau: "experian", family: "fico", version: "8", variant: "classic" },
  );
  check("misma identidad es comparable", same.comparable);

  const adapted = adaptLegacyCreditItem({
    reportId: "rep-1",
    accountType: null,
    balance: null,
    creditLimit: "0",
    monthlyPayment: "1.234,56",
    dateOpened: "2019",
  });
  check("revisión legacy es PROPOSED", adapted.review === "PROPOSED");
  check("límite 0 conocido", adapted.creditLimit.quality === "KNOWN" && adapted.creditLimit.value?.cents === 0);
  check("saldo ausente no es 0", adapted.balance.quality === "MISSING" && adapted.balance.value == null);
  check("pago ambiguo inválido", adapted.monthlyPayment.quality === "INVALID");
  check("familia ausente es UNKNOWN", adapted.family.value === "UNKNOWN" && adapted.family.quality === "MISSING");
  check("responsabilidad no se inventa", adapted.ownership.value === "UNKNOWN" && adapted.ownership.quality === "MISSING");
  check("apertura parcial conserva el año", adapted.dateOpened.value?.precision === "YEAR" && adapted.dateOpened.value.day == null);
  check(
    "detector de importe inválido",
    legacyItemHasInvalidMoney({ reportId: "rep-1", monthlyPayment: "1.234,56" }),
  );
  check(
    "cero y null no disparan inválido",
    !legacyItemHasInvalidMoney({ reportId: "rep-1", balance: null, creditLimit: 0, monthlyPayment: "12.50" }),
  );

  const revolving = adaptLegacyCreditItem({
    reportId: "rep-1",
    accountType: "Credit Card",
    balance: "8.00",
  });
  check("credit card se infiere, no se certifica", revolving.family.value === "REVOLVING" && revolving.family.quality === "INFERRED");

  console.log("\nOK credit-contracts\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
