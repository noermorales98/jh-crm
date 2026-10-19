# Identidad y reglas: contratos de referencia

[Volver al índice](../README.md)

## Matching conservador

```ts
type IdentityInput = {
  id: string; organizationId: string; clientId: string;
  creditorNormalized: string | null; suffix: string | null;
  openedMonth: string | null; family: string | null;
};
function candidate(a: IdentityInput, b: IdentityInput) {
  if (a.organizationId !== b.organizationId || a.clientId !== b.clientId)
    return { outcome: "REJECT", reasons: ["SCOPE_MISMATCH"] };
  if (a.id === b.id) return { outcome: "SAME_OBSERVATION", reasons: [] };
  if (a.family && b.family && a.family !== "UNKNOWN" && b.family !== "UNKNOWN" && a.family !== b.family)
    return { outcome: "REJECT", reasons: ["INCOMPATIBLE_FAMILY"] };
  if (a.suffix && b.suffix && a.suffix !== b.suffix)
    return { outcome: "REVIEW", reasons: ["SUFFIX_CONFLICT"] };
  const signals = {
    creditor: !!a.creditorNormalized && a.creditorNormalized === b.creditorNormalized,
    suffix: !!a.suffix && a.suffix === b.suffix,
    openedMonth: !!a.openedMonth && a.openedMonth === b.openedMonth,
    family: !!a.family && a.family !== "UNKNOWN" && a.family === b.family
  };
  return { outcome: signals.creditor ? "REVIEW_CANDIDATE" : "UNLINKED", signals };
}
```

Este ejemplo no une cuentas ni calcula una probabilidad. Los pesos 0.35/0.25/etc. del informe eran ilustrativos: no se promueven a política automática. El sufijo puede coincidir en tarjetas distintas; una discrepancia puede deberse a enmascaramiento distinto. Ownership tampoco se usa como identidad rígida. Revisar conjuntos completos para evitar que A≈B y B≈C fusione A/C incompatibles.

## Evaluación de un límite de utilización

```ts
type RatioInput = { balanceCents: bigint | null; limitCents: bigint | null };
function maxUtilizationRule(input: RatioInput, maxBps: number): "PASS" | "FAIL" | "UNKNOWN" {
  if (!Number.isInteger(maxBps) || maxBps < 0) return "UNKNOWN";
  const { balanceCents: b, limitCents: l } = input;
  if (b === null || l === null || b < 0n || l <= 0n) return "UNKNOWN";
  return b * 10000n <= l * BigInt(maxBps) ? "PASS" : "FAIL";
}
```

El umbral proviene del ruleset, nunca de una constante universal. La evaluación real primero comprueba vigencia, fuente, scope, datos completos y política del programa. Guards anteriores al cálculo devuelven UNKNOWN por regla y REVIEW global si no puede evaluarse un programa vigente.

## Resultado auditable

```ts
type EvaluatedRule = {
  ruleId: string; required: boolean;
  result: "PASS" | "FAIL" | "UNKNOWN";
  reasonCode: string; sourceObservationIds: string[];
  expected: unknown; actual: unknown;
  rulesetId: string; rulesetVersion: number;
  evaluatedAt: string; snapshotId: string;
};
```

No ejecutar expresiones JavaScript ni SQL subidas por un administrador para definir reglas. Usar operadores permitidos, tipos validados y resolución de campos autorizada. Las reglas son datos, no código arbitrario.
