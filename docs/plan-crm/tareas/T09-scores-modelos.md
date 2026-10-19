# T09 · Guardar modelos de score y comparar sólo observaciones compatibles

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Scores
- **Dependencias:** T03, T08
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Evitar que un número de score se use sin conocer su modelo o se compare con otro incompatible.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Score por buró, histórico, promedio de action-plan, gráficas y fuentes de score del importador.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Persistir familia, versión, variante, buró, fecha, reason codes y fuente. Datos legacy quedan UNKNOWN salvo evidencia.
2. Mostrar score reportado aunque el modelo sea desconocido, con etiqueta y limitación de uso.
3. Implementar comparabilidad por identidad de modelo y buró conocidos e iguales; fechas ordenadas y proveedor compatible.
4. No alimentar reglas de producto con promedio de tres scores. Si se conserva promedio, limitarlo a KPI informativo con etiqueta.
5. Mantener reason codes exactamente como fuente; explicaciones traducidas no deben inventar códigos nuevos.
6. Asegurar que UI, export y APIs comparten contrato de comparabilidad y ausencia.

## Código o contrato de implementación

Código base: función `scoreDelta` en [motor determinista](../ejemplos/01-MOTOR-DETERMINISTA.md).

```ts
type ScoreComparison = {
  comparable: boolean; delta: number | null;
  reason: "SAME_MODEL" | "MISSING_MODEL" | "DIFFERENT_MODEL" | "INVALID_DATES";
};
```

## Operaciones y significado de los datos

FICO8 EX 670 → FICO8 EX 695 = +25 con fechas válidas. Vantage3 670 → FICO8 695 no es +25. Dos versiones null no son iguales en el sentido de comparabilidad.

## Verificación concreta

Modelos distintos, burós distintos, variante distinta, fecha faltante, rango por modelo y score cero inválido según el modelo.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Ninguna comparación incompatible genera delta; modelo visible en todas las superficies; rulesets reciben observación específica, no promedio.

Guarda evidencia en `docs/plan-crm/evidencias/T09.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Conservar score legacy como lectura informativa. Revertir gráfico sin volver a publicar deltas incompatibles.

## Prompt listo para Cursor

```text
Ejecuta T09 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T09-scores-modelos.md dentro de docs/plan-crm.
Comprueba dependencias: T03, T08. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T09.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[MATEMATICAS](../referencias/MATEMATICAS.md) · [CONTRATOS-DE-DATOS](../referencias/CONTRATOS-DE-DATOS.md)
