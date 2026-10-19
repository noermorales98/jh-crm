# T15 · Detectar discrepancias y negativos sin inferir inexactitud

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Análisis
- **Dependencias:** T11
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Distinguir cuenta negativa, anomalía entre fuentes y afirmación comprobable de error.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Agrupación actual negativeType/isNegative, comparadores por buró, fechas e historial de pagos.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Crear reglas descriptivas de balances, ownership, estados e historial mensual con procedencia.
2. Comparar fechas y precisión antes de señalar discrepancia contemporánea; datos de meses distintos no prueban error.
3. Mantener clasificación derogatoria separada de posible inexactitud y elegibilidad de flujo de disputa.
4. Emitir anomalies con IDs y versiones, severidad operativa y revisión requerida, sin borrar datos.
5. Mostrar UNKNOWN si falta historia/fecha; una ausencia en extraction parcial no equivale a estado limpio.
6. Preparar salida para entrevista T16 y action plan T19; no abrir ronda automáticamente.

## Código o contrato de implementación

```ts
type CreditAnomaly = {
  canonicalId: string; field: string; observationIds: string[];
  kind: "VALUE_DISCREPANCY" | "OWNERSHIP_CONFLICT" | "PAYMENT_HISTORY_CONFLICT";
  temporalComparability: "COMPARABLE" | "DIFFERENT_DATES" | "UNKNOWN";
  reviewRequired: true; provesInaccuracy: false;
};
```

## Operaciones y significado de los datos

EXP 4,320 vs EQ 0 produce diferencia de 4,320 sólo como descripción; revisar fechas antes de inferir conflicto. Cero negatives con cobertura incompleta no es «sin negativos».

## Verificación concreta

Balances distintos/diferente fecha; historial 30 late vs current; reporte parcial; charge-off correcto; ownership contradictorio.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Anomalías enlazan origen y fecha; ningún negativo se convierte automáticamente en disputa; contratos separan hechos e interpretación.

Guarda evidencia en `docs/plan-crm/evidencias/T15.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Desactivar regla ruidosa por versión; conservar anomalías históricas y revisión. No borrar información negativa del reporte.

## Prompt listo para Cursor

```text
Ejecuta T15 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T15-anomalias.md dentro de docs/plan-crm.
Comprueba dependencias: T11. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T15.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[ARQUITECTURA](../referencias/ARQUITECTURA.md) · [CONTRATOS-DE-DATOS](../referencias/CONTRATOS-DE-DATOS.md)
