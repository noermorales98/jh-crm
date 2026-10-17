/**
 * Estimado JH de montos para Fondeo (bandas).
 *
 *   npm run smoke:funding-estimate
 *
 * Sin red y sin DATABASE_URL.
 */
import {
  FUNDING_ESTIMATE_DISCLAIMER,
  computeFundingEstimate,
  formatFundingEstimateMidLabel,
  formatFundingEstimateRange,
  roundFundingEstimate,
  scoreTierBaseMid,
} from "../../src/lib/credit/funding-estimate";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function main() {
  console.log("\n[funding-estimate] computeFundingEstimate");

  check("round 1250 → 1300", roundFundingEstimate(1250) === 1300);
  check("round 0 → 0", roundFundingEstimate(0) === 0);
  check("tier 750 → 32000", scoreTierBaseMid(750) === 32_000);
  check("tier 710 → 18000", scoreTierBaseMid(710) === 18_000);
  check("tier 500 → 1500", scoreTierBaseMid(500) === 1_500);

  const none = computeFundingEstimate({
    avgScore: null,
    avgUtilization: null,
    bureausApproved: 0,
    negativeCount: 0,
    totalLimit: null,
    totalUsed: null,
    qualified: false,
  });
  check("sin score ni revolving → insufficient", none.kind === "insufficient");

  const strong = computeFundingEstimate({
    avgScore: 740,
    avgUtilization: 8,
    bureausApproved: 2,
    negativeCount: 0,
    totalLimit: 50_000,
    totalUsed: 4_000,
    qualified: true,
  });
  check("perfil fuerte → ready", strong.kind === "ready");
  if (strong.kind === "ready") {
    check("fuerte: low ≤ mid ≤ high", strong.low <= strong.mid && strong.mid <= strong.high);
    check("fuerte: mid > 0", strong.mid > 0);
    check(
      "fuerte: high ≤ capacidad revolving",
      strong.high <= 46_000,
      strong,
    );
    check("fuerte: basis mixed", strong.basis === "mixed");
    check(
      "fuerte: range label tiene $",
      formatFundingEstimateRange(strong).includes("$"),
    );
    check(
      "fuerte: mid label ~$",
      formatFundingEstimateMidLabel(strong).startsWith("~$"),
    );
    check(
      "disclaimer no es oferta",
      /no es oferta/i.test(FUNDING_ESTIMATE_DISCLAIMER),
    );
    // Anti-regresión: no usar fórmula Fondify-like cash*2.5
    const banned = Math.round(20_000 * 2.5 + 24 * 1500);
    check(
      "no reproduce monto cash*2.5 legacy",
      strong.mid !== banned && strong.high !== banned,
      { mid: strong.mid, banned },
    );
  }

  const weak = computeFundingEstimate({
    avgScore: 620,
    avgUtilization: 42,
    bureausApproved: 0,
    negativeCount: 4,
    totalLimit: 8_000,
    totalUsed: 6_500,
    qualified: false,
  });
  check("perfil débil → ready", weak.kind === "ready");
  if (weak.kind === "ready" && strong.kind === "ready") {
    check(
      "débil mid < fuerte mid",
      weak.mid < strong.mid,
      { weak: weak.mid, strong: strong.mid },
    );
    check("débil banda bajo o medio", weak.bandLabel === "bajo" || weak.bandLabel === "medio");
  }

  const scoreOnly = computeFundingEstimate({
    avgScore: 700,
    avgUtilization: 12,
    bureausApproved: 1,
    negativeCount: 1,
    totalLimit: 0,
    totalUsed: 0,
    qualified: false,
  });
  check("solo score → ready", scoreOnly.kind === "ready");
  if (scoreOnly.kind === "ready") {
    check("solo score basis score_signals", scoreOnly.basis === "score_signals");
  }

  const revolvingOnly = computeFundingEstimate({
    avgScore: null,
    avgUtilization: 5,
    bureausApproved: 1,
    negativeCount: 0,
    totalLimit: 20_000,
    totalUsed: 2_000,
    qualified: true,
  });
  check("solo revolving → ready", revolvingOnly.kind === "ready");
  if (revolvingOnly.kind === "ready") {
    check(
      "solo revolving basis revolving_capacity",
      revolvingOnly.basis === "revolving_capacity",
    );
  }

  console.log("\nOK funding-estimate\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
