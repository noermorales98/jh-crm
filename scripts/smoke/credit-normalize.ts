/**
 * Normalización de observaciones: familia, responsabilidad, locale y alias.
 *
 *   npm run smoke:credit-normalize
 *
 * Sin red y sin DATABASE_URL.
 */
import { adaptLegacyCreditItem } from "../../src/lib/credit/contracts";
import {
  CREDITOR_ALIAS_VERSION,
  DEFAULT_CREDITOR_ALIASES,
  NORMALIZER_VERSION,
  normalizeCreditObservation,
} from "../../src/lib/credit/normalize";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function main() {
  console.log("\n[credit-normalize] observaciones");

  const mortgage = normalizeCreditObservation({
    rawItemId: "item-mortgage",
    reportId: "rep-1",
    accountType: "Mortgage",
    balance: "50000.00",
    locale: "en-US",
  });
  check("hipoteca con saldo no es revolving", mortgage.family.value === "MORTGAGE");
  check("la familia de hipoteca queda inferida", mortgage.family.quality === "INFERRED");
  check("el saldo de la hipoteca no se pierde", mortgage.balance.value?.cents === 5_000_000);

  const balanceOnly = normalizeCreditObservation({
    rawItemId: "item-balance",
    reportId: "rep-1",
    balance: "80.00",
    locale: "en-US",
  });
  check("saldo sin tipo no inventa revolving", balanceOnly.family.value === "UNKNOWN" && balanceOnly.family.quality === "MISSING");

  const absent = normalizeCreditObservation({
    rawItemId: "item-null",
    reportId: "rep-1",
    balance: null,
    creditLimit: "0.00",
    locale: "en-US",
  });
  check("null no es cero", absent.balance.quality === "MISSING" && absent.balance.value == null);
  check("cero de límite es conocido", absent.creditLimit.quality === "KNOWN" && absent.creditLimit.value?.cents === 0);

  const authorized = normalizeCreditObservation({
    rawItemId: "item-au",
    reportId: "rep-1",
    responsibility: "Authorized User",
  });
  check("AU queda inferido", authorized.ownership.value === "AUTHORIZED_USER" && authorized.ownership.quality === "INFERRED");
  check("AU pide confirmación", authorized.warnings.includes("OWNERSHIP_REQUIRES_CONFIRMATION"));
  check("AU no se confirma", authorized.ownership.review === "PROPOSED" && authorized.review === "PROPOSED");

  const individual = normalizeCreditObservation({
    rawItemId: "item-own",
    reportId: "rep-1",
    responsibility: "Individual",
  });
  check("individual explícito es conocido", individual.ownership.value === "INDIVIDUAL" && individual.ownership.quality === "KNOWN");

  const missingOwner = normalizeCreditObservation({
    rawItemId: "item-no-owner",
    reportId: "rep-1",
  });
  check("sin responsabilidad no se inventa", missingOwner.ownership.value === "UNKNOWN" && missingOwner.ownership.quality === "MISSING");

  const en = normalizeCreditObservation({
    rawItemId: "item-en",
    reportId: "rep-1",
    balance: "$1,234.56",
    locale: "en-US",
  });
  check("en-US son 123456 centavos", en.balance.quality === "KNOWN" && en.balance.value?.cents === 123456);
  check("el locale no inventa USD", en.balance.value?.currency == null);
  check("el raw del importe se conserva", en.raw.balance === "$1,234.56");

  const es = normalizeCreditObservation({
    rawItemId: "item-es",
    reportId: "rep-1",
    balance: "1.234,56",
    locale: "es-ES",
  });
  check("es-ES son 123456 centavos", es.balance.quality === "KNOWN" && es.balance.value?.cents === 123456);

  const crossed = normalizeCreditObservation({
    rawItemId: "item-cross",
    reportId: "rep-1",
    balance: "1.234,56",
    locale: "en-US",
  });
  check("coma decimal no se lee como en-US", crossed.balance.quality === "INVALID");

  const crossedBack = normalizeCreditObservation({
    rawItemId: "item-cross-2",
    reportId: "rep-1",
    balance: "$1,234.56",
    locale: "es-ES",
  });
  check("miles en-US no se leen como es-ES", crossedBack.balance.quality === "INVALID");

  const noLocale = normalizeCreditObservation({
    rawItemId: "item-nolocale",
    reportId: "rep-1",
    balance: "$1,234.56",
  });
  check("sin locale no se adivina el grupo", noLocale.balance.quality === "INVALID");

  const negative = normalizeCreditObservation({
    rawItemId: "item-neg",
    reportId: "rep-1",
    balance: "-10.25",
    locale: "en-US",
  });
  check("saldo negativo se conserva", negative.balance.value?.cents === -1025);
  check("saldo negativo se advierte", negative.warnings.includes("NEGATIVE_BALANCE_KEPT"));

  const high = normalizeCreditObservation({
    rawItemId: "item-high",
    reportId: "rep-1",
    highBalance: "9000.00",
    locale: "en-US",
  });
  check("high balance no rellena el límite", high.creditLimit.quality === "MISSING" && high.creditLimit.value == null);
  check("high balance no rellena la apertura", high.dateOpened.quality === "MISSING" && high.dateOpened.value == null);
  check("high balance avisa límite y fecha", high.warnings.includes("HIGH_BALANCE_IS_NOT_LIMIT") && high.warnings.includes("HIGH_BALANCE_IS_NOT_OPENED_DATE"));

  const month = normalizeCreditObservation({
    rawItemId: "item-month",
    reportId: "rep-1",
    dateOpened: "06/2020",
    locale: "en-US",
  });
  check("06/2020 es mes", month.dateOpened.value?.precision === "MONTH" && month.dateOpened.value.month === 6 && month.dateOpened.value.year === 2020);
  check("06/2020 no inventa día", month.dateOpened.value?.day == null);
  check("el raw de la fecha se conserva", month.raw.dateOpened === "06/2020");

  const aliases = [{ from: "Trial Bank NA", to: "Trial Bank" }];
  const cardA = normalizeCreditObservation({
    rawItemId: "card-a",
    reportId: "rep-1",
    creditorName: "Trial Bank NA",
    aliases,
  });
  const cardB = normalizeCreditObservation({
    rawItemId: "card-b",
    reportId: "rep-1",
    creditorName: "Trial Bank",
    aliases,
  });
  check("el alias no fusiona las tarjetas", cardA.rawItemId !== cardB.rawItemId);
  check("el alias comparte la clave", cardA.creditor.normalized === "TRIAL BANK" && cardB.creditor.normalized === "TRIAL BANK");
  check("el nombre crudo de la primera tarjeta sigue", cardA.raw.creditorName === "Trial Bank NA");

  const untouched = normalizeCreditObservation({
    rawItemId: "card-c",
    reportId: "rep-1",
    creditorName: "Other Bank",
    aliases: DEFAULT_CREDITOR_ALIASES,
  });
  const other = normalizeCreditObservation({
    rawItemId: "card-d",
    reportId: "rep-1",
    creditorName: "Second Bank",
  });
  check("sin alias no se mezclan bancos", untouched.creditor.normalized !== other.creditor.normalized);
  check("el catálogo por defecto está vacío", DEFAULT_CREDITOR_ALIASES.length === 0);
  check("la versión del normalizador está fija", cardA.normalizerVersion === NORMALIZER_VERSION && cardA.aliasVersion === CREDITOR_ALIAS_VERSION);

  const collector = normalizeCreditObservation({
    rawItemId: "item-collector",
    reportId: "rep-1",
    creditorName: "North Collection Agency",
    accountType: "Collection",
  });
  check("el cobrador sale del texto", collector.creditor.role === "COLLECTOR" && collector.creditor.roleQuality === "KNOWN");

  const issuerUnknown = normalizeCreditObservation({
    rawItemId: "item-issuer",
    reportId: "rep-1",
    creditorName: "Trial Bank",
    accountType: "Collection",
  });
  check("cobranza no convierte al acreedor en cobrador", issuerUnknown.creditor.role === "UNKNOWN");

  const legacy = adaptLegacyCreditItem({
    reportId: "rep-1",
    accountType: "Credit Card",
    balance: "8.00",
  });
  check("el adaptador sigue infiriendo credit card", legacy.family.value === "REVOLVING" && legacy.family.quality === "INFERRED");
  check("el adaptador no inventa responsabilidad", legacy.ownership.value === "UNKNOWN" && legacy.ownership.quality === "MISSING");

  console.log("\nOK credit-normalize\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
