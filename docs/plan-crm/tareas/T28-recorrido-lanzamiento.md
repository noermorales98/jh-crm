# T28 · Verificar el recorrido completo y preparar activación gradual

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Cierre de implementación
- **Dependencias:** T27
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Comprobar que todas las piezas funcionan juntas y dejar una activación revisable por organización.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Estado de todas las tareas, evidencias, flags, staging, runbook y configuración operativa pendiente.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Revisar que dependencias y aceptación de T00–T27 tienen evidencia; resolver bloqueos antes de afirmar completitud.
2. Ejecutar recorrido sintético: importar → revisar → confirmar → identidad → métricas → plan → entrevista → borrador de ronda → envío simulado → respuesta → reimportar → comparar → programa.
3. Repetir con datos parciales, modelos distintos, autorización insuficiente y tenant ajeno. Verificar UI/API/BD/exports.
4. Ensayar flag on/off, restauración y recuperación de unión errónea. Predicciones ficticias siguen apagadas en fallback.
5. Preparar runbook: flags, responsables, métricas a vigilar, recuperación y políticas/programas aún sin validar.
6. Entregar resumen revisable para la activación real según el flujo del proyecto. Esta tarea no publica, no migra producción, no envía disputas ni cobra por sí misma.

## Código o contrato de implementación

```text
Gate de activación por organización:
- migración ensayada y recuperación probada
- snapshots y métricas con cobertura definida
- corpus crítico y recorrido completo aprobados
- aislamiento y documentos privados comprobados
- sin promesas ni estimaciones sin respaldo
- programas/políticas pendientes quedan desactivados
- flag y observabilidad listos
```

## Operaciones y significado de los datos

Reproducir 10k/8k/10%=7k, A/B/C=42.5%, presupuesto ejemplo=41.5%, DTI=30%; reglas con UNKNOWN→REVIEW y modelo incompatible sin delta.

## Verificación concreta

Demostración completa con dos organizaciones; escenarios adversos; coherencia del PDF exportado; fallback no reintroduce errores.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Runbook, resultados end-to-end y pendientes explícitos entregados. HECHO significa preparación verificada en entorno de prueba, no aprobación automática de producción.

Guarda evidencia en `docs/plan-crm/evidencias/T28.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Apagar flags por organización, detener jobs nuevos y usar lectura segura. Preservar reportes, revisiones y acciones históricas; aplicar runbook ensayado.

## Prompt listo para Cursor

```text
Ejecuta T28 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T28-recorrido-lanzamiento.md dentro de docs/plan-crm.
Comprueba dependencias: T27. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T28.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[QA-Y-ACEPTACION](../referencias/QA-Y-ACEPTACION.md) · [MIGRACIONES-Y-RECUPERACION](../referencias/MIGRACIONES-Y-RECUPERACION.md)
