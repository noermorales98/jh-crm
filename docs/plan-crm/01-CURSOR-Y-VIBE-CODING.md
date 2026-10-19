# Cómo dirigir Cursor en este CRM

[Volver al índice](README.md) · [Prompts listos](02-PROMPTS.md) · [Fuentes](referencias/FUENTES.md)

## Investigación aplicada

La documentación de Cursor confirma Project Rules en `.cursor/rules/`, con `description`, `globs` y `alwaysApply`; también admite `AGENTS.md`. Reglas cortas remiten al contenido detallado. Véase C1 en las fuentes.

La guía oficial propone planificar trabajo complejo, aportar contexto relevante y verificar resultados. Una conversación nueva ayuda al cambiar de tarea. Véase C2. Plan Mode permite estudiar y guardar un plan; su interfaz se verifica en la versión instalada. Véase C3.

El trabajo de Anthropic sobre sesiones largas muestra utilidad de avances incrementales, pruebas observables y un registro persistente de continuidad. Véase C4. No necesitas varias IAs editando simultáneamente para aplicar ese principio.

**Adaptación propia a J&H:** las reglas crediticias y el histórico de datos son el núcleo. Cada cambio debe poder explicarse con datos de entrada, política aplicada y salida esperada. Las fuentes anteriores orientan el proceso; no certifican esta arquitectura ni sus fórmulas.

## Anatomía de un buen prompt

| Parte | En J&H |
|---|---|
| Objetivo verificable | Una Visa en tres burós cuenta como una cuenta canónica |
| Contexto preciso | Archivo de tarea, contratos y mapa real de T00 |
| Alcance | Matching y pruebas; no rediseñar portal |
| Restricciones | Aislamiento por organización, historial inmutable, cambios aditivos |
| Datos esperados | Fixture sintético con IDs y valores de salida |
| Evidencia | Pruebas ejecutadas, diff y riesgos pendientes |
| Condición de cierre | Criterios de aceptación satisfechos |

En lugar de «optimiza todo el CRM», usa «ejecuta T05: propón coincidencias explicables; no unas automáticamente cuentas ambiguas». Un prompt largo no sustituye un contrato claro.

## Ciclo de una tarea

1. **Orientar:** leer estado, tarea y dependencias. Buscar el código real; no llenar el contexto con todo el repositorio.
2. **Contrastar:** comprobar que el problema sigue presente y que el hallazgo histórico aplica al commit actual.
3. **Diseñar:** describir entradas, salidas, archivos y casos límite. Si cambia la semántica del negocio, registrar una decisión.
4. **Implementar:** cambio pequeño, reutilizando patrones existentes. El modelo redacta; las funciones deterministas calculan.
5. **Verificar:** caso que fallaba, casos límite e integración relevante. No debilitar expectativas para que una prueba pase.
6. **Inspeccionar:** revisar qué se cambió fuera del alcance, autenticación, errores, consultas y exposición de datos.
7. **Cerrar:** registrar evidencia, limitaciones y siguiente paso. Una compilación verde no prueba la validez crediticia.

Para T03/T06, ejecutar antes un ensayo y documentar recuperación. Para T13/T14, reproducir números exactos. Para T24, probar accesos cruzados. Para T28, comprobar el recorrido completo.

## Cómo usar tus otras IAs

Cursor es el entorno de implementación y ejecución. Puedes pedir a otra IA que revise un diff anonimizado o una decisión con los mismos fixtures. Su respuesta es una propuesta: se contrasta con el repositorio y las fuentes. Conserva una sola rama de escritura por tarea. No copies implementaciones contradictorias de varias conversaciones.

No asignes responsabilidades por supuesta superioridad permanente de un modelo. Elige según resultados observables en tu tarea y disponibilidad. La IA que redacta una explicación no decide si un cliente recibe crédito.

## Cuando Cursor se desvía

Si inventa una ruta, exige ubicar el símbolo real. Si modifica módulos ajenos, revisa el diff y recupera sólo sus cambios con Git de forma selectiva. Si inventa umbrales, marca la regla como interna/inactiva y exige procedencia. Si atasca una prueba, inspecciona el error original y el contrato antes de reintentar.

Reinicia conversación cuando cambies de módulo; reanuda con ESTADO y la evidencia de la tarea. No dependas de la memoria del chat.

## Definición práctica de buen vibe coding

Tú defines intención, límites y significado de los números. El agente busca, implementa y comprueba. Un resultado es aceptable cuando puedes reconstruir por qué ocurrió, probarlo con datos controlados y revertirlo sin perder historial. Este paquete convierte ese criterio en tareas concretas.
