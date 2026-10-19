# T05 · Proponer y revisar identidad de cuentas entre burós

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Identidad
- **Dependencias:** T03, T04, T24
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Vincular una misma cuenta real a varias observaciones conservando cuentas distintas y conflictos.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Deduplicación de action-plan y otros servicios; relación canónica de T03; búsqueda de acreedores y revisión manual.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Separar duplicado de extracción (misma fila repetida por overlap) de identidad de cuenta entre burós o fechas.
2. Generar candidatos usando acreedor/alias, sufijo, apertura, familia y otros identificadores disponibles; explicar señales y contradicciones.
3. No incluir bureau como parte de identidad de la cuenta; sí conservarlo en observaciones. No usar balance como identificador estable.
4. Mantener candidatos ambiguos sin unir. Inicialmente toda unión entre burós requiere revisión; no activar pesos ilustrativos como auto-merge.
5. Revisar el conjunto completo antes de unir; evitar fusiones transitivas A≈B≈C con incompatibilidades A/C.
6. Implementar merge/split revisable, versionado y con audit log. Verificar scope en cada operación.

## Código o contrato de implementación

Código orientador: [matching conservador](../ejemplos/04-MATCHING-Y-REGLAS.md).

```ts
type IdentityDecision = {
  observationIds: string[]; canonicalId: string | null;
  status: "UNLINKED" | "PROPOSED" | "CONFIRMED";
  signals: string[]; conflicts: string[];
  reviewedBy: string | null; identityVersion: number;
};
```

## Operaciones y significado de los datos

La fórmula de similitud del informe era un ejemplo, no un modelo calibrado. Si se usa un score técnico de ranking, registrar pesos y features faltantes; no llamarlo probabilidad. Tres filas de una Visa deben terminar en 1 cuenta tras revisión.

## Verificación concreta

Visa en 3 burós; dos Chase con igual sufijo; alias; fechas distintas; campos faltantes; A-B-C contradictorios; intento cross-tenant; split restaura dos identidades.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Unión explicable y reversible; ninguna fusión ambigua automática. Métricas aún no consumen candidatos propuestos como cuentas verificadas.

Guarda evidencia en `docs/plan-crm/evidencias/T05.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Desactivar nuevas propuestas y revertir decisiones con split auditado. Conservar la versión de identidad usada por snapshots previos.

## Prompt listo para Cursor

```text
Ejecuta T05 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T05-identidad-canonica.md dentro de docs/plan-crm.
Comprueba dependencias: T03, T04, T24. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T05.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[ARQUITECTURA](../referencias/ARQUITECTURA.md) · [MIGRACIONES-Y-RECUPERACION](../referencias/MIGRACIONES-Y-RECUPERACION.md)
