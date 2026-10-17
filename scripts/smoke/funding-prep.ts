/**
 * Preparación para Fondeo: señales + estimado JH de montos (bandas).
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
  fundingPrepEstimateReady,
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
    "favorables: disclaimer estimado JH",
    favorable.kind === "ready" &&
      favorable.disclaimer === FUNDING_PREP_DISCLAIMER,
  );
  check(
    "favorables: estimado ready con montos",
    fundingPrepEstimateReady(favorable),
  );
  if (fundingPrepEstimateReady(favorable)) {
    check(
      "favorables: range label con $",
      Boolean(favorable.estimateRangeLabel?.includes("$")),
    );
    check(
      "favorables: mid label",
      Boolean(favorable.estimateMidLabel?.startsWith("~$")),
    );
    check(
      "favorables: texto incluye estimado",
      formatFundingPrepText(favorable).includes("Estimado JH"),
    );
  }
  check(
    "favorables: no afirma aprobación en título",
    favorable.kind === "ready" &&
      !/aprobad|deneg|oferta|elegib/i.test(favorable.title),
  );

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
  check("señales a revisar → ready", prepare.kind === "ready");
  check(
    "preparar: título prepare",
    prepare.kind === "ready" &&
      prepare.title === FUNDING_PREP_TITLE_PREPARE &&
      prepare.tone === "prepare",
  );
  check(
    "preparar: también calcula banda (más baja)",
    fundingPrepEstimateReady(prepare),
  );
  if (
    fundingPrepEstimateReady(favorable) &&
    fundingPrepEstimateReady(prepare)
  ) {
    check(
      "preparar mid < favorables mid",
      prepare.estimate.mid < favorable.estimate.mid,
      {
        prepare: prepare.estimate.mid,
        favorable: favorable.estimate.mid,
      },
    );
  }

  const banned = Math.round(20_000 * 2.5 + 24 * 1500);
  const text = formatFundingPrepText(favorable);
  check(
    "no aparece el monto de la fórmula antigua cash*2.5",
    !text.includes(String(banned)) && !text.includes("$86,000"),
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
