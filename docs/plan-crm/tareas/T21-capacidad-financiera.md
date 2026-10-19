# T21 · Capturar datos financieros y calcular DTI/DSCR

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Capacidad de pago
- **Dependencias:** T20
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Complementar reportes con ingresos/obligaciones documentados sin inventar capacidad en dólares.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Perfil financiero, formularios, obligaciones, business profile y campos existentes de pagos mensuales.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Pedir ingreso bruto mensual, componentes de deuda, período, moneda, fuente y confirmación. No extraer ingreso desde el score.
2. Evitar duplicar obligación canónica entre burós. Resolver ownership y obligaciones adicionales conforme al programa.
3. DTI usa suma completa del alcance; faltantes → PARTIAL/UNKNOWN. Ingreso cero o desconocido no permite calcular.
4. Para DSCR capturar flujo elegible y servicio de deuda del mismo período. El programa define numerador y ajustes, no un campo genérico ambiguo.
5. Conectar ratios a reglas documentadas; sin mínimo universal ni monto calculado por multiplicadores.
6. UI distingue datos declarados, documentados y confirmados; controles de acceso de finanzas se aplican en servidor.

## Código o contrato de implementación

```ts
type FinancialInput = {
  currency: string; periodStart: string; periodEnd: string;
  grossMonthlyIncomeCents: number | null;
  monthlyDebtPaymentsCents: number | null;
  debtCoverage: "COMPLETE" | "PARTIAL";
  sourceDocumentIds: string[]; reviewState: "PROPOSED" | "CONFIRMED";
};
```

## Operaciones y significado de los datos

DTI=1,800/6,000×100=30%. DSCR=120,000/80,000=1.5x. Flujo negativo documentado puede producir DSCR negativo si la definición del programa lo admite; denominador cero → no calculable. No convertir DTI o DSCR en préstamo posible.

## Verificación concreta

Ingreso null/0, deuda parcial, doble conteo, períodos distintos, moneda distinta, documento ajeno y mínimo configurable del programa.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Ratios reproducibles y con cobertura/fuente; no confundir declarado con verificado; ausencia no pasa reglas.

Guarda evidencia en `docs/plan-crm/evidencias/T21.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Ocultar ratios no verificados conservando datos; no alterar histórico ni cambiar obligaciones sólo para mejorar DTI.

## Prompt listo para Cursor

```text
Ejecuta T21 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T21-capacidad-financiera.md dentro de docs/plan-crm.
Comprueba dependencias: T20. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T21.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[MATEMATICAS](../referencias/MATEMATICAS.md) · [CONTRATOS-DE-DATOS](../referencias/CONTRATOS-DE-DATOS.md)
