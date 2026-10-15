/**
 * JH-009 / TEST-009 — distribución de cuotas en centavos.
 * Suma(cuotas) === total; la última absorbe el residuo de redondeo.
 */

/** Convierte dólares a centavos enteros (half-up). */
export function dollarsToCents(amount: number | string): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) throw new Error("Monto inválido");
  return Math.round(n * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * Devuelve n montos en centavos que suman exactamente `totalCents`.
 * Cuotas 1..n-1 = floor(total/n); última = resto.
 */
export function allocateInstallmentCents(
  totalCents: number,
  numberOfInstallments: number,
): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error("totalCents debe ser entero ≥ 0");
  }
  if (
    !Number.isInteger(numberOfInstallments) ||
    numberOfInstallments < 2 ||
    numberOfInstallments > 60
  ) {
    throw new Error("numberOfInstallments debe estar entre 2 y 60");
  }
  const base = Math.floor(totalCents / numberOfInstallments);
  const amounts = Array.from({ length: numberOfInstallments }, () => base);
  const allocated = base * numberOfInstallments;
  amounts[numberOfInstallments - 1] =
    (amounts[numberOfInstallments - 1] ?? 0) + (totalCents - allocated);
  return amounts;
}

export function assertInstallmentsSumToTotal(
  amountsCents: number[],
  totalCents: number,
): boolean {
  return amountsCents.reduce((a, b) => a + b, 0) === totalCents;
}
