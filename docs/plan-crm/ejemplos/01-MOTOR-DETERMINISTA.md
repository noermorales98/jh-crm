# Motor determinista: referencia TypeScript

[Volver al índice](../README.md) · [Fórmulas](../referencias/MATEMATICAS.md)

Adaptar dentro del servicio real localizado en T00. Requiere soporte BigInt/ES2020 o conversión al Decimal exacto ya instalado. No instalar una dependencia por estos ejemplos. Las entradas se validan previamente con los contratos del dominio. No es un backend, no consulta BD ni verifica permisos.

`aggregate` recibe el universo elegible único; la aplicación debe añadir procedencia, moneda, estado del snapshot y cobertura de importación. El algoritmo de presupuesto reparte dinero extra por buckets internos; no optimiza FICO ni intereses, no reserva pagos mínimos y no reemplaza esos pagos. La UI debe solicitar el presupuesto extra ya reservado.

```ts
// Referencia pura. Entradas monetarias en centavos seguros de una única moneda.
export type RuleResult = "PASS" | "FAIL" | "UNKNOWN";
export type RequiredResult = { required: boolean; result: RuleResult };

export function readiness(rows: RequiredResult[]): "PASS" | "FAIL" | "REVIEW" {
  const required = rows.filter(r => r.required);
  if (required.some(r => r.result === "FAIL")) return "FAIL";
  if (!required.length || required.some(r => r.result === "UNKNOWN")) return "REVIEW";
  return "PASS";
}

function money(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0;
}
function safeNumber(n: bigint): number {
  const value = Number(n);
  if (!Number.isSafeInteger(value)) throw new RangeError("UNSAFE_INTEGER");
  return value;
}
function targetValid(t: number): boolean {
  return Number.isInteger(t) && t >= 0 && t <= 10000;
}

export function utilizationBps(balance: number | null, limit: number | null): number | null {
  if (balance === null || limit === null || !money(balance) || !money(limit) || limit === 0) return null;
  // Redondeo half-up sólo de presentación; no decide umbrales.
  return safeNumber((BigInt(balance) * 10000n * 2n + BigInt(limit)) / (2n * BigInt(limit)));
}

export function paydownCents(balance: number | null, limit: number | null, targetBps: number): number | null {
  if (!targetValid(targetBps)) throw new RangeError("INVALID_TARGET_BPS");
  if (balance === null || limit === null || !money(balance) || !money(limit) || limit === 0) return null;
  const target = safeNumber(BigInt(limit) * BigInt(targetBps) / 10000n);
  return Math.max(0, balance - target);
}

export type Card = { id: string; balance: number | null; limit: number | null };
export function aggregate(cards: Card[]) {
  // El llamador ya eligió cuentas únicas, abiertas, revolving y ownership explícito.
  if (new Set(cards.map(c => c.id)).size !== cards.length) throw new Error("DUPLICATE_CANONICAL_ID");
  const known = cards.filter(c => utilizationBps(c.balance, c.limit) !== null);
  const balance = safeNumber(known.reduce((n, c) => n + BigInt(c.balance!), 0n));
  const limit = safeNumber(known.reduce((n, c) => n + BigInt(c.limit!), 0n));
  const status = !cards.length ? "NOT_APPLICABLE" : known.length === cards.length ? "KNOWN" : "PARTIAL";
  return { status, balance, limit, included: known.length, total: cards.length,
    valueBps: status === "KNOWN" ? utilizationBps(balance, limit) : null,
    knownSubsetBps: known.length ? utilizationBps(balance, limit) : null };
}

export function dtiBps(debt: number | null, grossIncome: number | null): number | null {
  if (debt === null || grossIncome === null || !money(debt) || !money(grossIncome) || grossIncome === 0) return null;
  return utilizationBps(debt, grossIncome);
}

export type Score = {
  value: number; bureau: string | null; family: string | null;
  version: string | null; variant: string | null; date: string;
};
export function scoreDelta(previous: Score, current: Score): number | null {
  const keys = ["bureau", "family", "version", "variant"] as const;
  if (!keys.every(k => previous[k] && current[k] && previous[k] !== "UNKNOWN" &&
    current[k] !== "UNKNOWN" && previous[k] === current[k])) return null;
  const before = Date.parse(previous.date), after = Date.parse(current.date);
  if (!Number.isFinite(before) || !Number.isFinite(after) || after <= before) return null;
  if (!Number.isFinite(previous.value) || !Number.isFinite(current.value)) return null;
  return current.value - previous.value;
}

export function completedMonths(opened: string, asOf: string): number | null {
  function civil(s: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(s + "T00:00:00.000Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? d : null;
  }
  const a = civil(opened), b = civil(asOf);
  if (!a || !b || a > b) return null;
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    b.getUTCMonth() - a.getUTCMonth() - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}

export type BudgetCard = { id: string; balance: number; limit: number };
export function allocateUtilizationBudget(input: BudgetCard[], extraBudget: number,
  bucketsBps: number[] = [10000, 7500, 5000, 3000, 1000, 0]) {
  if (!money(extraBudget)) throw new RangeError("INVALID_BUDGET");
  if (new Set(input.map(c => c.id)).size !== input.length) throw new Error("DUPLICATE_CANONICAL_ID");
  if (input.some(c => !money(c.balance) || !money(c.limit) || c.limit === 0)) throw new Error("INCOMPLETE_ACCOUNTS");
  if (bucketsBps.some(t => !targetValid(t))) throw new RangeError("INVALID_BUCKET");
  const buckets = [...new Set([...bucketsBps, 0])].sort((a, b) => b - a);
  const cards = input.map(c => ({ ...c, payment: 0 }));
  let remaining = extraBudget;
  while (remaining > 0) {
    const active = cards.filter(c => c.balance > 0).sort((a, b) => {
      const cross = BigInt(a.balance) * BigInt(b.limit) - BigInt(b.balance) * BigInt(a.limit);
      return cross > 0n ? -1 : cross < 0n ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const card = active[0];
    if (!card) break;
    // Siguiente bucket estrictamente menor a la utilización actual.
    const target = buckets.find(t => BigInt(card.balance) * 10000n > BigInt(card.limit) * BigInt(t))!;
    const needed = paydownCents(card.balance, card.limit, target)!;
    const payment = Math.min(remaining, card.balance, needed);
    if (payment <= 0) throw new Error("NON_PROGRESSING_ALLOCATION");
    card.balance -= payment; card.payment += payment; remaining -= payment;
  }
  return { cards, spent: extraBudget - remaining, remaining, policy: "UTILIZATION_BUCKETS_V1" };
}
```

## Adaptación requerida

- Prisma Decimal → centavos con conversión exacta, sin `parseFloat` para operaciones monetarias.
- Verificar modelo/rango y fuente de score fuera de `scoreDelta`; fechas válidas se validan en frontera.
- DTI sólo recibe una suma completa de obligaciones del alcance definido por el programa. Si falta alguna, la aplicación conserva PARTIAL y no publica DTI certificado.
- No usar `valueBps` redondeado para comparar un límite de programa: comparar productos enteros o Decimal sin redondear.
- La asignación genera un escenario: no envía pagos ni confirma saldos reales.
