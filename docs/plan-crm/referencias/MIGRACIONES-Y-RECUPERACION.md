# Migración incremental y recuperación

[Volver al índice](../README.md)

## Antes de cambiar datos

T00 verifica proveedor, versión de Prisma, migraciones existentes y permisos del entorno. T03 diseña relaciones e índices sobre el esquema real. No se presume que un proveedor soporte índices parciales, enums o restricciones compuestas de la misma forma que otro.

## Expandir → poblar → comparar → conmutar

1. **Expandir:** tablas nuevas y FK opcionales, sin borrar CreditItem ni sustituir importaciones. El diff SQL debe revisarse. No usar `db push` ni `migrate reset` contra datos existentes.
2. **Poblar:** job por organización/cliente, paginado por cursor estable, checkpoint, dry-run, idempotencia y métricas. Materializar sólo coincidencias revisadas o seguras según política aprobada; ambiguas quedan pendientes. No bloquear la aplicación durante todo el recorrido.
3. **Comparar:** cálculos nuevos en sombra, identificando diferencias esperadas por deduplicación y diferencias inesperadas. El valor antiguo no es una verdad de referencia.
4. **Conmutar:** flag por organización, métricas v2 junto a procedencia. Activar sólo después de fixtures, revisión de importaciones y pruebas de permisos.
5. **Consolidar:** retirar lecturas antiguas en una tarea futura separada después del período de observación. Este plan no elimina columnas históricas.

## Idempotencia y aislamiento

Cada vínculo incluye cliente/organización. El identificador idempotente depende de documento o revisión + extractorVersion + contexto, con restricción real en BD y política explícita de reimportación. Reimportar el mismo archivo no genera duplicados accidentales; reprocesarlo con nueva versión crea una revisión trazable, no sobrescritura silenciosa.

Dos workers procesando el mismo job se coordinan con la estrategia del stack existente: locking, claim atómico o índice único y retry. No basarse únicamente en comprobar «si existe» antes de insertar.

## Revertir una lectura nueva

Apagar flag y recuperar lectura segura/informativa previa cuando sea válida. Las bandas ficticias de fondeo y promesas de puntos siguen apagadas. Conservar tablas y vínculos aditivos; no ejecutar un rollback que borre evidencia recién producida.

## Recuperar una unión incorrecta

Registrar operación de split, IDs anteriores/nuevos, motivo, actor y versión de identidad. Crear snapshot revisado; mantener el histórico referenciando la versión antigua. Invalidar derivados sólo para la nueva vista. Nunca cambiar retrospectivamente una carta enviada.

## Ensayo obligatorio en T06

Capturar conteos iniciales, ejecutar lote, interrumpirlo tras un checkpoint, reanudar y ejecutar otra vez. La segunda ejecución completa no cambia conteos. Recuperar una cuenta unida mal en un fixture. Probar restauración del respaldo en un entorno aislado antes de dar por probado el plan de recuperación.

## Comandos

No hay un comando de migración universal para este repositorio sin T00. Usa el gestor, scripts y estrategia Prisma ya instalados. T03 registra comandos exactos para generar, validar y aplicar en staging. Revisión de SQL y resultado de ensayo se guardan en `evidencias/T03.md` y `evidencias/T06.md` sin credenciales.
