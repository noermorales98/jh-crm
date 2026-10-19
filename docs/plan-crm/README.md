# J&H CRM · Índice general de ejecución para Cursor

**Punto de entrada del proyecto.** Este archivo dirige al agente hacia una tarea concreta y sus referencias; no pide cargar todos los documentos a la vez.

Fecha: 19 de octubre de 2026. Base: investigación adjunta de J&H CRM y documentación oficial de Cursor. Este paquete planifica mejoras; no modifica el repositorio ni certifica el estado actual de GitHub. T00 verifica el HEAD real antes de implementar.

## Primera acción

[Instala el paquete](00-INSTALACION.md), lee [cómo dirigir Cursor](01-CURSOR-Y-VIBE-CODING.md) y empieza por [T00](tareas/T00-linea-base.md). Todas las tareas están pendientes en [ESTADO](ESTADO.md).

```text
Lee docs/plan-crm/README.md, ESTADO.md y tareas/T00-linea-base.md.
Ejecuta sólo T00: contrasta la investigación con este repositorio y registra
rutas, contratos, scripts reales y línea base. Preserva trabajo existente.
No inventes datos ni imprimas secretos. Registra evidencia y estado.
```

## Objetivo del trabajo

Conservar la infraestructura existente —clientes, expedientes, importación, reportes, rondas, portal y CI— y corregir su motor de negocio. Una cuenta real debe tener una identidad y varias observaciones. Las métricas deben ser deterministas y trazables. Los programas evalúan requisitos documentados; el CRM no inventa underwriting.

Prioridad inmediata: retirar promesas de puntos y bandas genéricas de fondeo. Luego normalizar identidad/datos antes de alimentar planes y preparación financiera. No perfeccionar una fórmula sobre cuentas duplicadas.

## Recorrido y dependencias

El orden siguiente es ejecutable respetando dependencias. **T24 se adelanta por seguridad y T25 se ejecuta antes de rondas/automatizaciones.** No seguir los números a ciegas. La columna dependencias manda; una tarea completada exige evidencia, no sólo un check en esta tabla.

| Orden | Tarea | Depende de |
|---:|---|---|
| 1 | [T00 · Verificar el repositorio y registrar la línea base](tareas/T00-linea-base.md) | — |
| 2 | [T01 · Retirar afirmaciones y salidas financieras sin respaldo](tareas/T01-contencion.md) | T00 |
| 3 | [T02 · Definir contratos de datos, calidad y cálculo](tareas/T02-contratos.md) | T00 |
| 4 | [T03 · Preparar schema Prisma y migración aditiva](tareas/T03-schema-aditivo.md) | T02 |
| 5 | [T04 · Normalizar acreedores, cuentas, importes y fechas](tareas/T04-normalizacion.md) | T02 |
| 6 | [T24 · Verificar aislamiento, PII y permisos en servidor](tareas/T24-seguridad.md) | T03 |
| 7 | [T05 · Proponer y revisar identidad de cuentas entre burós](tareas/T05-identidad-canonica.md) | T03, T04, T24 |
| 8 | [T06 · Poblar identidades y construir snapshots reproducibles](tareas/T06-backfill-snapshots.md) | T05 |
| 9 | [T07 · Completar extracción de PDF sin sesgo a negativos](tareas/T07-parser-completo.md) | T03, T04, T24 |
| 10 | [T08 · Revisar importaciones y confirmar snapshots de forma atómica](tareas/T08-revision-confirmacion.md) | T06, T07 |
| 11 | [T09 · Guardar modelos de score y comparar sólo observaciones compatibles](tareas/T09-scores-modelos.md) | T03, T08 |
| 12 | [T10 · Calcular antigüedad y consultas con contexto temporal](tareas/T10-edades-consultas.md) | T03, T08 |
| 13 | [T11 · Corregir utilización y estructura revolving sin duplicación](tareas/T11-metricas-revolving.md) | T06, T08, T09, T10 |
| 14 | [T12 · Convertir AU en análisis descriptivo separado](tareas/T12-usuarios-autorizados.md) | T11 |
| 15 | [T13 · Reformular Score Plan como escenarios de paydown](tareas/T13-plan-utilizacion.md) | T11 |
| 16 | [T14 · Distribuir presupuesto extra con una política determinista](tareas/T14-presupuesto.md) | T13 |
| 17 | [T15 · Detectar discrepancias y negativos sin inferir inexactitud](tareas/T15-anomalias.md) | T11 |
| 18 | [T16 · Capturar afirmaciones del cliente y documentos de soporte](tareas/T16-entrevista-evidencia.md) | T15, T24 |
| 19 | [T25 · Modelar autorizaciones y políticas de servicio aplicables](tareas/T25-politicas-operativas.md) | T03, T24 |
| 20 | [T17 · Gestionar rondas, recepción y respuestas con trazabilidad](tareas/T17-rondas-respuestas.md) | T16, T25 |
| 21 | [T18 · Comparar reportes y mostrar cambios observados](tareas/T18-avance-comparacion.md) | T17, T09, T06 |
| 22 | [T19 · Generar un plan de acción explicable y operativo](tareas/T19-plan-accion.md) | T12, T14, T15, T16 |
| 23 | [T20 · Evaluar preparación por programas y reglas versionadas](tareas/T20-funding-programas.md) | T09, T10, T11, T24 |
| 24 | [T21 · Capturar datos financieros y calcular DTI/DSCR](tareas/T21-capacidad-financiera.md) | T20 |
| 25 | [T22 · Integrar los módulos en una interfaz por buró y consolidada](tareas/T22-ui-credito.md) | T12, T14, T18, T19, T21 |
| 26 | [T23 · Adaptar portal del cliente y permisos de revisión](tareas/T23-portal.md) | T16, T22, T24 |
| 27 | [T26 · Integrar corpus de aceptación y checks en CI](tareas/T26-corpus-ci.md) | T23, T25 |
| 28 | [T27 · Medir rendimiento, costos técnicos y reproducibilidad](tareas/T27-rendimiento-observabilidad.md) | T26 |
| 29 | [T28 · Verificar el recorrido completo y preparar activación gradual](tareas/T28-recorrido-lanzamiento.md) | T27 |

