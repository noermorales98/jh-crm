/**
 * Utilización revolving sin duplicar cuentas.
 *
 *   npm run smoke:credit-revolving
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  OPEN_STATUS_LABEL,
  REVOLVING_VERSION,
  assignOpenClosed,
  buildRevolvingReading,
  openClosedForReading,
  utilizationBps,
  type RevolvingObservation,
} from "../../src/lib/credit/revolving";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function obs(partial: Partial<RevolvingObservation> & Pick<RevolvingObservation, "id" | "bureau">): RevolvingObservation {
  return {
    creditorName: "Visa",
    accountType: "revolving",
    responsibility: "individual",
    accountStatus: "Open",
    balanceCents: 800_000,
    limitCents: 1_000_000,
    currency: "USD",
    reportDate: "2024-06-01",
    canonicalId: null,
    identityStatus: "NONE",
    ...partial,
  };
}

function main() {
  console.log("\n[credit-revolving] cuentas únicas");

  const f01 = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: ["EXPERIAN", "EQUIFAX", "TRANSUNION"].map((bureau) =>
      obs({
        id: bureau,
        bureau,
        canonicalId: "visa-1",
        identityStatus: "CONFIRMED",
      }),
    ),
  });
  check(
    "F01 una Visa confirmada sigue en 10000 y 8000",
    f01.consolidated.individual.status === "KNOWN" &&
      f01.consolidated.individual.limitCents === 1_000_000 &&
      f01.consolidated.individual.balanceCents === 800_000 &&
      f01.consolidated.individual.valueBps === 8000 &&
      f01.consolidated.cards.length === 1,
    f01.consolidated.individual,
  );

  const unconfirmed = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: ["EXPERIAN", "EQUIFAX", "TRANSUNION"].map((bureau) => obs({ id: bureau, bureau })),
  });
  check(
    "sin confirmar no suma 30000 ni declara una cuenta",
    unconfirmed.consolidated.individual.status === "NOT_APPLICABLE" &&
      unconfirmed.consolidated.individual.limitCents == null &&
      unconfirmed.consolidated.cards.length === 0 &&
      unconfirmed.consolidated.discrepancies.some((item) => item.code === "UNCONFIRMED_IDENTITY") &&
      unconfirmed.bureaus.every((bureau) => bureau.individual.limitCents === 1_000_000),
  );

  const mix = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [
      obs({ id: "rev", bureau: "EXPERIAN", canonicalId: "rev", identityStatus: "CONFIRMED" }),
      obs({
        id: "mort",
        bureau: "EXPERIAN",
        accountType: "mortgage",
        creditorName: "Hipoteca",
        canonicalId: "mort",
        identityStatus: "CONFIRMED",
        balanceCents: 200_000_00,
        limitCents: 300_000_00,
      }),
    ],
  });
  check(
    "F03 solo el revolving entra",
    mix.consolidated.cards.length === 1 && mix.consolidated.individual.balanceCents === 800_000,
  );

  const partial = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [
      obs({ id: "a", bureau: "EXPERIAN", canonicalId: "a", identityStatus: "CONFIRMED", balanceCents: 800_000 }),
      obs({
        id: "b",
        bureau: "EXPERIAN",
        canonicalId: "b",
        identityStatus: "CONFIRMED",
        creditorName: "Otra",
        limitCents: null,
        balanceCents: 100,
      }),
    ],
  });
  check(
    "F05 el límite ausente deja el total parcial",
    partial.consolidated.individual.status === "PARTIAL" &&
      partial.consolidated.individual.valueBps == null &&
      partial.consolidated.individual.knownSubsetBps === 8000,
  );

  const zero = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [
      obs({ id: "z", bureau: "EXPERIAN", canonicalId: "z", identityStatus: "CONFIRMED", balanceCents: 0 }),
    ],
  });
  check("F06 saldo cero es 0%", zero.consolidated.individual.valueBps === 0 && zero.consolidated.individual.status === "KNOWN");

  const charge = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [
      obs({
        id: "charge",
        bureau: "EXPERIAN",
        accountType: "charge card",
        canonicalId: "charge",
        identityStatus: "CONFIRMED",
        limitCents: null,
      }),
    ],
  });
  check("F07 un charge no entra en la utilización", charge.consolidated.individual.status === "NOT_APPLICABLE");

  check("F08 no recorta por encima de 100%", utilizationBps(120_000, 100_000) === 12_000);

  const currencies = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [
      obs({ id: "usd", bureau: "EXPERIAN", canonicalId: "usd", identityStatus: "CONFIRMED" }),
      obs({
        id: "eur",
        bureau: "EXPERIAN",
        canonicalId: "eur",
        identityStatus: "CONFIRMED",
        currency: "EUR",
        creditorName: "Otra",
      }),
    ],
  });
  check(
    "F22 monedas distintas no forman un total",
    currencies.consolidated.individual.valueBps == null &&
      currencies.consolidated.discrepancies.some((item) => item.code === "MIXED_CURRENCY"),
  );

  const credit = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [
      obs({
        id: "credit",
        bureau: "EXPERIAN",
        canonicalId: "credit",
        identityStatus: "CONFIRMED",
        balanceCents: -500,
      }),
    ],
  });
  check(
    "F28 el saldo a favor conserva el raw y sale del total",
    credit.consolidated.cards[0]?.rawBalanceCents === -500 &&
      credit.consolidated.individual.valueBps == null &&
      credit.consolidated.discrepancies.some((item) => item.code === "CREDIT_BALANCE"),
  );

  const sameBank = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [
      obs({ id: "one", bureau: "EXPERIAN", creditorName: "Banco", canonicalId: "one", identityStatus: "CONFIRMED", limitCents: 1_000_000, balanceCents: 100_000 }),
      obs({ id: "two", bureau: "EXPERIAN", creditorName: "Banco", canonicalId: "two", identityStatus: "CONFIRMED", limitCents: 2_000_000, balanceCents: 200_000 }),
    ],
  });
  check(
    "dos tarjetas del mismo banco siguen siendo dos",
    sameBank.consolidated.cards.length === 2 && sameBank.consolidated.individual.limitCents === 3_000_000,
  );

  const divergent = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [
      obs({ id: "ex", bureau: "EXPERIAN", reportDate: "2024-06-01", canonicalId: "visa", identityStatus: "CONFIRMED", balanceCents: 800_000 }),
      obs({ id: "eq", bureau: "EQUIFAX", reportDate: "2024-01-01", canonicalId: "visa", identityStatus: "CONFIRMED", balanceCents: 700_000 }),
    ],
  });
  check(
    "la vista por buró conserva el saldo de cada uno",
    divergent.bureaus.find((bureau) => bureau.bureau === "EQUIFAX")?.individual.balanceCents === 700_000 &&
      divergent.bureaus.find((bureau) => bureau.bureau === "EXPERIAN")?.individual.balanceCents === 800_000,
  );
  check(
    "la consolidada usa la observación elegida y muestra la diferencia",
    divergent.consolidated.individual.balanceCents === 800_000 &&
      divergent.consolidated.discrepancies.some((item) => item.code === "BUREAU_DIVERGENCE"),
  );

  const example = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [
      obs({ id: "a", bureau: "EXPERIAN", canonicalId: "a", identityStatus: "CONFIRMED", limitCents: 1_000_000, balanceCents: 800_000 }),
      obs({ id: "b", bureau: "EXPERIAN", canonicalId: "b", identityStatus: "CONFIRMED", creditorName: "B", limitCents: 500_000, balanceCents: 50_000 }),
      obs({ id: "c", bureau: "EXPERIAN", canonicalId: "c", identityStatus: "CONFIRMED", creditorName: "C", limitCents: 500_000, balanceCents: 0 }),
    ],
  });
  check(
    "8500 sobre 20000 es 42.5% y el máximo es 80%",
    example.consolidated.individual.valueBps === 4250 && example.consolidated.individual.maxIndividualBps === 8000,
  );

  const plan = readFileSync("src/server/credit-reports/action-plan.ts", "utf8");
  check("el plan ya no suma con la clave vieja", !plan.includes("${item.creditorName}|${item.bureau}"));
  check("el promedio de porcentajes no certifica la utilización", !plan.includes("utils.reduce"));
  check("la versión queda fija", REVOLVING_VERSION === "t11-2026-10-20");

  const rating = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [
      obs({
        id: "agreed",
        bureau: "EXPERIAN",
        accountStatus: openClosedForReading(null, "Pays as Agreed"),
        currency: null,
        canonicalId: "agreed",
        identityStatus: "CONFIRMED",
      }),
    ],
  });
  check(
    "Pays as Agreed no publica el porcentaje",
    rating.consolidated.individual.valueBps == null &&
      rating.consolidated.individual.status !== "KNOWN" &&
      rating.consolidated.cards.length === 1 &&
      rating.consolidated.cards[0]?.openKnown === false &&
      rating.consolidated.discrepancies.some((item) => item.code === "OPEN_STATUS_UNKNOWN") &&
      !OPEN_STATUS_LABEL.includes("0%"),
  );

  const closed = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [
      obs({
        id: "closed",
        bureau: "EXPERIAN",
        accountStatus: "Collection Account Closed",
        canonicalId: "closed",
        identityStatus: "CONFIRMED",
      }),
    ],
  });
  check(
    "una cuenta cerrada sigue fuera",
    closed.consolidated.cards.length === 0 && closed.consolidated.individual.status === "NOT_APPLICABLE",
  );

  const standing = assignOpenClosed({ accountStatus: "Pays as Agreed" });
  const opened = assignOpenClosed({
    accountStatus: "Open",
    paymentStatus: "Pays as Agreed",
  });
  check(
    "el import nuevo separa el rating y no inventa USD",
    standing.openClosedStatus == null &&
      standing.paymentStatus === "Pays as Agreed" &&
      opened.openClosedStatus === "Open" &&
      opened.paymentStatus === "Pays as Agreed" &&
      plan.includes("currency: null"),
  );

  console.log("\nOK credit-revolving\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
