# T02 · Definir contratos de datos, calidad y cálculo

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Dominio
- **Dependencias:** T00
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Establecer significado de cada campo antes de añadir lógica o migraciones.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Tipos TypeScript/Zod actuales de CreditItem, CreditReport, Score, snapshots y DTOs; convenciones Decimal, fechas y errores.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Comparar el diccionario propuesto con el schema real; registrar campos reutilizables y adiciones.
2. Definir familia, ownership, estado, calidad por campo, revisión y procedencia. No colapsar UNKNOWN con false/0.
3. Definir dinero/moneda, bps, fechas parciales y alcance de métricas. Establecer conversión Decimal ↔ centavos sin pérdida.
4. Crear schemas/tipos compartidos en la ubicación existente, con validación de entradas y salidas.
5. Documentar política de scores comparables, snapshots y readiness. Firmar una decisión técnica del equipo/propietario en el registro, sin fingir validación de un prestamista.

## Código o contrato de implementación

```ts
type FieldValue<T> = {
  value: T | null;
  quality: "KNOWN" | "MISSING" | "INFERRED" | "CONFLICT" | "INVALID";
  source: { reportId: string; page: number | null; blockId: string | null };
  review: "PROPOSED" | "CONFIRMED" | "REJECTED";
};
// Un valor 0 con quality KNOWN es válido; null no equivale a 0.
```

## Operaciones y significado de los datos

Fijar unidades: 1000 bps = 10%; USD 10.25 = 1025 centavos. No usar `Number(null)` ni operadores `||` para valores crediticios.

## Verificación concreta

Parsear cero, null, límite desconocido, fecha parcial y moneda distinta. La serialización API conserva diferencias; una lectura legacy no inventa datos.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Contratos compartidos publicados y adoptados por un adaptador de borde; casos de ausencia y precisión cubiertos. MAPA-REAL actualizado con ubicación.

Guarda evidencia en `docs/plan-crm/evidencias/T02.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Conservar DTO legacy detrás de adaptador temporal. Revertir consumidores nuevos sin borrar datos que la migración añadirá.

## Prompt listo para Cursor

```text
Ejecuta T02 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T02-contratos.md dentro de docs/plan-crm.
Comprueba dependencias: T00. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T02.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[CONTRATOS-DE-DATOS](../referencias/CONTRATOS-DE-DATOS.md) · [MATEMATICAS](../referencias/MATEMATICAS.md)
