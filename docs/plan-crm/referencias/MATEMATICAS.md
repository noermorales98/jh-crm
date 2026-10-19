# Fórmulas y criterios de cálculo

[Volver al índice](../README.md) · [Código exacto](../ejemplos/01-MOTOR-DETERMINISTA.md)

Todos los ejemplos monetarios de esta guía son USD sintéticos. Las fórmulas describen escenarios; no predicen puntos FICO, aprobación o montos de crédito.

## Utilización

Para una cuenta revolving abierta con límite positivo y saldo confirmado: `U_i = B_i / L_i × 100`.
Para un conjunto elegible único: `U = ΣB_i / ΣL_i × 100`. No promediar porcentajes por cuenta. No incluir installment, mortgage o charge sin límite utilizable. El scope INDIVIDUAL, JOINT y AU se muestra explícito.

Ejemplo A: límite 10,000; saldo 8,000. B: 5,000/500. C: 5,000/0. Total límite 20,000, saldo 8,500: utilización **42.5%**. Mayor individual: **80%**. Cada tarjeta existe una vez aunque aparezca en tres burós.

Un límite faltante da UNKNOWN para esa cuenta. Si falta saldo/límite en cuentas del universo, el agregado completo no se certifica; se puede mostrar subtotal conocido con cobertura. Sin cuentas elegibles: N/A, no 0%. Con todas en cero y límite positivo: 0%.

No limitar la utilización al 100%: saldo 1,200 / límite 1,000 = 120%. Para saldo a favor, política propuesta v1: excluir de utilización global certificada y pedir revisión; mostrar el saldo real por separado. Se puede adoptar `max(B,0)` para una vista informativa sólo con política y versión explícitas.

## Paydown por cuenta

Meta decimal `T`: `P_i = max(0, B_i − L_i T)`.
Con centavos y meta en bps, saldo meta = `floor(L_cent × targetBps / 10000)`; pago = `max(0, B_cent − saldo_meta)`. El floor asegura no superar la meta debido a fracciones de centavo.

Límite 10,000, saldo 8,000, meta 10%: saldo meta 1,000; pago **7,000**. Si ya está debajo, pago cero. Si límite faltante/cero, UNKNOWN.

## Paydown agregado y por cuenta no son iguales

Agregado: `P_agg = max(0, ΣB − T ΣL)`.
Para el ejemplo A/B/C al 10%: 8,500 − 2,000 = **6,500**.
Para que cada cuenta alcance 10%: A paga 7,000; B y C pagan 0; total **7,000**. Ambas condiciones tienen objetivos distintos. Con centavos, la suma de saldos meta individuales puede diferir del floor agregado.

## Presupuesto

`B'_i = B_i − p_i`; `0 ≤ p_i ≤ B_i`; `Σp_i ≤ presupuesto_extra`.
El modo inicial distribuye un presupuesto **adicional**, una vez reservados mínimos y gastos definidos por el usuario. Una política de buckets de utilización se presenta como heurística operativa, no como optimización del score. Buckets de ejemplo: 100%, 75%, 50%, 30%, 10%, 0%; configurables y sin significado universal de FICO.

Ejemplo: A 8,000/10,000, B 2,000/5,000, C 300/5,000, extra 2,000. A baja primero a 75% pagando 500 y recibe los otros 1,500 hacia el siguiente bucket: saldo A **6,000**, B **2,000**, C **300**; uso final 8,300/20,000 = **41.5%**. Uso inicial 51.5%. Otro criterio puede distribuir distinto y debe declarar su objetivo.

## Edad

Meses completos entre apertura y `asOf`: `12(año2−año1)+(mes2−mes1)−I(día2<día1)`, usando fechas UTC/civiles normalizadas. Apertura posterior al reporte: inválida. Precisión mensual: no fingir meses completos exactos a nivel de día.

`oldest = max(edades)`; `newest = min(edades)`; `AAoA = ΣedadMeses / N` sobre cuentas únicas y alcance explícito, incluidas cerradas si la vista lo define. Edades 120, 60 y 12 meses → promedio **64 meses**. Si falta una fecha, presentar promedio del subconjunto conocido y cobertura; no reemplazar la edad faltante por cero.

## DTI y DSCR

`DTI = deudaMensual / ingresoBrutoMensual × 100`. Ejemplo 1,800 / 6,000 = **30%**. Ingreso desconocido, cero o negativo: UNKNOWN para esta calculadora. Componentes de deuda incompletos: PARTIAL. Fuente D1.

`DSCR = flujoAnualElegible / servicioAnualDeDeuda`. Ejemplo 120,000 / 80,000 = **1.5x**. El numerador (NOI, cash flow ajustado u otra definición) lo especifica el programa. Períodos y moneda deben coincidir. No inferir crédito en dólares a partir de estos ratios.

## Scores y comparación

`delta = score_nuevo − score_anterior` solamente con buró, familia, versión y variante conocidos e iguales, proveedor/población de score compatibles y fechas ordenadas. Si 670 es Vantage 3 y 695 es FICO 8, delta = **no comparable**, no +25.

## Reglas

Cada requisito devuelve PASS/FAIL/UNKNOWN. Para requisitos obligatorios: si alguno FAIL → FAIL; si no hay FAIL y alguno UNKNOWN → REVIEW; todos PASS y por lo menos uno obligatorio → PASS; ninguna regla obligatoria → REVIEW. Requisitos opcionales no deciden el resultado global. PASS significa «cumple reglas registradas», no aprobado por un prestamista.

No se inventa un score de preparación 78/100: el ejemplo visual del informe no justifica sus pesos. Mostrar conteos de requisitos y datos faltantes.
