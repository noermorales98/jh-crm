# QA del producto y de las reglas

[Volver al índice](../README.md)

## Qué prueba cada nivel

| Nivel | Comprueba | No demuestra |
|---|---|---|
| Unitario | Aritmética y contratos puros | Validez de una regla de prestamista |
| Integración | Transacciones, aislamiento, datos y API | Recorrido completo del usuario |
| E2E | Flujo UI → API → BD con usuario autorizado | Que el crédito será aprobado |
| Revisión de dominio | Procedencia, versión y significado de una regla | Garantía de resultado financiero |
| Ensayo de migración | Idempotencia y recuperación | Permiso para aplicarla en producción |

## Corpus sintético mínimo

| ID | Caso | Resultado esperado |
|---|---|---|
| F01 | Una Visa en EX/EQ/TU, 10k/8k | Una cuenta, límite 10k, balance 8k |
| F02 | Dos Visa mismo banco, sufijo igual, fechas distintas | No unión automática; revisión |
| F03 | Mortgage y revolving | Sólo revolving entra en utilización |
| F04 | AU en tres burós | Una AU; separado de primarias |
| F05 | Límite ausente | UNKNOWN individual; total parcial |
| F06 | Saldo cero, límite positivo | 0%, dato presente |
| F07 | Charge sin preset | N/A para utilización estándar |
| F08 | Saldo > límite | Más de 100%, sin cap artificial |
| F09 | Score FICO8 y Vantage3 | Sin delta directo |
| F10 | Score sin modelo | Datos insuficientes para regla de ese modelo |
| F11 | Apertura faltante o futura | UNKNOWN/INVALID; no PASS |
| F12 | Consulta soft | Fuera del conteo hard |
| F13 | Rate shopping sin versión de score | Conteo bruto; agrupación sólo informativa |
| F14 | Diferencia de balance con fechas distintas | Advertencia temporal; no disputa automática |
| F15 | Negativo correcto confirmado | No inventar inexactitud |
| F16 | Cuenta ausente en reporte parcial | No concluir NOT_PRESENT confirmado |
| F17 | 250 observaciones en varias ventanas | Cobertura total o bloqueo explícito por parcial |
| F18 | Doble confirmación concurrente | Un snapshot confirmado idempotente |
| F19 | Acceso de organización B a IDs de A | Denegado sin filtrar datos ni documentos |
| F20 | Alias de acreedor y falta de sufijo | Candidato explicable; no unión por nombre |
| F21 | Presupuesto 0 y monto mayor al saldo | No pagos negativos; sobrante preservado |
| F22 | Límite/moneda mezclados | Métrica no calculable como total único |
| F23 | Campo null y valor 0 | Semántica diferenciada |
| F24 | Página OCR fallida | Importación PARTIAL, publicación bloqueada |
| F25 | Ruleset vencido o sin fuente | REVIEW, sin evaluación vigente certificada |
| F26 | Respuesta de buró y PDF posterior discrepan | Mostrar ambas evidencias; revisión |
| F27 | Mismo snapshot recalculado | Mismo resultado salvo timestamps de ejecución |
| F28 | Saldo negativo/crédito a favor | Raw preservado; política explícita |
| F29 | Reintento tras timeout de envío de documento | No repetir efecto externo automáticamente |
| F30 | 1,234.56 vs 1.234,56 | Interpretación por locale o revisión |

Estos casos de aceptación corren en `npm run smoke:credit-corpus`. El smoke llama las funciones reales del crédito, sin base y sin un PDF de una persona. No demuestra un recorrido de pantalla ni una migración.

## Cierre de cada tarea

Registrar commit base, archivos, comandos exactos, resultados, cobertura pendiente y riesgo. Si una prueba falla por entorno, conservar NO VERIFICADO; no presentarla como aprobada. Las comprobaciones relevantes se derivan del cambio; no repetir toda la suite por un ajuste editorial.

## Demostración de producto

Importar fixture completo, revisar/confirmar, observar cuenta única, separar AU, generar plan con presupuesto, entrevistar al cliente, adjuntar evidencia, crear borrador de ronda, registrar envío simulado, importar seguimiento y comparar. Seleccionar programa de demostración claramente interno; ver PASS/FAIL/UNKNOWN con motivos. Repetir con organización ajena, datos faltantes y reporte parcial.
