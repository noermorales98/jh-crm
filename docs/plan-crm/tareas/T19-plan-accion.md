# T19 · Generar un plan de acción explicable y operativo

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Action Center
- **Dependencias:** T12, T14, T15, T16
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Reemplazar promesas por prioridades basadas en datos, revisión y tareas con seguimiento.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Catálogo action-plan, prioridades, responsables, status y recordatorios; consumidores actuales del plan.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Derivar acciones desde métricas/anomalías confirmadas y datos faltantes; cada recomendación enlaza regla y observación.
2. Priorizar verificar integridad/datos, atender obligaciones reales y revisar discrepancias; no ordenar por puntos FICO supuestos.
3. Definir prioridad ordinal operativa con tabla explícita y desempate estable. No disfrazar prioridad de probabilidad financiera.
4. Persistir responsable, motivo, fecha objetivo, estado y nota de revisión. Evitar recrear duplicados al recalcular un snapshot.
5. Incluir escenario de utilización seleccionado y entrevista pendiente cuando corresponda; AU se describe sin receta fija.
6. Una explicación IA sólo redacta acciones estructuradas, no altera prioridades, cifras ni acciones.

## Código o contrato de implementación

```ts
type Action = {
  idempotencyKey: string; kind: string; priority: "HIGH" | "MEDIUM" | "LOW";
  reasonCodes: string[]; observationIds: string[]; policyVersion: string;
  ownerId: string | null; dueAt: string | null;
  status: "TODO" | "IN_PROGRESS" | "DONE" | "DISMISSED";
  predictedScorePoints: null;
};
```

## Operaciones y significado de los datos

No calcular +40/+100 ni pesos ocultos. Prioridad es una ordenación definida y explicable. Clave de acción = cliente/snapshot o condición estable + tipo + campo según política de deduplicación.

## Verificación concreta

Recalcular sin duplicar; datos incompletos generan revisión; negativo correcto no genera carta falsa; completar/descartar conserva motivo; IA no cambia números.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Cada acción puede justificarse y cerrarse con evidencia; sin promesas, límites universales ni fórmulas de score.

Guarda evidencia en `docs/plan-crm/evidencias/T19.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Deshabilitar generación nueva y mantener tareas históricas editables. No borrar trabajo staff ni restaurar el catálogo de promesas.

## Prompt listo para Cursor

```text
Ejecuta T19 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T19-plan-accion.md dentro de docs/plan-crm.
Comprueba dependencias: T12, T14, T15, T16. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T19.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[ARQUITECTURA](../referencias/ARQUITECTURA.md) · [FUENTES](../referencias/FUENTES.md)
