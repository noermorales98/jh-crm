# T17 · Gestionar rondas, recepción y respuestas con trazabilidad

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Dispute workflow
- **Dependencias:** T16, T25
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Usar el flujo existente de rondas sin convertirlo en secuencias o plazos legales universales.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

CreditRound, DisputeItem scope/method, plantillas de cartas, tracking, responses y cron de seguimiento existentes.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Conservar scope/method y sus tests actuales. Vincular cada ítem a assertions/revisión y evidencia de T16.
2. Separar borrador, listo, enviado, recibido, en revisión y respondido. Capturar destinatario y canal por envío.
3. Distinguir fecha de recepción real, estimada y desconocida. Política versionada determina plazos cuando sea aplicable.
4. Sin política validada o recepción requerida conocida, mostrar fecha pendiente de determinar; no usar automáticamente 30/15/30.
5. Registrar respuesta oficial y disposición; mantener overrides con actor, motivo y documento.
6. Generación y envío son acciones distintas. Para un canal externo, exigir autorización y controles aplicables; el ensayo usa simulador sin enviar.

## Código o contrato de implementación

```ts
type RoundTiming = {
  sentAt: string | null; receivedAt: string | null;
  estimatedReceivedAt: string | null;
  deadlinePolicyId: string | null; deadlinePolicyVersion: number | null;
  dueAt: string | null; dueAtStatus: "VERIFIED_POLICY" | "ESTIMATED" | "UNDETERMINED";
};
```

## Operaciones y significado de los datos

Plazo = fecha inicial definida por política + duración según calendario/condiciones aplicables. No fijar 30 o 45 días como valor universal; casos sin datos conservan null.

## Verificación concreta

Draft no aparece como enviado; tracking tardío; recepción desconocida; respuesta contradice reporte; retry de envío; override auditado y documentos privados.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Rondas conservan item/scope/method y fuentes; fechas tienen política y base; respuesta formal no se confunde con resultado inferido de PDF.

Guarda evidencia en `docs/plan-crm/evidencias/T17.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Apagar automatización y conservar gestión manual auditada. No revertir evidencia de envíos realizados ni repetir envíos por un timeout.

## Prompt listo para Cursor

```text
Ejecuta T17 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T17-rondas-respuestas.md dentro de docs/plan-crm.
Comprueba dependencias: T16, T25. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T17.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[CONTRATOS-DE-DATOS](../referencias/CONTRATOS-DE-DATOS.md) · [FUENTES](../referencias/FUENTES.md)
