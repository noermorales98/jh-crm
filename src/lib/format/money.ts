/** Formato de dinero: USD en-US (la operación es en EE.UU.). */

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatMoney(
  amount: number | string | { toString(): string },
  currency = "USD",
): string {
  const value = Number(amount.toString());
  if (currency === "USD") return usdFormatter.format(value);
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    value,
  );
}
