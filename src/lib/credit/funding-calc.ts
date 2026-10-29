/**
 * Calculadora de fondeo (préstamos y líneas de crédito).
 *
 * Junta el reporte (score, negativas, uso de tarjetas, consultas, pagos
 * mensuales) con lo que declara el cliente (ingreso, ventas, tiempo del
 * negocio) y da, por producto, si cumple los requisitos típicos del mercado
 * y un RANGO estimado. No es una aprobación ni una oferta: cada prestamista
 * decide con sus propias reglas y documentos (CROA: sin promesas).
 *
 * Referencias de mercado (2026, revisar cada año):
 * - Préstamo personal: la mayoría pide 580–660 y da mejores tasas desde
 *   ~680; deuda/ingreso (DTI) preferida ≤ 35–43%. Rango: cuota que cabe en
 *   40% del ingreso, a 3 y 5 años, con tope por puntaje y por ingreso anual.
 * - Línea de crédito de negocio (online): ~625+, 6–12 meses operando,
 *   ventas desde ~$100k/año; los bancos piden 680+ y 2 años.
 * - SBA 7(a): el SBA no fija score; los bancos suelen pedir 650–700 y
 *   2+ años con flujo de caja documentado. El monto depende del flujo.
 */

export const FUNDING_CALC_VERSION = "fc01-2026-10-28";

export const FUNDING_DISCLAIMER =
  "Estimado de referencia con el reporte y los datos que declara el cliente. No es una aprobación ni una oferta: cada prestamista decide con sus propias reglas y documentos.";

export type TimeInBusiness = "LT6M" | "6TO12M" | "1TO2Y" | "2Y_PLUS";

export const TIME_IN_BUSINESS_LABEL: Record<TimeInBusiness, string> = {
  LT6M: "Menos de 6 meses",
  "6TO12M": "6 a 12 meses",
  "1TO2Y": "1 a 2 años",
  "2Y_PLUS": "2 años o más",
};

const TIME_MONTHS: Record<TimeInBusiness, number> = { LT6M: 0, "6TO12M": 6, "1TO2Y": 12, "2Y_PLUS": 24 };

/** Lo que declara el cliente (se guarda en su ficha). */
export type FundingProfile = {
  hasBusiness: boolean;
  /** Ingreso personal bruto al mes (antes de impuestos). */
  monthlyIncome: number | null;
  /** Ventas mensuales del negocio. */
  monthlyRevenue: number | null;
  timeInBusiness: TimeInBusiness | null;
  /** Pagos mensuales de deudas si el asesor los corrige; si no, los del reporte. */
  monthlyDebtOverride: number | null;
};

export const EMPTY_FUNDING_PROFILE: FundingProfile = {
  hasBusiness: false,
  monthlyIncome: null,
  monthlyRevenue: null,
  timeInBusiness: null,
  monthlyDebtOverride: null,
};

/** Lectura del reporte que usa la calculadora. */
export type FundingCreditFacts = {
  scores: (number | null)[];
  /** Negativas que suelen frenar un préstamo (cobranzas, cancelaciones, atrasos recientes). */
  blockingNegatives: number;
  utilizationBps: number | null;
  /** Consultas duras en los últimos 6 meses (el buró con más). */
  inquiries6m: number | null;
  /** Pagos mensuales de deudas abiertas que trae el reporte. */
  reportMonthlyDebt: number | null;
};

export type CheckState = "OK" | "FAIL" | "MISSING";

export type FundingCheck = { label: string; state: CheckState; detail: string };

export type ProductId = "PERSONAL_LOAN" | "BUSINESS_LINE" | "SBA_7A";

export type ProductResult = {
  id: ProductId;
  name: string;
  hint: string;
  status: "READY" | "NOT_YET" | "MISSING_DATA";
  checks: FundingCheck[];
  /** Rango estimado (USD redondeado). null = no se calcula para este producto. */
  range: { low: number; high: number } | null;
  /** El mismo cálculo si se limpian las negativas y el uso baja de 30%. */
  potential: { low: number; high: number } | null;
  note: string | null;
};

export type FundingResult = {
  version: typeof FUNDING_CALC_VERSION;
  referenceScore: number | null;
  monthlyDebt: number | null;
  status: "READY" | "NOT_YET" | "MISSING_DATA";
  /** El mejor rango disponible hoy (no se suman productos: un préstamo cambia el otro). */
  best: { product: ProductId; low: number; high: number } | null;
  /** El mejor rango posible después de la reparación. */
  bestPotential: { product: ProductId; low: number; high: number } | null;
  products: ProductResult[];
  /** Qué falta, en palabras simples, sin repetir. */
  todo: string[];
};

