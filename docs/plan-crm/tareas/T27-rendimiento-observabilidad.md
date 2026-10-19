# T27 · Medir rendimiento, costos técnicos y reproducibilidad

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Rendimiento
- **Dependencias:** T26
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Optimizar consultas y pipeline con medidas sobre datos representativos, sin sacrificar exactitud o seguridad.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Queries por cliente/snapshot, jobs de parser/OCR, traces/logs, índices y cache; límites del hosting real.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Medir baseline en staging con tamaño representativo y datos sintéticos: latencia p50/p95, consultas, duración del job y costo técnico de extracción.
2. Detectar N+1 al resolver observaciones/cuentas; batch scoped y seleccionar columnas necesarias. Verificar índices con el proveedor real.
3. Paginar listas grandes y procesar ventanas con concurrencia limitada y retries acotados.
4. Cache por org/cliente/snapshot/versión; invalidar al confirmar revisión nueva. No cache compartida que filtre datos.
5. Instrumentar errores de parsing/cobertura, conflictos de identidad, UNKNOWN por regla, reintentos y versión de cálculo sin PII.
6. Definir presupuesto de rendimiento propio a partir de mediciones y uso real; no prometer un p95 arbitrario antes de medir.

## Código o contrato de implementación

```ts
type CreditTelemetry = {
  event: "IMPORT_COMPLETED" | "METRIC_COMPUTED" | "RULE_EVALUATED";
  durationMs: number; policyVersion: string;
  itemCount: number; qualityStatus: string; correlationId: string;
};
// No reportar nombre, SSN, PDF, saldo individual ni texto del consumidor.
```

## Operaciones y significado de los datos

p95 sobre muestra documentada; costo por importación = componentes técnicos observados, no predicción de fondeo. Comparar mismo fixture/entorno antes y después. Total procesado nunca excede límites sin estado explícito.

## Verificación concreta

Reporte de 250 cuentas, dos usuarios concurrentes, cache tras revisión, retry y OCR lento; comparar resultados antes/después de optimizar.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Mediciones reproducibles y mejoras sin cambio de semántica; no N+1 relevante ni cache cruzada; logs seguros y límites operativos claros.

Guarda evidencia en `docs/plan-crm/evidencias/T27.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Deshabilitar cache/concurrencia nueva, volver lectura no cacheada correcta y conservar telemetría segura.

## Prompt listo para Cursor

```text
Ejecuta T27 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T27-rendimiento-observabilidad.md dentro de docs/plan-crm.
Comprueba dependencias: T26. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T27.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[ARQUITECTURA](../referencias/ARQUITECTURA.md) · [QA-Y-ACEPTACION](../referencias/QA-Y-ACEPTACION.md)
