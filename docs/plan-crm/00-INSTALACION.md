# Colocación y primer arranque

[Volver al índice](README.md)

## Estructura de destino

| Ruta dentro de jh-crm | Propósito |
|---|---|
| `docs/plan-crm/README.md` | Entrada única y secuencia de tareas |
| `docs/plan-crm/tareas/` | Una especificación por tarea |
| `docs/plan-crm/referencias/` | Contratos compartidos y decisiones técnicas |
| `docs/plan-crm/ejemplos/` | Código de referencia en bloques TypeScript |
| `docs/plan-crm/ESTADO.md` | Estado de ejecución y evidencia |
| `docs/plan-crm/evidencias/` | Registro técnico sin datos personales |
| `.cursor/rules/jh-*.mdc` | Instrucciones persistentes breves |

Las rutas de implementación sugeridas, como `src/lib/credit/domain/`, son propuestas. T00 encuentra el equivalente real. No crees una segunda arquitectura si ya existe un servicio que cumple el propósito.

## Pasos iniciales

1. Comprueba en Cursor que `package.json` y el código del CRM están visibles y accesibles al agente. Confirma que el índice de código no excluya la documentación necesaria. Nunca incluyas `.env`, PDFs privados ni secretos como contexto.
2. Revisa las instrucciones ya existentes del repositorio. Conserva su autoridad y comunica cualquier conflicto con estas propuestas.
3. Usa Git para revisar tu estado local. No descartes trabajo anterior ni hagas un `reset --hard`.
4. Pide ejecutar T00. Obtendrá el commit base, gestor de paquetes, scripts reales y mapa de archivos.
5. Para T03/T06, prepara primero una base local o de staging aislada con datos sintéticos o anonimizados. No uses producción para probar migraciones.
6. Una tarea por conversación y cambio revisable. Si una tarea necesita varias sesiones, usa su registro de continuidad.
7. Las tareas de datos, cálculos o permisos necesitan pruebas. Para cambios de texto basta revisión enfocada; no montes infraestructura de tests por una corrección editorial.

## Prompt inicial

```text
Lee docs/plan-crm/README.md, ESTADO.md y tareas/T00-linea-base.md.
Revisa las instrucciones existentes y el estado Git. Ejecuta T00 sobre este
repositorio: localiza archivos y comandos reales, comprueba los hallazgos de la
investigación y escribe el mapa de implementación y la línea base de validación.
No implementes otras tareas. No sobrescribas trabajo ajeno, no imprimas secretos
ni accedas a producción. Distingue verificado, propuesto y no verificable.
Si un comando falla, registra la causa y si era un fallo previo.
Al terminar actualiza el estado y entrega evidencia concreta.
```

Este prompt usa el agente normal. Puedes elegir Plan Mode para estudiar cambios complejos; la revisión de ese plan forma parte de tu flujo en Cursor, no es necesaria para leer este paquete.
