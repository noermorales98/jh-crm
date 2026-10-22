/**
 * Panel de fondeo: lecturas observadas, sin banda de monto.
 *
 *   npm run smoke:funding-prep
 *
 * Sin red y sin DATABASE_URL.
 */
import {
  FUNDING_ESTIMATE_REASON,
} from "../../src/lib/credit/funding-estimate";
import {
  FUNDING_PREP_DISCLAIMER,
  FUNDING_PREP_LOADING_MESSAGE,
  FUNDING_PREP_TITLE,
  buildFundingPrepPanel,
  formatFundingPrepText,
  type FundingPrepHub,
} from "../../src/lib/credit/funding-prep";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function hub(
  partial: Partial<FundingPrepHub> & { qualified: boolean },
): FundingPrepHub {
  return {
    reportId: partial.reportId ?? "rep-synthetic-1",
    qualified: partial.qualified,
    avgScore: partial.avgScore ?? null,
    avgUtilization: partial.avgUtilization ?? null,
    bureausApproved: partial.bureausApproved ?? 0,
    negativeCount: partial.negativeCount ?? 0,
    totalLimit: partial.totalLimit ?? null,
    totalUsed: partial.totalUsed ?? null,
    verdict: partial.verdict ?? "Lectura del reporte.",
  };
}

function main() {
  console.log("\n[funding-prep] buildFundingPrepPanel — sin monto");

  const loading = buildFundingPrepPanel({
    loading: true,
    error: null,
    hub: hub({ qualified: true, avgScore: 740, bureausApproved: 2 }),
  });
  check("loading → kind loading", loading.kind === "loading");
  check(
    "loading ignora hub previo",
    loading.kind === "loading" &&
      loading.message === FUNDING_PREP_LOADING_MESSAGE,
  );

  const noReport = buildFundingPrepPanel({
    loading: false,
    error: "Sin reportes de crédito para este cliente.",
    hub: null,
  });
  check("sin reporte → kind error", noReport.kind === "error");

  const favorable = buildFundingPrepPanel({
    loading: false,
    error: null,
    hub: hub({
      qualified: true,
      avgScore: 740,
      avgUtilization: 8,
      bureausApproved: 2,
      negativeCount: 0,
      totalLimit: 45_000,
      totalUsed: 3_000,
    }),
  });
  check("con reporte → ready", favorable.kind === "ready");
  if (favorable.kind === "ready") {
    check("título requiere programa", favorable.title === FUNDING_PREP_TITLE);
    check(
      "resumen observa score y util",
      favorable.summary ===
        "Score promedio informativo 740 · utilización revolving 8%",
    );
    check(
      "estimado indisponible",
      favorable.estimate.status === "UNAVAILABLE" &&
        favorable.estimate.amount === null &&
        favorable.estimate.reason === FUNDING_ESTIMATE_REASON,
    );
    check(
      "disclaimer sin banda",
      favorable.disclaimer === FUNDING_PREP_DISCLAIMER &&
        !favorable.disclaimer.includes("$"),
    );
    const text = formatFundingPrepText(favorable);
    check("texto sin $", !text.includes("$"), text);
    check(
      "texto no afirma aprobación",
      !/aprobad|deneg|oferta|elegib|banda/i.test(favorable.title),
    );
  }

  const prepare = buildFundingPrepPanel({
    loading: false,
    error: null,
    hub: hub({
      qualified: false,
      avgScore: 680,
      avgUtilization: 35,
      bureausApproved: 0,
      negativeCount: 3,
      totalLimit: 10_000,
      totalUsed: 7_000,
    }),
  });
  check("otro perfil → ready", prepare.kind === "ready");
  if (prepare.kind === "ready" && favorable.kind === "ready") {
    check(
      "el perfil no cambia el monto",
      prepare.estimate.amount === favorable.estimate.amount &&
        prepare.estimate.reason === favorable.estimate.reason,
    );
    check(
      "resumen del segundo perfil",
      prepare.summary ===
        "Score promedio informativo 680 · utilización revolving 35%",
    );
  }

  console.log("\nOK funding-prep\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
