/**
 * Preparación para Fondeo: señales del reporte, sin montos.
 *
 *   npm run smoke:funding-prep
 *
 * Sin red y sin DATABASE_URL.
 */
import {
  FUNDING_PREP_DISCLAIMER,
  FUNDING_PREP_LOADING_MESSAGE,
  FUNDING_PREP_TITLE_PREPARE,
  FUNDING_PREP_TITLE_REVIEW,
  buildFundingPrepPanel,
  formatFundingPrepText,
  fundingPrepExposesAmountFields,
  fundingPrepHasDollarAmount,
  type FundingPrepHub,
} from "../../src/lib/credit/funding-prep";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function assertNoFundingAmount(
  label: string,
  view: ReturnType<typeof buildFundingPrepPanel>,
) {
  check(
    `${label}: sin campos amount/estimate`,
    !fundingPrepExposesAmountFields(view),
    view,
  );
  check(
    `${label}: texto sin monto en dólares`,
    !fundingPrepHasDollarAmount(view),
    formatFundingPrepText(view),
  );
  check(
    `${label}: sin fórmula cash*2.5`,
    !/2\.5|cash\s*\*|months\s*\*|1500/.test(formatFundingPrepText(view)),
    formatFundingPrepText(view),
  );
}

function hub(partial: Partial<FundingPrepHub> & { qualified: boolean }): FundingPrepHub {
  return {
    reportId: partial.reportId ?? "rep-synthetic-1",
    qualified: partial.qualified,
    avgScore: partial.avgScore ?? null,
    avgUtilization: partial.avgUtilization ?? null,
    bureausApproved: partial.bureausApproved ?? 0,
    verdict:
      partial.verdict ??
      (partial.qualified
        ? "Estimado heurístico interno: el perfil muestra señales a revisar. No es una aprobación ni una oferta; confirma requisitos con el prestamista."
        : "Estimado heurístico interno: el perfil aún no cumple la secuencia de preparación. No es una denegación formal; sigue el plan de acción de la Sección 6."),
  };
}

function main() {
  console.log("\n[funding-prep] buildFundingPrepPanel — estados sintéticos");

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
  assertNoFundingAmount("loading", loading);

  const noReport = buildFundingPrepPanel({
    loading: false,
    error: "Sin reportes de crédito para este cliente.",
    hub: null,
  });
  check("sin reporte → kind error", noReport.kind === "error");
  check(
    "sin reporte mensaje",
    noReport.kind === "error" &&
      noReport.message === "Sin reportes de crédito para este cliente.",
  );
  assertNoFundingAmount("sin reporte", noReport);

  const loadError = buildFundingPrepPanel({
    loading: false,
    error: "No se pudo cargar el plan de acción.",
    hub: null,
  });
  check("error de carga → kind error", loadError.kind === "error");
  check(
    "error de carga no muestra hub",
    loadError.kind === "error" &&
      !("reportId" in loadError) &&
      !("summary" in loadError),
  );
  assertNoFundingAmount("error de carga", loadError);

  const cleared = buildFundingPrepPanel({
    loading: false,
    error: null,
    hub: null,
  });
  check(
    "hub null sin error → error genérico (sin resumen anterior)",
    cleared.kind === "error",
  );
  assertNoFundingAmount("hub null", cleared);

  const favorable = buildFundingPrepPanel({
    loading: false,
    error: null,
    hub: hub({
      qualified: true,
      avgScore: 740,
      avgUtilization: 8,
      bureausApproved: 2,
    }),
  });
  check("señales favorables → ready", favorable.kind === "ready");
  check(
    "favorables: título review",
    favorable.kind === "ready" &&
      favorable.title === FUNDING_PREP_TITLE_REVIEW &&
      favorable.tone === "review",
  );
  check(
    "favorables: resumen burós/score/util",
    favorable.kind === "ready" &&
      favorable.summary === "2/3 burós cumplen heurística · score 740 · util 8%",
  );
  check(
    "favorables: disclaimer heurístico",
    favorable.kind === "ready" &&
      favorable.disclaimer === FUNDING_PREP_DISCLAIMER,
  );
  check(
    "favorables: no afirma aprobación/oferta/elegibilidad en título",
    favorable.kind === "ready" &&
      !/aprobad|deneg|oferta|elegib/i.test(favorable.title),
  );
  assertNoFundingAmount("favorables", favorable);

  const prepare = buildFundingPrepPanel({
    loading: false,
    error: null,
    hub: hub({
      qualified: false,
      avgScore: 680,
      avgUtilization: 35,
      bureausApproved: 0,
    }),
  });
  check("señales a revisar → ready", prepare.kind === "ready");
  check(
    "preparar: título prepare",
    prepare.kind === "ready" &&
      prepare.title === FUNDING_PREP_TITLE_PREPARE &&
      prepare.tone === "prepare",
  );
  check(
    "preparar: resumen 0 burós",
    prepare.kind === "ready" &&
      prepare.summary === "0/3 burós cumplen heurística · score 680 · util 35%",
  );
  check(
    "preparar: no afirma denegación en título",
    prepare.kind === "ready" && !/deneg/i.test(prepare.title),
  );
  assertNoFundingAmount("preparar", prepare);

  // Regresión: inputs que antes producían dólares no existen en el view-model.
  const withCashLikeHub = buildFundingPrepPanel({
    loading: false,
    error: null,
    hub: hub({
      qualified: true,
      avgScore: 750,
      avgUtilization: 5,
      bureausApproved: 3,
    }),
  });
  const text = formatFundingPrepText(withCashLikeHub);
  const oldFormula = Math.round(20_000 * 2.5 + 24 * 1500);
  check(
    "no aparece el monto de la fórmula antigua",
    !text.includes(String(oldFormula)) && !text.includes("$86,000"),
    text,
  );

  console.log("\nOK funding-prep\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
