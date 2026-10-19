# T01 · Retirar afirmaciones y salidas financieras sin respaldo

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Corrección inmediata
- **Dependencias:** T00
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Evitar que la interfaz, API, PDF o plan exportado prometan puntos FICO o montos calculados por bandas inventadas.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Catálogo de acciones, scoreImpact, AU, funding-estimate, funding-prep, traducciones, exports, DTOs y vistas del cliente descritas por el informe.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Buscar textos y constantes de +40/+100 FICO, AU máximo 3 o ≥15k, 720/10%/40k universales y bandas genéricas de fondeo.
2. Identificar el origen de cada umbral. Una política interna puede conservarse etiquetada, pero no producir elegibilidad universal.
3. Deshabilitar el estimador sin respaldo en servicio y contratos; no basta ocultar una tarjeta React mientras la API sigue devolviendo un monto.
4. Reemplazar con «requiere programa/datos» y motivos. No crear un score 0–100 de preparación sin definición.
5. Revisar cartas y PDFs guardados como históricos: conservar originales y aplicar copy nuevo sólo a nuevas salidas. No reescribir documentos enviados.

## Código o contrato de implementación

```ts
type FundingEstimate = {
  status: "UNAVAILABLE";
  amount: null;
  reason: "PROGRAM_AND_VERIFIED_INPUTS_REQUIRED";
};
const unavailable: FundingEstimate = {
  status: "UNAVAILABLE", amount: null,
  reason: "PROGRAM_AND_VERIFIED_INPUTS_REQUIRED"
};
```

Adaptar el contrato existente y sus consumidores; no introducir compatibilidad que siga mostrando el monto anterior.

## Operaciones y significado de los datos

No reemplazar bandas de score por nuevos multiplicadores. 720, 10% y $40,000 no se convierten en ecuación de aprobación.

## Verificación concreta

API y export no incluyen monto arbitrario; ningún incremento de puntos en acciones nuevas; UI explica qué falta sin mostrar ceros ficticios.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Búsqueda enfocada y revisión de consumidores/exports documentadas; salida sin respaldo retirada de todas las superficies activas. Se mantienen funciones válidas de lectura.

Guarda evidencia en `docs/plan-crm/evidencias/T01.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Revertir defectos de UI selectivamente; mantener apagadas las predicciones sin respaldo incluso si se revierte el motor v2.

## Prompt listo para Cursor

```text
Ejecuta T01 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T01-contencion.md dentro de docs/plan-crm.
Comprueba dependencias: T00. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T01.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[FUENTES](../referencias/FUENTES.md) · [ARQUITECTURA](../referencias/ARQUITECTURA.md)
