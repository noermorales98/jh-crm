/**
 * Usuarios autorizados aparte de las cuentas propias.
 *
 *   npm run smoke:credit-ownership
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  AU_LIMIT_NOT_CAPACITY,
  OWNERSHIP_VERSION,
  buildOwnershipSummary,
  type OwnershipObservation,
} from "../../src/lib/credit/ownership";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function obs(
  partial: Partial<OwnershipObservation> & Pick<OwnershipObservation, "id" | "bureau">,
): OwnershipObservation {
  return {
    creditorName: "Visa",
    accountType: "revolving",
    responsibility: "authorized user",
    accountStatus: "Open",
    balanceCents: 30_000,
    limitCents: 1_500_000,
    currency: "USD",
    reportDate: "2024-06-01",
    canonicalId: "au-1",
    identityStatus: "CONFIRMED",
    ownershipConfirmed: true,
    opened: { year: 2022, month: 6, day: 1, precision: "DAY" },
    reportedNegative: false,
    ...partial,
  };
}

function main() {
  console.log("\n[credit-ownership] vistas");

  const one = buildOwnershipSummary({
    asOf: "2024-06-01",
    observations: ["EXPERIAN", "EQUIFAX", "TRANSUNION"].map((bureau) =>
      obs({ id: bureau, bureau }),
    ),
  });
  check(
    "una AU confirmada en tres burós cuenta 1",
    one.auCanonicalIds.length === 1 &&
      one.auAccounts.length === 1 &&
      one.auAccounts[0]?.bureaus.length === 3 &&
      one.auAccounts[0]?.ageMonths === 24,
    one.auAccounts,
  );

  const pending = buildOwnershipSummary({
    asOf: "2024-06-01",
    observations: ["EXPERIAN", "EQUIFAX", "TRANSUNION"].map((bureau) =>
      obs({ id: bureau, bureau, ownershipConfirmed: false }),
    ),
  });
  check(
    "sin confirmar no cuenta 1 ni 3",
    pending.auCanonicalIds.length === 0 &&
      pending.auAccounts.length === 0 &&
      pending.unresolvedCanonicalIds.length === 1,
  );

  const conflict = buildOwnershipSummary({
    asOf: "2024-06-01",
    observations: [
      obs({ id: "ex", bureau: "EXPERIAN", responsibility: "individual", canonicalId: "mix" }),
      obs({ id: "eq", bureau: "EQUIFAX", responsibility: "authorized user", canonicalId: "mix" }),
    ],
  });
  check(
    "individual contra AU queda en conflicto",
    conflict.conflicts.length === 1 &&
      conflict.primaryCanonicalIds.length === 0 &&
      conflict.auCanonicalIds.length === 0 &&
      conflict.conflicts[0]?.responsibilities.includes("individual") &&
      conflict.conflicts[0]?.responsibilities.includes("authorized user"),
  );

  const unknown = buildOwnershipSummary({
    asOf: "2024-06-01",
    observations: [
      obs({
        id: "own",
        bureau: "EXPERIAN",
        responsibility: "individual",
        canonicalId: "own",
        balanceCents: 845_000,
        limitCents: 2_200_000,
      }),
      obs({
        id: "missing",
        bureau: "EQUIFAX",
        responsibility: null,
        canonicalId: "missing",
        creditorName: "AU Bank",
        balanceCents: 100,
        limitCents: 9_000_000,
      }),
    ],
  });
  check(
    "el ownership desconocido no entra en el total propio",
    unknown.primaryCanonicalIds.length === 1 &&
      unknown.auCanonicalIds.length === 0 &&
      unknown.primary.limitCents === 2_200_000,
  );
  check("el nombre AU de un acreedor no clasifica", unknown.auAccounts.length === 0);

  const negative = buildOwnershipSummary({
    asOf: "2024-06-01",
    observations: [obs({ id: "neg", bureau: "EXPERIAN", reportedNegative: true, accountStatus: "Open" })],
  });
  check(
    "un AU negativo se sigue viendo",
    negative.auAccounts[0]?.reportedNegative === true && negative.auAccounts[0]?.accountStatus === "Open",
  );

  const views = buildOwnershipSummary({
    asOf: "2024-06-01",
    observations: [
      obs({
        id: "primary",
        bureau: "EXPERIAN",
        responsibility: "individual",
        canonicalId: "primary",
        balanceCents: 845_000,
        limitCents: 2_200_000,
      }),
      obs({ id: "au", bureau: "EXPERIAN", canonicalId: "au-only" }),
    ],
  });
  check(
    "las dos vistas usan los puntos básicos de T11",
    views.primary.valueBps === 3841 && views.withAuthorizedUsers.valueBps === 2365,
    { primary: views.primary.valueBps, withAu: views.withAuthorizedUsers.valueBps },
  );
  check("el límite AU no se presenta como capacidad propia", views.primary.limitCents === 2_200_000);

  const plan = readFileSync("src/server/credit-reports/action-plan.ts", "utf8");
  const view = readFileSync("src/components/clients/client-action-plan-view.tsx", "utf8");
  check("el plan ya no clasifica por regex", !plan.includes("isAuthorizedUser") && !plan.includes("\\bau\\b"));
  check("la ficha no recomienda un monto", !view.includes("15,000") && !view.includes("máximo") && plan.includes("AU_LIMIT_NOT_CAPACITY"));
  check("la versión queda fija", OWNERSHIP_VERSION === "t12-2026-10-21");

  console.log("\nOK credit-ownership\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
