# T11 · Corregir utilización y estructura revolving sin duplicación

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Motor matemático
- **Dependencias:** T06, T08, T09, T10
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Calcular balances, límites y utilización sobre cuentas únicas elegibles con calidad explícita.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Totales de action-plan, cards/openCards/cardsGe2k/cardsGe5k, desglose por buró y componentes que vuelven a sumar CreditItem.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Centralizar selección de cuentas canónicas abiertas REVOLVING. Excluir charge sin límite, installment y mortgage de este cálculo.
2. Implementar vistas por buró y consolidada usando snapshot policy; balance/límite proceden de una observación elegida coherente.
3. Separar INDIVIDUAL, JOINT, AU y UNKNOWN. Exponer subtotales y cobertura.
4. Calcular utilización individual, agregada y máxima, sumas y conteos únicos. No promediar ratios individuales.
5. Cero saldo es conocido; límite faltante/cero no es división válida. No recortar >100%. Saldo a favor conserva raw y política.
6. Reemplazar fórmulas duplicadas de consumidores con este servicio y añadir discrepancias en vez de ocultarlas.

## Código o contrato de implementación

Funciones de referencia: `aggregate` y `utilizationBps` en [motor](../ejemplos/01-MOTOR-DETERMINISTA.md).

```ts
// Filtrado conceptual; estado y ownership se resuelven desde snapshot confirmado.
const eligible = snapshot.accounts.filter(a =>
  a.family === "REVOLVING" && a.status === "OPEN" && a.ownership === "INDIVIDUAL");
// No volver a sumar todas las observaciones de cada cuenta.
```

## Operaciones y significado de los datos

A/B/C del documento: 20k límite, 8.5k saldo, 42.5%; máximo 80%. Visa 10k en tres burós sigue siendo 10k. Con una cuenta de límite desconocido, el total completo es PARTIAL.

## Verificación concreta

F01/F03/F05/F06/F07/F08/F22/F28; dos tarjetas mismo banco; vista por buró divergente; lectura consolidada con fuentes.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Todos los consumidores comparten fórmula; cobertura y selección visibles; cuentas únicas sin confundir identidades pendientes con confirmadas.

Guarda evidencia en `docs/plan-crm/evidencias/T11.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Apagar métricas consolidadas v2 y presentar sólo vistas por buró válidas o datos insuficientes. No restaurar sumas infladas como resultados fiables.

## Prompt listo para Cursor

```text
Ejecuta T11 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T11-metricas-revolving.md dentro de docs/plan-crm.
Comprueba dependencias: T06, T08, T09, T10. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T11.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[MATEMATICAS](../referencias/MATEMATICAS.md) · [ARQUITECTURA](../referencias/ARQUITECTURA.md)