const PERSONAL_MIN_SCORE = 640;
const BUSINESS_LINE_MIN_SCORE = 625;
const SBA_MIN_SCORE = 680;
const MAX_DTI = 0.4;
const MAX_UTIL_BPS = 3000;
const MAX_INQUIRIES_6M = 4;
const BUSINESS_LINE_MIN_REVENUE = 8000;

/** Score de referencia: el del medio de los tres (o el promedio si hay dos). */
export function referenceScore(scores: readonly (number | null)[]): number | null {
  const known = scores.filter((s): s is number => s != null && s >= 300 && s <= 850).sort((a, b) => a - b);
  if (known.length === 0) return null;
  if (known.length === 3) return known[1]!;
  if (known.length === 2) return Math.round((known[0]! + known[1]!) / 2);
  return known[0]!;
}

/** Valor presente de una cuota mensual: cuánto préstamo paga esa cuota. */
function principalFor(payment: number, apr: number, months: number): number {
  const r = apr / 12;
  return r === 0 ? payment * months : (payment * (1 - Math.pow(1 + r, -months))) / r;
}

function roundTo(value: number, step: number): number {
  return Math.max(0, Math.floor(value / step) * step);
}

function personalTier(score: number): { apr: number; cap: number } {
  if (score >= 720) return { apr: 0.12, cap: 50_000 };
  if (score >= 680) return { apr: 0.18, cap: 35_000 };
  return { apr: 0.26, cap: 15_000 };
}

