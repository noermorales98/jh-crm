# T08 · Revisar importaciones y confirmar snapshots de forma atómica

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Operación
- **Dependencias:** T06, T07
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Permitir corregir manualmente propuestas y confirmar únicamente datos suficientes para cada uso.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Pantalla actual de confirmación de importación, guardados manuales, snapshot builder y permisos staff/cliente.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Presentar dato propuesto, fuente redactada, calidad y advertencias por campo. Mantener la edición manual como camino válido.
2. Exigir revisión de campos críticos y coincidencias ambiguas antes de publicar métricas certificadas. Datos incompletos pueden guardarse como borrador.
3. Usar control de versión para evitar que dos revisores sobrescriban decisiones. Confirmar atómicamente revisión, identidad y snapshot.
4. Doble clic/reintento debe devolver el mismo resultado confirmado. Edición posterior crea revisión, no muta la confirmada.
5. Dejar claras las acciones permitidas: una extracción confirmada no confirma una inexactitud ni autoriza una disputa.
6. Invalidar cache de derivados al confirmar revisión nueva; registrar autor y motivo de corrección.

## Código o contrato de implementación

```ts
type ConfirmImport = {
  importJobId: string; expectedRevision: number; idempotencyKey: string;
  reviewedFieldIds: string[]; identityDecisionIds: string[];
};
// Contexto de organización y actor se deriva del servidor autenticado.
```

## Operaciones y significado de los datos

Contadores de UI deben distinguir confirmados/total, desconocidos y en conflicto. «3/3 scores revisados» no significa tres modelos válidos para underwriting.

## Verificación concreta

Doble confirmación concurrente; dos revisores con versión distinta; edición manual; score sin modelo; PDF parcial; usuario sin permiso.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Confirmación idempotente y auditada; campos críticos pendientes bloquean sólo las salidas que los necesitan. UI nunca convierte borrador en reporte final.

Guarda evidencia en `docs/plan-crm/evidencias/T08.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Desactivar confirmación v2 si hay regresión; conservar borradores y revisiones. No borrar snapshots ya vinculados a documentos.

## Prompt listo para Cursor

```text
Ejecuta T08 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T08-revision-confirmacion.md dentro de docs/plan-crm.
Comprueba dependencias: T06, T07. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T08.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[ARQUITECTURA](../referencias/ARQUITECTURA.md) · [CONTRATOS-DE-DATOS](../referencias/CONTRATOS-DE-DATOS.md)
