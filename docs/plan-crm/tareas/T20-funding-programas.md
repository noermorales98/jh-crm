# T20 · Evaluar preparación por programas y reglas versionadas

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Funding readiness
- **Dependencias:** T09, T10, T11, T24
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Sustituir qualified global por evaluación explicable de requisitos de un producto concreto.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

funding-prep, qualified, funding-estimate y schema de programas/productos si existe; admin de reglas.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Diseñar rulesets con producto, fuente, tipo INTERNAL/VERIFIED_LENDER, versión, vigencia, ámbito y revisión.
2. Implementar operadores permitidos y tipos; nunca evaluar código/SQL arbitrario de reglas configuradas.
3. Evaluar requisitos individuales PASS/FAIL/UNKNOWN con datos completos/confirmados y modelo de score requerido.
4. Política de burós la define el programa; no aprobar porque uno cualquiera pasó una matriz genérica. Faltantes nunca pasan.
5. Agregar sólo requisitos obligatorios; opcionales quedan como información. Ruleset vacío, vencido o sin respaldo aplicable → REVIEW.
6. Panel muestra requisitos satisfechos/fallidos/desconocidos y fuentes. Programas de demostración marcados internos, no ofertas; sin monto genérico.

## Código o contrato de implementación

Ver `readiness` en [motor](../ejemplos/01-MOTOR-DETERMINISTA.md) y [contrato de reglas](../ejemplos/04-MATCHING-Y-REGLAS.md).

```ts
type ProgramEvaluation = {
  programId: string; version: number; snapshotId: string;
  status: "PASS" | "FAIL" | "REVIEW";
  meaning: "MATCHES_RECORDED_RULES_ONLY";
  approvedAmount: null;
};
```

## Operaciones y significado de los datos

Falta edad: UNKNOWN, nunca PASS. Algún obligatorio FAIL → FAIL; sólo UNKNOWN/PASS → REVIEW; todos PASS y conjunto no vacío → PASS. No usar promedio de scores.

## Verificación concreta

Regla sin fuente, vencida, score incompatible, edad null, cero reglas, opcional FAIL, diferentes burós y dato parcial. Comparar ratios exactos, no bps redondeados.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Resultado trazable a snapshot y ruleset; ningún PASS se presenta como aprobación. Admin valida reglas y conserva versiones anteriores.

Guarda evidencia en `docs/plan-crm/evidencias/T20.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Desactivar evaluación del programa y mostrar datos insuficientes, preservando historial y configuración. El estimador sin respaldo sigue deshabilitado.

## Prompt listo para Cursor

```text
Ejecuta T20 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T20-funding-programas.md dentro de docs/plan-crm.
Comprueba dependencias: T09, T10, T11, T24. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T20.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[MATEMATICAS](../referencias/MATEMATICAS.md) · [FUENTES](../referencias/FUENTES.md)
