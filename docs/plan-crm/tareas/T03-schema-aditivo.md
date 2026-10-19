# T03 · Preparar schema Prisma y migración aditiva

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Persistencia
- **Dependencias:** T02
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Añadir identidad, procedencia y entidades faltantes sin reemplazar CreditCase, CreditReport ni CreditItem.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Schema y migraciones reales; relaciones de organización/cliente/expediente, tablas de roles, documentos, snapshots y auditoría.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Diseñar CanonicalTradeline y FK opcional desde observaciones existentes; mantener balances en observaciones.
2. Añadir score family/version/variant, inquiries, assertions y revisión sólo donde falten; evitar duplicar entidades equivalentes.
3. Diseñar pertenencia con FK compuestas o invariantes equivalentes y validación transaccional. Indexar scopes de lectura y claves idempotentes.
4. Generar SQL con la versión Prisma instalada. Revisar bloqueos, índices, decimal, JSON y onDelete; no cascadas que borren evidencia.
5. Aplicar en BD aislada, validar schema/generación del cliente y compatibilidad con lectores anteriores. Registrar comandos exactos.
6. Dejar campos nuevos opcionales para datos legacy; no backfill masivo en esta tarea.

## Código o contrato de implementación

Patrón concreto: [03-PRISMA-ADITIVO.md](../ejemplos/03-PRISMA-ADITIVO.md).

```ts
// Invariante del servicio, además de las FK que soporte el esquema:
if (item.organizationId !== canonical.organizationId ||
    item.clientId !== canonical.clientId) throw new Error("SCOPE_MISMATCH");
```

La restricción en aplicación sola no sustituye una FK cuando el modelo permite imponerla.

## Operaciones y significado de los datos

Montos nuevos usan Decimal exacto con precisión documentada. No almacenar porcentajes en un campo monetario. Unicidad de sufijo/acreedor está prohibida: no identifican una cuenta universalmente.

## Verificación concreta

Datos legacy legibles; dos cuentas del mismo banco válidas; vínculo cruzado de cliente/organización rechazado; migración vacía y con datos sintéticos.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

SQL aditivo revisado, schema válido, cliente generado y ensayo aislado exitoso. Nueva FK comienza nullable, sin pérdida de filas ni cambios destructivos.

Guarda evidencia en `docs/plan-crm/evidencias/T03.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Volver lectores a versión compatible conservando columnas/tablas aditivas. Recuperar respaldo aislado si el ensayo falla; no prometer rollback automático del proveedor.

## Prompt listo para Cursor

```text
Ejecuta T03 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T03-schema-aditivo.md dentro de docs/plan-crm.
Comprueba dependencias: T02. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T03.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[CONTRATOS-DE-DATOS](../referencias/CONTRATOS-DE-DATOS.md) · [MIGRACIONES-Y-RECUPERACION](../referencias/MIGRACIONES-Y-RECUPERACION.md)
