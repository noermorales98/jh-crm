# T24 · Verificar aislamiento, PII y permisos en servidor

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Seguridad transversal
- **Dependencias:** T03
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Proteger importaciones y nuevas entidades antes del backfill y los consumidores. Esta tarea se ejecuta temprano aunque su ID sea T24.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Auth/roles/middleware, servicios de cliente, Prisma scopes, URLs de documentos, logs, modelo IA y cache.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Trazar permisos existentes de staff/admin/cliente; reutilizar el sistema actual y documentar matriz real.
2. Derivar organización del contexto autenticado y comprobar pertenencia cliente/expediente/reporte/documento. Rechazar asociaciones cruzadas en transacción.
3. Revisar rutas de upload, import, confirm, merge/split, export, query y descarga. Autorización también para jobs y server actions.
4. Verificar que PII y secretos no viajan a modelos ni logs; redacción falla cerrada si no puede garantizar el contrato del pipeline.
5. Definir acceso/retención de texto, locators y documentos privados según política del producto; no exponer raw en DTOs genéricos.
6. Pruebas negativas con dos organizaciones y dos clientes en una organización; cache con scope completo. Cada tarea posterior añade sus endpoints a esta matriz.

## Código o contrato de implementación

```ts
// Pseudocódigo: adaptar al auth y repositorio de datos reales.
const actor = await requireAuthenticatedActor();
await requirePermission(actor, "credit:review");
const report = await findReport({ id: input.reportId, organizationId: actor.organizationId });
if (!report || !canAccessClient(actor, report.clientId)) throw notFoundOrForbidden();
// No aceptar organizationId del body como autorización.
```

## Operaciones y significado de los datos

Matriz mínima: 2 organizaciones × 2 roles × operaciones nuevas permitidas/denegadas. No usar cantidad de tests como prueba de ausencia total de vulnerabilidades; registrar los accesos cubiertos.

## Verificación concreta

IDs ajenos, documento ajeno, cache, usuario con permiso pero otro tenant, job scope, logs y redacción fallida.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Operaciones nuevas base autorizan en servidor y protegen documentos; matriz con casos reales. Continúa siendo obligación de cada tarea verificar su nueva ruta.

Guarda evidencia en `docs/plan-crm/evidencias/T24.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Apagar endpoints nuevos si el scope falla. Nunca relajar políticas ni agregar bypass para que pase una prueba funcional.

## Prompt listo para Cursor

```text
Ejecuta T24 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T24-seguridad.md dentro de docs/plan-crm.
Comprueba dependencias: T03. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T24.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[ARQUITECTURA](../referencias/ARQUITECTURA.md) · [QA-Y-ACEPTACION](../referencias/QA-Y-ACEPTACION.md)
