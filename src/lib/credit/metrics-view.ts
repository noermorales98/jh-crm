/**
 * Presentación de una cifra ya calculada.
 * No vuelve a dividir saldos ni convierte un vacío en cero.
 */

export const METRICS_VIEW_VERSION = "t22-2026-10-21";
export const UNKNOWN_METRIC_LABEL = "Sin dato";
export const PARTIAL_METRIC_LABEL = "Parcial";
export const CONFLICT_METRIC_LABEL = "Conflicto";
export const STALE_METRIC_LABEL = "Desactualizada";

export type MetricStatus = "KNOWN" | "PARTIAL" | "UNKNOWN" | "CONFLICT" | "STALE";

export type MetricText = {
  formattedValue: string | null;
  label: string;
};

export function presentUtilization(input: {
  basisPoints: number | null;
  status: MetricStatus;
}): MetricText {
  if (input.status === "UNKNOWN" || input.status === "PARTIAL" || input.status === "CONFLICT") {
    return { formattedValue: null, label: statusLabel(input.status) };
  }
  if (input.basisPoints == null || !Number.isInteger(input.basisPoints)) {
    return { formattedValue: null, label: UNKNOWN_METRIC_LABEL };
  }
  const formattedValue = formatBasisPoints(input.basisPoints);
  if (input.status === "STALE") return { formattedValue, label: STALE_METRIC_LABEL };
  return { formattedValue, label: "" };
}

export function presentAmount(input: {
  amount: number | null;
  currency: string | null;
  status: MetricStatus;
}): MetricText {
  if (input.status === "UNKNOWN" || input.status === "PARTIAL" || input.status === "CONFLICT") {
    return { formattedValue: null, label: statusLabel(input.status) };
  }
  if (input.amount == null || !Number.isFinite(input.amount)) {
    return { formattedValue: null, label: UNKNOWN_METRIC_LABEL };
  }
  const currency = input.currency?.trim() ?? "";
  const formattedValue = currency.length > 0 ? `${formatAmount(input.amount)} ${currency}` : formatAmount(input.amount);
  if (input.status === "STALE") return { formattedValue, label: STALE_METRIC_LABEL };
  return { formattedValue, label: "" };
}

export function metricText(metric: MetricText): string {
  if (metric.formattedValue && metric.label) return `${metric.formattedValue} · ${metric.label}`;
  return metric.formattedValue ?? metric.label;
}

function statusLabel(status: "UNKNOWN" | "PARTIAL" | "CONFLICT"): string {
  if (status === "PARTIAL") return PARTIAL_METRIC_LABEL;
  if (status === "CONFLICT") return CONFLICT_METRIC_LABEL;
  return UNKNOWN_METRIC_LABEL;
}

function formatBasisPoints(basisPoints: number): string {
  const tenths = Math.trunc((basisPoints + (basisPoints < 0 ? -5 : 5)) / 10);
  const whole = Math.trunc(tenths / 10);
  const fraction = Math.abs(tenths % 10);
  return `${whole}.${fraction}%`;
}

function formatAmount(amount: number): string {
  const negative = amount < 0;
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = Math.trunc(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}
