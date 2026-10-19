# T26 · Integrar corpus de aceptación y checks en CI

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** QA
- **Dependencias:** T23, T25
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Convertir casos sintéticos del dominio en regresiones útiles sin duplicar la infraestructura existente.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

CI y smokes actuales descritos por el informe; runner, factories, DB de test y tests E2E disponibles.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Leer CI actual; conservar lint/typecheck/build y pruebas útiles. No afirmar que no existe CI.
2. Implementar F01–F30 del catálogo según nivel adecuado. Identidad usa corpus etiquetado; parser usa fixtures sintéticos controlados.
3. Cálculos prueban resultados esperados y propiedades; datos prueban transacciones/idempotencia/scope; UI prueba recorrido y estados relevantes.
4. Agregar chequeos de ausencia de predicciones en salidas nuevas con alcance preciso; evitar tests que sólo busquen un string en todo el repositorio histórico.
5. Separar revisión de procedencia de reglas de ejecución aritmética. Un test no valida underwriting.
6. Registrar comandos reproducibles, dependencias y tests no ejecutables por entorno. No usar PDFs o credenciales reales en CI.

## Código o contrato de implementación

Base de aritmética: [comprobaciones de referencia](../ejemplos/02-PRUEBAS-DE-REFERENCIA.md).

```ts
// En el runner existente:
// given: fixture F01 con tres observaciones de la misma Visa confirmadas
// when: buildSnapshot + calculateRevolvingMetrics
// then: canonicalCount=1, totalLimit=1000000 centavos, totalBalance=800000
```

La prueba atraviesa servicios reales, no un mock que ya devuelve el resultado esperado.

## Operaciones y significado de los datos

Probar invariantes: Σpagos≤presupuesto; B después≥0; misma entrada→misma salida; duplicar una observación no duplica la cuenta; UNKNOWN obligatorio no pasa.

## Verificación concreta

F01–F30 con resultado y runner documentados; fallo deliberado de una regla crítica se detecta; fixtures sin datos reales.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

CI integrado y verde para cambios del plan, o bloqueos específicos marcados sin fingir éxito. Corpus enlaza tarea, contrato y esperado.

Guarda evidencia en `docs/plan-crm/evidencias/T26.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Revertir únicamente cambios de infraestructura que rompan CI; conservar regresiones de dominio y no marcar checks como opcionales para ocultar fallos.

## Prompt listo para Cursor

```text
Ejecuta T26 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T26-corpus-ci.md dentro de docs/plan-crm.
Comprueba dependencias: T23, T25. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T26.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[QA-Y-ACEPTACION](../referencias/QA-Y-ACEPTACION.md) · [FUENTES](../referencias/FUENTES.md)