## Hitos verificables

| Hito | Tareas principales | Resultado que debes poder comprobar |
|---|---|---|
| M0 · Base y contención | T00–T02 | Mapa real, contratos y salidas ficticias retiradas |
| M1 · Datos confiables | T03–T08 + T24 | Cuenta única, importación completa o parcial explícita, snapshot confirmado |
| M2 · Matemáticas | T09–T14 | Modelos comparables, métricas sin duplicación, escenarios correctos |
| M3 · Revisión y seguimiento | T15–T19 + T25 | Afirmaciones/evidencia, rondas y cambios observados |
| M4 · Preparación y experiencia | T20–T23 | Reglas por producto, capacidad documentada y portal consistente |
| M5 · Calidad y activación | T26–T28 | Corpus, rendimiento medido, recorrido y recuperación verificados |

Los hitos no son estimaciones de días. El tamaño real de la implementación depende del código actual, los datos existentes y las correcciones que T00 encuentre ya hechas.

## Reglas de uso para Cursor

1. Lee estado y la tarea seleccionada. Confirma dependencias y código actual.
2. Carga sólo las referencias necesarias. Los ejemplos son código orientador, no contratos del esquema ya instalados.
3. Implementa un cambio coherente. Si una tarea necesita subtareas, registra IDs locales dentro de su evidencia y conserva su aceptación completa.
4. Comprueba salidas esperadas y errores relevantes. No debilites tests ni sustituyas hechos con respuestas de IA.
5. Revisa el diff y registra archivos, comandos, resultados, límites y recuperación.
6. Actualiza ESTADO y evidencia. Continúa a la siguiente tarea en una nueva solicitud/conversación.

Si la implementación actual ya cumple una tarea, valida su equivalencia y registra HECHO con evidencia. Si falta un dato o permiso, registra BLOQUEADA o NO VERIFICADO; no inventes resultados para avanzar.

## Documentación compartida

| Archivo | Para qué sirve |
|---|---|
| [Instalación](00-INSTALACION.md) | Dónde copiar todo y cómo arrancar |
| [Cursor y vibe coding](01-CURSOR-Y-VIBE-CODING.md) | Método de trabajo investigado y adaptado |
| [Prompts](02-PROMPTS.md) | Ejecutar, revisar, depurar y continuar |
| [Arquitectura](referencias/ARQUITECTURA.md) | Servicios, invariantes y snapshots |
| [Contratos de datos](referencias/CONTRATOS-DE-DATOS.md) | Diccionario, ausencia y procedencia |
| [Matemáticas](referencias/MATEMATICAS.md) | Fórmulas, unidades y ejemplos |
| [Migración y recuperación](referencias/MIGRACIONES-Y-RECUPERACION.md) | Expandir, backfill, comparar y conmutar |
| [QA y aceptación](referencias/QA-Y-ACEPTACION.md) | Corpus F01–F30 y niveles de prueba |
| [Fuentes](referencias/FUENTES.md) | Documentación oficial y límites de evidencia |
| [Matriz de hallazgos](referencias/MATRIZ-HALLAZGOS.md) | Qué problema del informe atiende cada tarea |
| [Motor de referencia](ejemplos/01-MOTOR-DETERMINISTA.md) | TypeScript para aritmética, presupuesto y readiness |
| [Pruebas de referencia](ejemplos/02-PRUEBAS-DE-REFERENCIA.md) | Comprobaciones ejecutables aisladas |
| [Patrón Prisma](ejemplos/03-PRISMA-ADITIVO.md) | Fragmentos aditivos a integrar |
| [Matching y reglas](ejemplos/04-MATCHING-Y-REGLAS.md) | Contratos conservadores y ejemplos |
| [Plantilla de AGENTS](plantillas/AGENTS.md) | Complemento opcional; no sobrescribir el actual |
| [Plantilla de evidencia](plantillas/EVIDENCIA-DE-TAREA.md) | Registro por tarea |
| [Validación del paquete](VALIDACION-DEL-PAQUETE.md) | Qué se comprobó en esta entrega |
| [Investigación original](fuentes/investigacion-original.md) | Fuente adjunta preservada íntegra |

## Decisiones que no debe inventar el agente

- Modelo de score, fechas o responsabilidad que no aparecen en la fuente.
- Correspondencia de cuentas ambiguas sin revisión.
- Requisitos de prestamista o plazos/cobros sin política aplicable.
- Causa de un cambio observado después de una ronda.
- Puntos futuros FICO, monto de crédito o score de preparación 0–100 sin modelo validado.

La implementación puede avanzar con estas configuraciones pendientes usando UNKNOWN/REVIEW y acciones deshabilitadas, en lugar de llenar huecos con heurísticas presentadas como hechos.
