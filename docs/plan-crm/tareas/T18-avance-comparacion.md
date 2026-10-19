# T18 · Comparar reportes y mostrar cambios observados

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Avance
- **Dependencias:** T17, T09, T06
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Medir cambios entre reportes compatibles sin atribuirlos automáticamente a una disputa o a J&H.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Comparadores actuales, outcomes DELETED/UPDATED/VERIFIED/UNCHANGED/NEW y reportes PDF de avance.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Comparar snapshots confirmados usando versiones de identidad y detección de split/merge revisados.
2. Comparar campos por buró y fecha; scores usan comparabilidad T09. No mezclar fuentes.
3. Para cuenta ausente, verificar cobertura equivalente de ambos reportes. Si nuevo reporte es parcial, resultado INSUFFICIENT_COVERAGE.
4. Separar NOT_PRESENT observado de DELETED comunicado por respuesta formal. Conservar categorías actuales con origen de la afirmación.
5. Mostrar causas desconocidas; cambio posterior a ronda no prueba causalidad.
6. Guardar IDs/revisiones comparadas y policyVersion para reproducir el reporte exportado.

## Código o contrato de implementación

```ts
type ChangeResult = {
  kind: "UNCHANGED" | "UPDATED" | "NEW" | "NOT_PRESENT" | "INSUFFICIENT_COVERAGE";
  previousObservationId: string | null; currentObservationId: string | null;
  formalDisposition: string | null; responseDocumentId: string | null;
  causalClaim: null;
};
```

## Operaciones y significado de los datos

Balance 8,400→2,900 = −5,500 del saldo observado. Score delta sólo si comparable. NOT_PRESENT no se suma automáticamente como «eliminación lograda».

## Verificación concreta

Cuenta desaparece en completo/parcial; identidad corregida; score distinto modelo; respuesta VERIFIED con saldo cambiado; nueva cuenta y distinto buró.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Avance describe hechos por fuente y cobertura; ningún claim automático «J&H eliminó». Export y UI coinciden.

Guarda evidencia en `docs/plan-crm/evidencias/T18.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Usar comparación manual de observaciones confirmadas; conservar respuestas y reportes históricos sin recalcular sus afirmaciones.

## Prompt listo para Cursor

```text
Ejecuta T18 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T18-avance-comparacion.md dentro de docs/plan-crm.
Comprueba dependencias: T17, T09, T06. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T18.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[ARQUITECTURA](../referencias/ARQUITECTURA.md) · [QA-Y-ACEPTACION](../referencias/QA-Y-ACEPTACION.md)
