# T14 · Distribuir presupuesto extra con una política determinista

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Score Plan con presupuesto
- **Dependencias:** T13
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Permitir escenarios de asignación sin simular pagos reales ni sacrificar mínimos de otras obligaciones.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

UI del plan, inputs monetarios, reglas de prioridad y contratos de escenarios.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Pedir presupuesto extra después de reservas para mínimos y gastos; no inferirlo del ingreso.
2. Implementar buckets configurables y desempate estable por ID. Llamar a la política por nombre/versión.
3. Recalcular utilización a partir de saldos simulados y de la misma base de cuentas; no mutar snapshot.
4. Garantizar conservación de dinero, saldo no negativo, determinismo y terminación con presupuesto sobrante.
5. Mostrar cuentas excluidas y no presentar un escenario completo cuando falten datos críticos.
6. No añadir modos APR/intereses hasta disponer de tasas, mínimos y contrato propio; no afirmar que esta heurística maximiza score o ahorro.

## Código o contrato de implementación

Usar `allocateUtilizationBudget` del [motor](../ejemplos/01-MOTOR-DETERMINISTA.md).

```ts
type BudgetScenario = {
  extraBudgetCents: number; spentCents: number; remainingCents: number;
  policy: "UTILIZATION_BUCKETS_V1";
  beforeSnapshotId: string; simulated: true;
};
```

## Operaciones y significado de los datos

A 8k/10k, B 2k/5k, C 300/5k y extra 2k → A 6k, B2k, C300 según buckets v1; 8,300/20,000=41.5%. `spent + remaining = extra`; suma de pagos = spent.

## Verificación concreta

Presupuesto cero, más que saldos, empates, cuenta sobre límite, límite desconocido y conjunto vacío. Barrido de invariantes y entrada no mutada.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Misma entrada produce mismo escenario; dinero conservado; extra y alcance visibles; ninguna transferencia/pago externo ejecutado.

Guarda evidencia en `docs/plan-crm/evidencias/T14.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Desactivar asignador y mantener sólo paydown T13. Los escenarios guardados permanecen etiquetados con versión antigua.

## Prompt listo para Cursor

```text
Ejecuta T14 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T14-presupuesto.md dentro de docs/plan-crm.
Comprueba dependencias: T13. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T14.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[MATEMATICAS](../referencias/MATEMATICAS.md) · [QA-Y-ACEPTACION](../referencias/QA-Y-ACEPTACION.md)
