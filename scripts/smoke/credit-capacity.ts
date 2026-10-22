/**
 * DTI y DSCR sin inferir ingreso ni calcular un préstamo.
 *
 *   npm run smoke:credit-capacity
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  CAPACITY_VERSION,
  assessCapacity,
  assessCapacityRule,
  type CapacityInput,
  type DebtObligation,
} from "../../src/lib/credit/capacity";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function obligation(patch: Partial<DebtObligation> = {}): DebtObligation {
  return {
    canonicalId: "canon-1",
    identityConfirmed: true,
    authorizedUser: false,
    paymentCents: 180000,
    currency: "USD",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    ...patch,
  };
}

function input(patch: Partial<CapacityInput> = {}): CapacityInput {
  return {
    clientId: "client-a",
    organizationId: "org-a",
    canViewSensitive: true,
    currency: "USD",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    grossMonthlyIncomeCents: 600000,
    debtCoverage: "COMPLETE",
    obligations: [obligation()],
    sourceDocumentIds: ["doc-1"],
    documents: [{ id: "doc-1", clientId: "client-a", organizationId: "org-a", revoked: false }],
    reviewState: "CONFIRMED",
    eligibleFlowCents: 12_000_000,
    debtServiceCents: 8_000_000,
    flowPeriodStart: "2026-01-01",
    flowPeriodEnd: "2026-12-31",
    flowCurrency: "USD",
    serviceCurrency: "USD",
    allowNegativeFlow: false,
    ...patch,
  };
}

function main() {
  console.log("\n[credit-capacity] assessCapacity");
  check("versión", CAPACITY_VERSION === "t21-2026-10-21");

  const confirmed = assessCapacity(input());
  check(
    "180000 sobre 600000 son 3000 basis points y 1.5x",
    confirmed.attestation === "CONFIRMED" &&
      confirmed.dtiBps === 3000 &&
      confirmed.dscrMilli === 1500 &&
      confirmed.loanAmountCents === null,
    confirmed,
  );

  const declared = assessCapacity(input({ reviewState: "PROPOSED", sourceDocumentIds: [], documents: [] }));
  check("lo declarado no publica el ratio", declared.attestation === "DECLARED" && declared.dtiBps === null);

  const documented = assessCapacity(input({ reviewState: "PROPOSED" }));
  check("lo documentado no se trata como confirmado", documented.attestation === "DOCUMENTED" && documented.dtiBps === null);

  const missingIncome = assessCapacity(input({ grossMonthlyIncomeCents: null }));
  const zeroIncome = assessCapacity(input({ grossMonthlyIncomeCents: 0 }));
  check("ingreso null o cero no calcula", missingIncome.dtiBps === null && zeroIncome.dtiBps === null);

  const partial = assessCapacity(input({ debtCoverage: "PARTIAL" }));
  check("la deuda parcial no publica el ratio", partial.dtiBps === null && partial.debtCoverage === "PARTIAL");

  const once = assessCapacity(
    input({
      obligations: [obligation({ paymentCents: 90000 }), obligation({ paymentCents: 90000 })],
    }),
  );
  check("la misma identidad cuenta una vez", once.dtiBps === 1500, once.dtiBps);

  const mismatch = assessCapacity(
    input({
      obligations: [obligation({ paymentCents: 90000 }), obligation({ paymentCents: 80000 })],
    }),
  );
  check("pagos distintos no se suman", mismatch.dtiBps === null && mismatch.debtCoverage === "PARTIAL");

  const authorized = assessCapacity(
    input({
      obligations: [obligation(), obligation({ canonicalId: "au-1", authorizedUser: true, paymentCents: 900000 })],
    }),
  );
  check("el usuario autorizado no entra en la deuda personal", authorized.dtiBps === 3000);

  const otherPeriod = assessCapacity(
    input({ obligations: [obligation({ periodEnd: "2026-02-28" })] }),
  );
  check("un período distinto no calcula", otherPeriod.dtiBps === null);

  const otherCurrency = assessCapacity(input({ obligations: [obligation({ currency: "EUR" })] }));
  const blankCurrency = assessCapacity(input({ currency: null }));
  check(
    "otra moneda o una moneda vacía no se lee como USD",
    otherCurrency.dtiBps === null && blankCurrency.dtiBps === null,
  );

  const foreign = assessCapacity(
    input({
      documents: [{ id: "doc-1", clientId: "client-b", organizationId: "org-a", revoked: false }],
    }),
  );
  const revoked = assessCapacity(
    input({
      documents: [{ id: "doc-1", clientId: "client-a", organizationId: "org-a", revoked: true }],
    }),
  );
  check(
    "un documento ajeno o revocado no entra",
    foreign.blocked === "DOCUMENT" && foreign.dtiBps === null && revoked.blocked === "DOCUMENT",
  );

  const hidden = assessCapacity(input({ canViewSensitive: false }));
  check("sin permiso no sale el ratio", hidden.blocked === "SENSITIVE" && hidden.dtiBps === null && hidden.dscrMilli === null);

  const negative = assessCapacity(input({ eligibleFlowCents: -12_000_000, allowNegativeFlow: true }));
  const zeroService = assessCapacity(input({ debtServiceCents: 0 }));
  check(
    "el flujo negativo se conserva y el servicio en cero no calcula",
    negative.dscrMilli === -1500 && zeroService.dscrMilli === null,
  );

  const openRule = assessCapacityRule(confirmed, { operator: "MAX_DTI_BPS", threshold: null });
  const pass = assessCapacityRule(confirmed, { operator: "MAX_DTI_BPS", threshold: 4000 });
  const fail = assessCapacityRule(confirmed, { operator: "MAX_DTI_BPS", threshold: 2000 });
  const missing = assessCapacityRule(missingIncome, { operator: "MAX_DTI_BPS", threshold: 4000 });
  check(
    "el mínimo sale del programa y un ratio ausente no pasa",
    openRule.result === "UNKNOWN" &&
      pass.result === "PASS" &&
      fail.result === "FAIL" &&
      missing.result === "UNKNOWN" &&
      pass.loanAmountCents === null,
  );

  const source = readFileSync("src/lib/credit/capacity.ts", "utf8");
  const panel = readFileSync("src/components/clients/agency-client-detail.tsx", "utf8");
  const prep = readFileSync("src/lib/credit/funding-prep.ts", "utf8");
  check("no hay un 43% ni un 1.25 universales", !source.includes("4300") && !source.includes("1.25"));
  check(
    "el panel no infiere el ingreso ni muestra un DTI",
    panel.includes("CAPACITY_NOT_INFERRED") && !panel.includes("dtiBps"),
  );
  check("el título de preparación no cambió", prep.includes('FUNDING_PREP_TITLE = "Requiere programa"'));

  console.log("\nOK credit-capacity\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
