# T00 · Verificar el repositorio y registrar la línea base

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Preparación
- **Dependencias:** Ninguna
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Convertir los hallazgos del informe en un mapa verificable del código actual, sin asumir que cada problema sigue presente.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

package.json, lockfile, schema.prisma, migraciones, README, AGENTS.md, reglas existentes, workflows CI; buscar action-plan.ts, funding-estimate.ts, importador, Score Plan, rondas y portal.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Registrar rama, commit y archivos modificados; preservar trabajo previo. Confirmar que el workspace es jh-crm.
2. Identificar gestor/versión de paquetes, framework, proveedor de BD, auth, runner de tests y scripts reales. No imprimir variables de entorno.
3. Trazar UI → API/action → servicio → Prisma para cada módulo del informe. Crear `referencias/MAPA-REAL.md` con símbolos y rutas encontradas.
4. Clasificar cada hallazgo: vigente, ya corregido, parcialmente corregido o no verificable. Adjuntar escenario mínimo o referencia de código.
5. Ejecutar los checks existentes que sean posibles sin producción; registrar fallos anteriores y requisitos de entorno. No afirmar que hay que crear CI sin leerlo.
6. Crear rama de trabajo si el flujo Git lo permite y dejar esta tarea lista para ejecución incremental.

## Código o contrato de implementación

```bash
git status --short
git rev-parse HEAD
rg --files -g 'package.json' -g '*lock*' -g 'schema.prisma' -g 'AGENTS.md'
rg -n 'funding-estimate|canonicalTradeline|ownershipType|qualified|isNegative' src app prisma
```

Ajustar los directorios a los que realmente existan. Un `rg` sin coincidencias es evidencia de búsqueda, no prueba de ausencia funcional.

## Operaciones y significado de los datos

No aplica una fórmula financiera. La línea base registra cantidad de checks pasados/fallidos/no ejecutados y denominador; no asigna una calificación arbitraria de calidad.

## Verificación concreta

La ruta de cada módulo tiene respaldo; existe al menos un flujo trazado hasta BD; se distingue un fallo previo de uno introducido.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

MAPA-REAL y evidencia T00 contienen commit base, scripts exactos, alcance verificado y bloqueos. Ninguna otra tarea implementada. Si un hallazgo ya está corregido, documentar y probar su equivalente antes de saltar trabajo.

Guarda evidencia en `docs/plan-crm/evidencias/T00.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Esta tarea sólo crea documentación técnica. Revertir únicamente sus archivos si fuera necesario, conservando la evidencia útil.

## Prompt listo para Cursor

```text
Ejecuta T00 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T00-linea-base.md dentro de docs/plan-crm.
Comprueba dependencias: Ninguna. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T00.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[ARQUITECTURA](../referencias/ARQUITECTURA.md) · [QA-Y-ACEPTACION](../referencias/QA-Y-ACEPTACION.md)
