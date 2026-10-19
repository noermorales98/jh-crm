# Prompts reutilizables

[Volver al índice](README.md)

Sustituye `Txx` por un ID real y adjunta el archivo exacto con `@` cuando conozcas su ruta. La mención ayuda a ubicarlo; el agente aún debe leerlo. No pegues todo el paquete en cada conversación.

## Ejecutar una tarea

```text
Lee docs/plan-crm/README.md, ESTADO.md y el archivo de la tarea Txx.
Comprueba sus dependencias con evidencia. Localiza los archivos reales según el
mapa de T00 y contrasta el hallazgo con el código actual. Implementa únicamente
esta tarea usando sus contratos, casos esperados y reglas del repositorio.
Adapta los ejemplos; no inventes campos, rutas, APIs ni umbrales financieros.
Conserva la arquitectura existente y el aislamiento por organización/cliente.
Ejecuta las verificaciones pertinentes y revisa el diff. Corrige las regresiones
introducidas. Registra fallos previos y verificaciones que no pudieron ejecutarse.
Actualiza ESTADO y evidencias/Txx.md. No marques HECHO sin satisfacer la
aceptación. Resume cambios, resultados y limitaciones. No continúes otra tarea.
```

## Planificar una tarea compleja

```text
Estudia Txx y el código relacionado. Devuelve un plan con archivos reales,
contratos de entrada/salida, migración si aplica, casos límite, pruebas y
recuperación. Separa hechos verificados de propuestas. Identifica sólo las
decisiones de negocio que realmente faltan. En esta sesión produce el plan;
la implementación irá después sobre ese plan concreto.
```

## Revisar un cambio

```text
Revisa el diff de Txx contra el commit base registrado. Busca errores de dominio,
duplicación, null tratado como cero/PASS, acceso cruzado, pérdida histórica,
redondeo y efectos fuera de alcance. Contrasta las salidas con los fixtures.
No modifiques código durante esta revisión. Devuelve hallazgos con severidad,
archivo, escenario reproducible y corrección propuesta. Indica qué no pudiste
comprobar. No concluyas que una regla es válida sólo porque tiene un test.
```

## Depurar una regresión

```text
Reproduce este fallo de Txx con el fixture mínimo. Identifica el primer dato o
contrato que cambia respecto a lo esperado. Explica la causa antes de parchear.
Corrige la causa con el cambio menor coherente; conserva una prueba que detecte
la regresión. No cambies el resultado esperado sin demostrar que el contrato
estaba equivocado. Reejecuta las pruebas relevantes y registra la evidencia.
```

## Retomar mañana o en otra conversación

```text
Lee README, ESTADO, evidencias/Txx.md y el diff actual. Resume qué está completo,
qué sigue pendiente y qué pruebas se ejecutaron. Continúa desde el siguiente
paso incompleto de Txx. No repitas migraciones ni regeneres datos si ya existen.
Preserva el trabajo local y distingue bloqueos reales de decisiones rutinarias.
```

## Detener invenciones financieras

```text
Identifica la procedencia de cada constante y regla de este módulo. Clasifica:
matemática descriptiva, política interna J&H, regla de programa verificada o
inferencia sin respaldo. Retira predicciones de puntos FICO y montos genéricos.
No sustituyas una fórmula inventada por otra. Donde falten datos devuelve
UNKNOWN con la causa, cobertura y campos necesarios.
```

## Comprobar el recorrido completo

```text
Con datos sintéticos de dos organizaciones, verifica importación, revisión,
confirmación, identidad canónica, métricas, plan de utilización, entrevista,
borrador de disputa, ronda, reimportación, comparación y evaluación de programa.
Comprueba UI, API y persistencia, no sólo funciones aisladas. Prueba también
extracción parcial, permisos insuficientes y score no comparable. No envíes
cartas, no cobres y no llames prestamistas. Registra salidas y bloqueos en T28.
```
