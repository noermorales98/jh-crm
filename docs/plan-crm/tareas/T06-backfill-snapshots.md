# T06 · Poblar identidades y construir snapshots reproducibles

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Persistencia y migración
- **Dependencias:** T05
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Migrar observaciones existentes y publicar una vista consolidada sin cambiar históricos ni perder trazabilidad.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Jobs/batch existentes, snapshots de reportes, cachés y adaptadores de lectura; política v1 de selección.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Implementar dry-run por organización/cliente con conteos, candidatos y conflictos, sin mutar datos.
2. Crear job paginado por cursor estable, checkpoints e idempotencia protegida en BD. No juntar todo en una transacción gigante.
3. Vincular decisiones confirmadas de T05; dejar pendientes las ambiguas. Etiquetar completitud, no fingir que no existen cuentas sin resolver.
4. Construir snapshots con reporte/revisión, asOf, IDs usados y versiones. Elegir observación completa de una cuenta; no mezclar balance/límite de fuentes distintas.
5. Resolver empates/conflictos conforme a política documentada. No arrastrar cuentas antiguas a un reporte parcial sin advertencia.
6. Ejecutar en sombra y probar interrupción/reanudación, doble ejecución y recuperación de una unión incorrecta.

## Código o contrato de implementación

```ts
type SnapshotBuildInput = {
  organizationId: string; clientId: string; creditCaseId: string;
  confirmedReportRevisionIds: string[]; asOf: string;
  identityVersion: number; selectionPolicyVersion: string;
};
// Snapshot guarda IDs y revisiones, no sólo sumas derivadas.
```

## Operaciones y significado de los datos

Un límite 10k observado tres veces produce 10k consolidado, no 30k. La selección por asOf excluye el futuro. Conteo posterior a reejecutar el mismo backfill no aumenta.

## Verificación concreta

Interrumpir a mitad y reanudar; dos workers; repetir; conflicto de fechas; split; lectura histórica conserva sus resultados; query cross-tenant denegada.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Backfill ensayado, idempotente y recuperable; snapshots reproducibles con fuentes y cobertura; flag nuevo aún controlado por organización.

Guarda evidencia en `docs/plan-crm/evidencias/T06.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Apagar lectura v2; conservar datos aditivos. Recuperar identidad con operación auditada, crear snapshot revisado e invalidar sólo derivados afectados.

## Prompt listo para Cursor

```text
Ejecuta T06 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T06-backfill-snapshots.md dentro de docs/plan-crm.
Comprueba dependencias: T05. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T06.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[ARQUITECTURA](../referencias/ARQUITECTURA.md) · [MIGRACIONES-Y-RECUPERACION](../referencias/MIGRACIONES-Y-RECUPERACION.md)
