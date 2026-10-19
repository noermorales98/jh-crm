# Matriz de trazabilidad de la investigación

[Volver al índice](../README.md) · [Informe adjunto](../fuentes/investigacion-original.md)

Los problemas se heredan de las secciones «Hallazgos ejecutivos», «Auditoría funcional módulo por módulo», «Matemáticas y motor de reglas» y «Arquitectura, seguridad, cumplimiento y hoja de ruta». T00 valida vigencia en el código actual. Las soluciones siguientes son propuestas de implementación; no una nueva constatación del repositorio.

| Hallazgo o necesidad | Tareas | Resultado propuesto |
|---|---|---|
| Cuentas contadas por buró; mezcla installment/revolving | T02, T04, T05, T06, T11 | Identidad y observaciones separadas; métricas sobre cuentas únicas |
| Score sin familia/versión; promedio usado como preparación | T03, T07, T09, T20 | Modelo, comparabilidad y regla de programa |
| Bandas de fondeo y puntos FICO no fundamentados | T01, T13, T19, T20 | Retiro en API/UI/export y resultados explicables |
| AU por regex, cantidades/montos arbitrarios | T04, T12 | Ownership confirmado y análisis descriptivo |
| Edad null permite qualified | T02, T10, T20 | UNKNOWN no satisface requisito obligatorio |
| Parser prioriza negativos y máximo 200 | T07, T08 | Cobertura, ventanas, recuperación y confirmación |
| Negativo se trata como disputable | T15, T16, T17 | Anomalía → afirmación → revisión → workflow |
| Score Plan sólo paydown, sin asignación | T13, T14 | Metas individuales/agregadas y presupuesto extra |
| Consultas como contador; antigüedad insuficiente | T03, T07, T10 | Consultas individuales y métricas temporales |
| Cambio posterior a ronda interpretado como logro causal | T17, T18 | Fuente de cambio y disposición formal separadas |
| Programas/capacidad financiera sin datos completos | T20, T21 | Rulesets vigentes, DTI/DSCR con cobertura |
| Necesidad de operación/portal/compliance | T22, T23, T24, T25 | UX coherente, scope, autorizaciones y políticas |
| Tests actuales validan heurística, no dominio | T26, T27, T28 | Corpus sintético, procedencia y end-to-end |
| Riesgo de desarrollar por prompts generales | T00 y todos los prompts | Mapa real, tarea acotada, aceptación y evidencia |

## Propuestas afinadas frente al informe

- Los umbrales y pesos de matching ilustrativos no activan unión automática: se empieza con revisión y corpus etiquetado.
- El ejemplo 78/100 de readiness del informe no se implementa sin definición/calibración: usar conteos y motivos.
- El presupuesto es adicional a mínimos/reservas. La heurística de utilización no se presenta como optimización financiera universal.
- Cobertura parcial invalida conclusiones de ausencia y totales certificados.
- T24 se adelanta y la revisión operativa T25 antecede automatizaciones de rondas/cobros.