function usd(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

type Scenario = { blockingNegatives: number; utilizationBps: number | null };

function creditChecks(score: number | null, minScore: number, facts: FundingCreditFacts, scenario: Scenario): FundingCheck[] {
  return [
    score == null
      ? { label: "Puntaje", state: "MISSING", detail: "El reporte no trae puntajes." }
      : {
          label: "Puntaje",
          state: score >= minScore ? "OK" : "FAIL",
          detail: score >= minScore ? `${score}: cumple (${minScore}+).` : `${score}: suelen pedir ${minScore} o más.`,
        },
    {
      label: "Cuentas negativas",
      state: scenario.blockingNegatives === 0 ? "OK" : "FAIL",
      detail:
        scenario.blockingNegatives === 0
          ? "Sin cobranzas ni cancelaciones que frenen."
          : `${scenario.blockingNegatives} cobranza${scenario.blockingNegatives === 1 ? "" : "s"} o cancelacion${scenario.blockingNegatives === 1 ? "" : "es"}: la mayoría niega con esto.`,
    },
    scenario.utilizationBps == null
      ? { label: "Uso de tarjetas", state: "OK", detail: "Sin tarjetas abiertas." }
      : {
          label: "Uso de tarjetas",
          state: scenario.utilizationBps < MAX_UTIL_BPS ? "OK" : "FAIL",
          detail: `${Math.round(scenario.utilizationBps / 100)}%${scenario.utilizationBps < MAX_UTIL_BPS ? ": bien." : ": conviene bajar de 30%."}`,
        },
    facts.inquiries6m == null
      ? { label: "Consultas recientes", state: "OK", detail: "Sin dato de consultas." }
      : {
          label: "Consultas recientes",
          state: facts.inquiries6m < MAX_INQUIRIES_6M ? "OK" : "FAIL",
          detail: `${facts.inquiries6m} en 6 meses${facts.inquiries6m < MAX_INQUIRIES_6M ? "." : ": muchas solicitudes seguidas preocupan al prestamista."}`,
        },
  ];
}

function statusOf(checks: readonly FundingCheck[]): ProductResult["status"] {
  if (checks.some((c) => c.state === "MISSING")) return "MISSING_DATA";
  return checks.every((c) => c.state === "OK") ? "READY" : "NOT_YET";
}

function personalLoan(
  score: number | null,
  facts: FundingCreditFacts,
  profile: FundingProfile,
  monthlyDebt: number | null,
  scenario: Scenario,
): { checks: FundingCheck[]; range: { low: number; high: number } | null } {
  const checks = creditChecks(score, PERSONAL_MIN_SCORE, facts, scenario);
  let range: { low: number; high: number } | null = null;
  if (profile.monthlyIncome == null || profile.monthlyIncome <= 0) {
    checks.push({ label: "Ingreso", state: "MISSING", detail: "Anota el ingreso mensual antes de impuestos." });
  } else {
    const debt = monthlyDebt ?? 0;
    const room = profile.monthlyIncome * MAX_DTI - debt;
    const dti = Math.round((debt / profile.monthlyIncome) * 100);
    checks.push({
      label: "Deuda / ingreso",
      state: room > 50 ? "OK" : "FAIL",
      detail:
        room > 50
          ? `Hoy ${dti}% del ingreso va a deudas; le queda hasta ${usd(room)} al mes para una cuota.`
          : `Hoy ${dti}% del ingreso va a deudas: no le queda espacio para otra cuota (máx. ~40%).`,
    });
    if (score != null && score >= PERSONAL_MIN_SCORE && room > 50) {
      const tier = personalTier(score);
      // Tope por ingreso: pocos prestamistas dan más de ~⅓–½ del ingreso anual sin garantía.
      const annual = profile.monthlyIncome * 12;
      const low = roundTo(Math.min(principalFor(room, tier.apr, 36), tier.cap, annual / 3), 500);
      const high = roundTo(Math.min(principalFor(room, tier.apr, 60), tier.cap, annual / 2), 500);
      range = low > 0 ? { low, high: Math.max(high, low) } : null;
    }
  }
  return { checks, range };
}

function businessLine(
  score: number | null,
  facts: FundingCreditFacts,
  profile: FundingProfile,
  scenario: Scenario,
): { checks: FundingCheck[]; range: { low: number; high: number } | null } {
  const checks = creditChecks(score, BUSINESS_LINE_MIN_SCORE, facts, scenario);
  checks.push(
    profile.timeInBusiness == null
      ? { label: "Tiempo operando", state: "MISSING", detail: "Indica cuánto tiempo tiene el negocio." }
      : {
          label: "Tiempo operando",
          state: TIME_MONTHS[profile.timeInBusiness] >= 6 ? "OK" : "FAIL",
          detail:
            TIME_MONTHS[profile.timeInBusiness] >= 6
              ? `${TIME_IN_BUSINESS_LABEL[profile.timeInBusiness]}: cumple (6+ meses).`
              : "Suelen pedir al menos 6 meses operando.",
        },
  );
  checks.push(
    profile.monthlyRevenue == null
      ? { label: "Ventas", state: "MISSING", detail: "Anota las ventas mensuales del negocio." }
      : {
          label: "Ventas",
          state: profile.monthlyRevenue >= BUSINESS_LINE_MIN_REVENUE ? "OK" : "FAIL",
          detail:
            profile.monthlyRevenue >= BUSINESS_LINE_MIN_REVENUE
              ? `${usd(profile.monthlyRevenue)} al mes: cumple.`
              : `${usd(profile.monthlyRevenue)} al mes: suelen pedir ~${usd(BUSINESS_LINE_MIN_REVENUE)} o más.`,
        },
  );
  const ok = statusOf(checks) === "READY";
  const annual = (profile.monthlyRevenue ?? 0) * 12;
  const range = ok
    ? { low: roundTo(Math.min(annual * 0.1, 250_000), 1000), high: roundTo(Math.min(annual * 0.15, 250_000), 1000) }
    : null;
  return { checks, range: range && range.low > 0 ? range : null };
}

function sba(score: number | null, facts: FundingCreditFacts, profile: FundingProfile, scenario: Scenario): FundingCheck[] {
  const checks = creditChecks(score, SBA_MIN_SCORE, facts, scenario);
  checks.push(
    profile.timeInBusiness == null
      ? { label: "Tiempo operando", state: "MISSING", detail: "Indica cuánto tiempo tiene el negocio." }
      : {
          label: "Tiempo operando",
          state: TIME_MONTHS[profile.timeInBusiness] >= 24 ? "OK" : "FAIL",
          detail:
            TIME_MONTHS[profile.timeInBusiness] >= 24 ? "2 años o más: cumple." : "Los bancos SBA suelen pedir 2 años operando.",
        },
  );
  return checks;
}

/** Calcula los productos con lo que hay hoy y con el escenario reparado. */
export function computeFunding(facts: FundingCreditFacts, profile: FundingProfile): FundingResult {
  const score = referenceScore(facts.scores);
  const monthlyDebt = profile.monthlyDebtOverride ?? facts.reportMonthlyDebt;
  const today: Scenario = { blockingNegatives: facts.blockingNegatives, utilizationBps: facts.utilizationBps };
  const repaired: Scenario = {
    blockingNegatives: 0,
    utilizationBps: facts.utilizationBps == null ? null : Math.min(facts.utilizationBps, MAX_UTIL_BPS - 1),
  };

  const products: ProductResult[] = [];
  const personalNow = personalLoan(score, facts, profile, monthlyDebt, today);
  const personalFixed = personalLoan(score, { ...facts, inquiries6m: 0 }, profile, monthlyDebt, repaired);
  const personalStatus = statusOf(personalNow.checks);
  products.push({
    id: "PERSONAL_LOAN",
    name: "Préstamo personal",
    hint: "Monto fijo, pagos mensuales de 3 a 5 años.",
    status: personalStatus,
    checks: personalNow.checks,
    range: personalStatus === "READY" ? personalNow.range : null,
    potential: personalStatus === "READY" ? null : personalFixed.range,
    note: null,
  });

  if (profile.hasBusiness) {
    const lineNow = businessLine(score, facts, profile, today);
    const lineFixed = businessLine(score, { ...facts, inquiries6m: 0 }, profile, repaired);
    const lineStatus = statusOf(lineNow.checks);
    products.push({
      id: "BUSINESS_LINE",
      name: "Línea de crédito de negocio",
      hint: "Usa y paga lo que necesite; se renueva.",
      status: lineStatus,
      checks: lineNow.checks,
      range: lineStatus === "READY" ? lineNow.range : null,
      potential: lineStatus === "READY" ? null : lineFixed.range,
      note: "Estimado de 10% a 15% de las ventas anuales (online). Los bancos dan más con 2 años y 680+.",
    });
    const sbaChecks = sba(score, facts, profile, today);
    products.push({
      id: "SBA_7A",
      name: "Préstamo SBA 7(a)",
      hint: "Tasa más baja, más papeleo; plazos largos.",
      status: statusOf(sbaChecks),
      checks: sbaChecks,
      range: null,
      potential: null,
      note: "El monto depende del flujo de caja y los impuestos del negocio; se calcula con el banco.",
    });
  }

  const pick = (key: "range" | "potential") =>
    products
      .filter((p) => p[key] != null)
      .map((p) => ({ product: p.id, low: p[key]!.low, high: p[key]!.high }))
      .sort((a, b) => b.high - a.high)[0] ?? null;

  const status: FundingResult["status"] = products.some((p) => p.status === "READY")
    ? "READY"
    : products.every((p) => p.status === "MISSING_DATA")
      ? "MISSING_DATA"
      : products.some((p) => p.status === "NOT_YET")
        ? "NOT_YET"
        : "MISSING_DATA";

  const todo: string[] = [];
  const add = (text: string) => {
    if (!todo.includes(text)) todo.push(text);
  };
  if (facts.blockingNegatives > 0) {
    add(`Limpiar ${facts.blockingNegatives} cuenta${facts.blockingNegatives === 1 ? "" : "s"} negativa${facts.blockingNegatives === 1 ? "" : "s"} (cobranzas o cancelaciones).`);
  }
  if (facts.utilizationBps != null && facts.utilizationBps >= MAX_UTIL_BPS) add("Bajar el uso de tarjetas a menos de 30% (Score Plan).");
  if (facts.inquiries6m != null && facts.inquiries6m >= MAX_INQUIRIES_6M) add("No pedir más crédito por unos meses: ya tiene muchas consultas.");
  if (score != null && score < PERSONAL_MIN_SCORE) add(`Subir el puntaje a ${PERSONAL_MIN_SCORE} o más.`);
  if (profile.monthlyIncome == null) add("Anotar el ingreso mensual para calcular el préstamo personal.");
  if (profile.hasBusiness && profile.monthlyRevenue == null) add("Anotar las ventas mensuales del negocio.");
  if (profile.hasBusiness && profile.timeInBusiness == null) add("Indicar cuánto tiempo tiene el negocio.");
  for (const p of products) {
    for (const c of p.checks) {
      if (c.state === "FAIL" && c.label === "Deuda / ingreso") add("Bajar pagos mensuales de deudas: hoy no queda espacio para otra cuota.");
    }
  }

  return {
    version: FUNDING_CALC_VERSION,
    referenceScore: score,
    monthlyDebt,
    status,
    best: pick("range"),
    bestPotential: pick("potential"),
    products,
    todo,
  };
}

/** Lee el perfil guardado (JSON) sin confiar en su forma. */
export function parseFundingProfile(raw: unknown): FundingProfile {
  if (!raw || typeof raw !== "object") return EMPTY_FUNDING_PROFILE;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const time = typeof r.timeInBusiness === "string" && r.timeInBusiness in TIME_MONTHS ? (r.timeInBusiness as TimeInBusiness) : null;
  return {
    hasBusiness: r.hasBusiness === true,
    monthlyIncome: num(r.monthlyIncome),
    monthlyRevenue: num(r.monthlyRevenue),
    timeInBusiness: time,
    monthlyDebtOverride: num(r.monthlyDebtOverride),
  };
}
