# T23 · Adaptar portal del cliente y permisos de revisión

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Portal
- **Dependencias:** T16, T22, T24
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Permitir al cliente entender el avance y aportar hechos sin acceder a datos o decisiones administrativas indebidas.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Portal actual, auth cliente, documentos, entrevistas, endpoints y grants de acceso.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Mostrar sólo snapshots confirmados y resultados autorizados de ese cliente. Borradores staff no se publican automáticamente.
2. Habilitar entrevista y documentos de T16; explicar qué fue reportado y qué falta revisar.
3. Permitir ver avance sin atribución causal y escenarios de utilización con etiqueta de simulación.
4. Ocultar administración de rulesets, overrides y notas internas según permisos reales.
5. Aplicar autorización en cada endpoint y descarga, no sólo en navegación. Revocación de sesión/acceso se comprueba.
6. Probar aislamiento entre clientes de la misma organización además del aislamiento entre organizaciones.

## Código o contrato de implementación

```ts
type PortalContext = { organizationId: string; authenticatedClientId: string };
// La consulta usa authenticatedClientId, nunca un clientId libre del body.
// Si un staff consulta otro cliente, requiere su flujo y permiso específico.
```

## Operaciones y significado de los datos

No hay ecuación nueva. Renderizar exactamente las métricas autorizadas del snapshot; cliente no recibe un supuesto «monto aprobado».

## Verificación concreta

Cliente A solicita ID/documento B; link expirado; borrador no confirmado; entrevista corregida; descarga tras revocación; móvil.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Portal usa contratos compartidos y scope servidor; acceso cruzado falla sin exponer metadatos privados.

Guarda evidencia en `docs/plan-crm/evidencias/T23.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Deshabilitar funciones nuevas del portal conservando aportaciones guardadas. Nunca abrir permisos para solventar un error de UI.

## Prompt listo para Cursor

```text
Ejecuta T23 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T23-portal.md dentro de docs/plan-crm.
Comprueba dependencias: T16, T22, T24. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T23.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[CONTRATOS-DE-DATOS](../referencias/CONTRATOS-DE-DATOS.md) · [QA-Y-ACEPTACION](../referencias/QA-Y-ACEPTACION.md)
