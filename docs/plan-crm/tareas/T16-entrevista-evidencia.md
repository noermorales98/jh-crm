# T16 · Capturar afirmaciones del cliente y documentos de soporte

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Revisión de disputa
- **Dependencias:** T15, T24
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Construir afirmaciones concretas antes de redactar cartas, sin inventar el testimonio del consumidor.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Portal, formulario de disputa, archivos privados, evidence links y autorizaciones de cliente/staff.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Preguntar si reconoce la cuenta y si cada dato es correcto: sí/no/no sé. No preseleccionar «no». Capturar texto del consumidor.
2. Vincular campo exacto, buró, valor reportado, afirmación y documentos. Registrar confirmación y revisión staff separadas.
3. Verificar pertenencia de cada documento, permisos de descarga y vigencia del acceso. Archivos privados con URLs de corta duración si el stack las usa.
4. Implementar estados borrador, confirmado por cliente, revisado, listo para borrador de carta y cerrado/sin acción.
5. Permitir que el cliente confirme que el negativo es correcto; ese resultado no genera afirmación falsa.
6. Cualquier redacción IA se limita al contenido confirmado y omite campos ausentes, sin añadir identidad robada, pagos o fechas que no constan.

## Código o contrato de implementación

```ts
type DisputeAssertionInput = {
  creditItemId: string; field: string; reportedValue: unknown;
  consumerClaim: unknown; reason: string;
  evidenceDocumentIds: string[]; answer: "CORRECT" | "INCORRECT" | "UNKNOWN";
  expectedRevision: number;
};
// Autor, cliente y organización se verifican en contexto servidor.
```

## Operaciones y significado de los datos

No hay fórmula financiera. Guardas de estado: respuesta INCORRECT + afirmación específica + revisión aplicable; UNKNOWN nunca satisface confirmación. Documentos requeridos dependen del caso y política, no un contador universal.

## Verificación concreta

Correcto/no sé; evidencia de otro cliente; revocar documento; edición concurrente; revisor distinto del actor del cliente; IA intenta inventar motivo.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Cada afirmación tiene origen, actor, revisión y evidencias permitidas; borrador sólo con hechos confirmados. Sin envíos ni disputas automáticas.

Guarda evidencia en `docs/plan-crm/evidencias/T16.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Deshabilitar generación de carta y conservar entrevista/afirmación como borrador. No borrar documentos ni declaraciones del cliente.

## Prompt listo para Cursor

```text
Ejecuta T16 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T16-entrevista-evidencia.md dentro de docs/plan-crm.
Comprueba dependencias: T15, T24. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T16.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[CONTRATOS-DE-DATOS](../referencias/CONTRATOS-DE-DATOS.md) · [FUENTES](../referencias/FUENTES.md)
