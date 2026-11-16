/**
 * Fuentes de cada regla de crédito y fondeo.
 *
 * Cada cifra que usa el cálculo sale de aquí, con su fuente y la fecha en que se verificó. Lo que
 * depende del mercado (MARKET) cambia: se revisa cada 6 meses o ante un cambio de la SBA.
 * Registro con el razonamiento: 02-DOCS/wiki/guias/formulas-credito-respaldo.md
 *
 * LAW      norma (se aplica como la ley).
 * GUIDE    regla práctica aceptada por burós y organismos; no es una norma.
 * MARKET   lo que publican los prestamistas; cada uno decide y cambia.
 * PRUDENT  criterio propio de la agencia; sin fuente pública y así se etiqueta.
 */

export const SOURCES_VERIFIED_AT = "2026-11-15";

export type SourceKind = "LAW" | "GUIDE" | "MARKET" | "PRUDENT";

export type Source = {
  id: string;
  kind: SourceKind;
  /** Qué respalda, en palabras sencillas. */
  claim: string;
  /** Dónde se comprobó (vacío solo para PRUDENT). */
  url: string | null;
  verifiedAt: string;
};

const s = (id: string, kind: SourceKind, claim: string, url: string | null): Source => ({
  id,
  kind,
  claim,
  url,
  verifiedAt: SOURCES_VERIFIED_AT,
});

export const SOURCES = {
  FCRA_OBSOLETE_7Y: s(
    "FCRA_OBSOLETE_7Y",
    "LAW",
    "Los negativos salen a los 7 años; las cuentas en cobranza se cuentan 180 días después de la primera morosidad (15 U.S.C. §1681c).",
    "https://www.law.cornell.edu/uscode/text/15/1681c",
  ),
  FCRA_BANKRUPTCY_10Y: s(
    "FCRA_BANKRUPTCY_10Y",
    "LAW",
    "Las quiebras salen a los 10 años de la orden de relief (15 U.S.C. §1681c(a)(1)).",
    "https://www.law.cornell.edu/uscode/text/15/1681c",
  ),
  FICO_WEIGHTS: s(
    "FICO_WEIGHTS",
    "GUIDE",
    "Pesos de FICO: pagos 35 %, deuda 30 %, antigüedad 15 %, nuevo crédito 10 %, mezcla 10 %. Solo FICO; VantageScore usa otros.",
    "https://www.myfico.com/credit-education/whats-in-your-credit-score",
  ),
  UTILIZATION_30: s(
    "UTILIZATION_30",
    "GUIDE",
    "Usar menos de 30 % del límite es la regla práctica; los puntajes más altos suelen estar bajo 10 %.",
    "https://www.experian.com/blogs/ask-experian/credit-education/score-basics/what-affects-your-credit-scores/",
  ),
  DTI_40: s(
    "DTI_40",
    "PRUDENT",
    "Deuda/ingreso máximo de 40 %. El 43 % era el límite de hipotecas calificadas y la regla de 2020 lo retiró: no hay umbral único.",
    null,
  ),
  INQUIRIES_6M: s(
    "INQUIRIES_6M",
    "PRUDENT",
    "Muchas consultas en 6 meses preocupan al prestamista. FICO solo cuenta las de los últimos 12 meses y no publica un número.",
    "https://www.myfico.com/credit-education/whats-in-your-credit-score",
  ),
  PERSONAL_LOAN_APR: s(
    "PERSONAL_LOAN_APR",
    "MARKET",
    "Tasa media (APR) de un préstamo personal a 36 meses por puntaje FICO, nov 2026 (Experian/Curinos). Cambia cada mes: revisar con cada actualización.",
    "https://www.experian.com/blogs/ask-experian/best-personal-loan-rates/",
  ),
  PERSONAL_LOAN_MIN: s(
    "PERSONAL_LOAN_MIN",
    "MARKET",
    "Los prestamistas publican mínimos de 600 a 680; se usa 640 como referencia.",
    "https://www.nerdwallet.com/personal-loans/learn/credit-score-need-get-personal-loan",
  ),
  LINE_ACCESSIBLE: s(
    "LINE_ACCESSIBLE",
    "MARKET",
    "Línea de crédito más accesible (Fundbox): 600 de puntaje, 30 000 USD de ventas al año, 3 a 6 meses operando.",
    "https://www.nerdwallet.com/business/loans/learn/bluevine-vs-fundbox",
  ),
  LINE_STANDARD: s(
    "LINE_STANDARD",
    "MARKET",
    "Línea de crédito estándar (Bluevine y OnDeck): 625 de puntaje, 120 000 USD de ventas al año, 12 meses operando.",
    "https://www.bluevine.com/business-loans",
  ),
  SBA_7A_LENDER_DECIDES: s(
    "SBA_7A_LENDER_DECIDES",
    "MARKET",
    "La SBA retiró su puntaje mínimo (SBSS) el 2026-03-01: cada banco decide con su política y exige capacidad de pago (DSCR). Los bancos suelen mirar 650 a 700 y 2 años operando.",
    "https://www.naggl.org/sba-notice-formally-announcing-sunsetting-of-sbss-scoring-and-providing-new-underwriting-requirements-for-7a-small-loans/",
  ),
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

/** Texto corto para mostrar con una cifra: «(mercado, verificado 2026-11-15)». */
export function sourceTag(id: SourceId): string {
  const source = SOURCES[id];
  const label = { LAW: "ley", GUIDE: "guía", MARKET: "mercado", PRUDENT: "criterio de la agencia" }[source.kind];
  return `${label}, verificado ${source.verifiedAt}`;
}

/** Años que una quiebra puede permanecer en el reporte. */
export const BANKRUPTCY_YEARS = 10;
/** Años que permanecen los demás negativos (desde la primera morosidad; cobranzas, +180 días). */
export const NEGATIVE_YEARS = 7;

/** APR medio por puntaje (36 meses). Se usa la fila más alta que el puntaje alcanza. */
export const PERSONAL_LOAN_APR_BY_SCORE: readonly { minScore: number; apr: number }[] = [
  { minScore: 740, apr: 0.1099 },
  { minScore: 720, apr: 0.1225 },
  { minScore: 700, apr: 0.1348 },
  { minScore: 680, apr: 0.1506 },
  { minScore: 660, apr: 0.1646 },
  { minScore: 640, apr: 0.1758 },
  { minScore: 620, apr: 0.183 },
];

/** Tope prudente del préstamo por puntaje (criterio de la agencia, no publicado por prestamistas). */
export const PERSONAL_LOAN_CAP_BY_SCORE: readonly { minScore: number; cap: number }[] = [
  { minScore: 720, cap: 50_000 },
  { minScore: 680, cap: 35_000 },
  { minScore: 0, cap: 15_000 },
];

export type LineTier = { id: "ACCESSIBLE" | "STANDARD"; name: string; minScore: number; minMonths: number; minMonthlyRevenue: number; source: SourceId };

/** Niveles publicados de línea de crédito de negocio (ventas mensuales = anuales / 12). */
export const BUSINESS_LINE_TIERS: readonly LineTier[] = [
  { id: "ACCESSIBLE", name: "accesible", minScore: 600, minMonths: 6, minMonthlyRevenue: 2500, source: "LINE_ACCESSIBLE" },
  { id: "STANDARD", name: "estándar", minScore: 625, minMonths: 12, minMonthlyRevenue: 10_000, source: "LINE_STANDARD" },
];

/** Referencia de puntaje para bancos SBA (cada banco decide). */
export const SBA_REFERENCE_SCORE = 650;
export const SBA_REFERENCE_MONTHS = 24;
