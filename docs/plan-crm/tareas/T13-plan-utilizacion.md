# T13 · Reformular Score Plan como escenarios de paydown

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Score Plan
- **Dependencias:** T11
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Conservar la fórmula útil y separar metas individuales de la meta agregada.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Score Plan actual, controles de meta, tests existentes de 10k/8k/10%, UI, PDF y DTOs.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Usar exclusivamente cuentas elegibles del motor T11 y un snapshot conocido.
2. Ofrecer meta configurable en bps; porcentajes predefinidos son escenarios, no umbrales óptimos FICO.
3. Calcular por tarjeta y agregado por separado. Explicar por qué sus pagos totales pueden ser distintos.
4. Aplicar redondeo conservador de centavos y validaciones de límites/faltantes.
5. Mostrar fecha del saldo reportado y distinguir cierre/reporte/due date cuando consten. No inventar fechas para optimizar.
6. Renombrar copy a optimización de utilización y retirar promesas de score; conservar tests aritméticos válidos existentes.

## Código o contrato de implementación

Implementar `paydownCents` del [motor de referencia](../ejemplos/01-MOTOR-DETERMINISTA.md).

```ts
type UtilizationScenario = {
  snapshotId: string; targetBps: number;
  aggregatePaydownCents: number | null;
  perAccountPaydownCents: { canonicalId: string; payment: number | null }[];
  scorePrediction: null;
};
```

## Operaciones y significado de los datos

A/B/C al 10%: agregado requiere $6,500, cada cuenta ≤10% requiere $7,000. Pago por cuenta nunca negativo ni mayor al balance. Limit 1 centavo a 50% requiere redondeo definido.

## Verificación concreta

Meta 0/100%, ya debajo, límite null/cero, balance >límite, moneda distinta, datos parciales y redondeo fraccional.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Escenarios reproducibles y explicados; total individual no se confunde con agregado; sin predicción de puntos. Tests de cifras esperadas pasan.

Guarda evidencia en `docs/plan-crm/evidencias/T13.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Conservar cálculo por cuenta validado detrás del contrato anterior si es compatible; desactivar escenarios no verificados.

## Prompt listo para Cursor

```text
Ejecuta T13 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T13-plan-utilizacion.md dentro de docs/plan-crm.
Comprueba dependencias: T11. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T13.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[MATEMATICAS](../referencias/MATEMATICAS.md) · [QA-Y-ACEPTACION](../referencias/QA-Y-ACEPTACION.md)
