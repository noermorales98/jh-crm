# T25 · Modelar autorizaciones y políticas de servicio aplicables

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Operación y cumplimiento
- **Dependencias:** T03, T24
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Representar estados de documentos, autorización y elegibilidad operativa sin codificar conclusiones legales universales.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Contratos, disclosures, autorizaciones, pagos/cobros, firma y recordatorios; distinguir servicios de reparación de crédito de otros servicios J&H.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Inventariar tipo de servicio, jurisdicción, canal de venta y políticas existentes. Registrar fuente/revisión aplicable; usar entrada oficial D4 como referencia de revisión, no como política completa.
2. Guardar versión de contrato/disclosure, entrega, firma, autorización, eventos y revocaciones con documentos.
3. Definir decisiones operativas ALLOWED/BLOCKED/REVIEW por acción y servicio. Política no configurada/revisada → REVIEW; no habilitar cobro automáticamente.
4. Tratar ventana de cancelación, fechas y reglas de cobro según política validada aplicable. No inventar un calendario común ni bloquear sin análisis otros servicios no relacionados.
5. Integrar guardas previas a envío/automatizaciones/cobros que correspondan. Pruebas con simulador, sin mover dinero ni contactar terceros.
6. Mantener UI de revisión y audit log. Implementar el mecanismo puede completarse con políticas externas aún pendientes, dejando esas acciones deshabilitadas y documentadas.

## Código o contrato de implementación

```ts
type OperationDecision = {
  action: "SEND_DISPUTE" | "CHARGE_SERVICE";
  status: "ALLOWED" | "BLOCKED" | "REVIEW";
  serviceType: string; policyId: string | null; policyVersion: number | null;
  reasons: string[]; evidenceDocumentIds: string[];
};
```

## Operaciones y significado de los datos

Las fechas se calculan sólo desde eventos y política documentados. null de autorización no es consentimiento. Ningún score, número de rondas o días transcurridos autoriza por sí solo cobrar.

## Verificación concreta

Falta contrato/autorización/política; revocación; política vencida; servicio distinto; reintento de cobro simulado y doble evento.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Motor de estados probado y sin acciones externas reales. Toda política pendiente se lista; acciones relacionadas permanecen REVIEW/BLOCKED hasta validación aplicable.

Guarda evidencia en `docs/plan-crm/evidencias/T25.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Volver a revisión manual con registro; deshabilitar automatización de acciones afectadas conservando contratos, eventos y comprobantes.

## Prompt listo para Cursor

```text
Ejecuta T25 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T25-politicas-operativas.md dentro de docs/plan-crm.
Comprueba dependencias: T03, T24. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T25.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[FUENTES](../referencias/FUENTES.md) · [CONTRATOS-DE-DATOS](../referencias/CONTRATOS-DE-DATOS.md)
