# Estado de implementación

[Volver al índice](README.md)

**T00, T01, T02, T03, T04 y T24 están HECHO.** El ensayo de T03 corrió en un MySQL local desechable; la base configurada de la app no se migró. El resto sigue pendiente. Los ejemplos aislados verificados del paquete no equivalen a tareas implementadas en el CRM.

Estados permitidos: PENDIENTE, EN_CURSO, BLOQUEADA, HECHO. Usar NO VERIFICADO dentro de evidencia para comprobaciones no ejecutadas. HECHO exige aceptación y enlace a evidencia; que un modelo afirme «terminado» no es prueba.

## Contexto de la sesión

- Rama / commit base: `main` @ `81b3801`. El cierre de T03, T04 y T24 sigue sin commit.
- Gestor y comandos: npm 11.12.1, Node local v24.14.1 (el job QA declara Node 22). Scripts en `package.json`; CI en `.github/workflows/qa.yml`.
- Tarea actual: T24 HECHO.
- Próxima acción: T05, en una conversación nueva. No hacer backfill. Aplicar `20261019233000_credit_additive_identity` en la base configurada antes de desplegar este schema.
- Entorno autorizado para pruebas: MySQL 26.7.0 en `127.0.0.1`, base vacía, borrada al terminar. No se usó la base configurada ni producción.
- Flags activos: ninguno activado por este paquete.

## Seguimiento

| Tarea | Estado | Evidencia/commit | Bloqueo o siguiente paso |
|---|---|---|---|
| [T00](tareas/T00-linea-base.md) | HECHO | [evidencias/T00.md](evidencias/T00.md) | Mapa y smokes de crédito sin env. Siguiente: T01 |
| [T01](tareas/T01-contencion.md) | HECHO | [evidencias/T01.md](evidencias/T01.md) | Estimador indisponible. Siguiente: T02 |
| [T02](tareas/T02-contratos.md) | HECHO | [evidencias/T02.md](evidencias/T02.md) | Contratos sin migración. Siguiente: T03 |
| [T03](tareas/T03-schema-aditivo.md) | HECHO | [evidencias/T03.md](evidencias/T03.md) | Ensayo local en 0. La base configurada no se migró. Siguiente: T04 |
| [T04](tareas/T04-normalizacion.md) | HECHO | [evidencias/T04.md](evidencias/T04.md) | Normalizador puro. No persiste. Siguiente en el orden: T24 |
| [T05](tareas/T05-identidad-canonica.md) | PENDIENTE | — | — |
| [T06](tareas/T06-backfill-snapshots.md) | PENDIENTE | — | — |
| [T07](tareas/T07-parser-completo.md) | PENDIENTE | — | — |
| [T08](tareas/T08-revision-confirmacion.md) | PENDIENTE | — | — |
| [T09](tareas/T09-scores-modelos.md) | PENDIENTE | — | — |
| [T10](tareas/T10-edades-consultas.md) | PENDIENTE | — | — |
| [T11](tareas/T11-metricas-revolving.md) | PENDIENTE | — | — |
| [T12](tareas/T12-usuarios-autorizados.md) | PENDIENTE | — | — |
| [T13](tareas/T13-plan-utilizacion.md) | PENDIENTE | — | — |
| [T14](tareas/T14-presupuesto.md) | PENDIENTE | — | — |
| [T15](tareas/T15-anomalias.md) | PENDIENTE | — | — |
| [T16](tareas/T16-entrevista-evidencia.md) | PENDIENTE | — | — |
| [T17](tareas/T17-rondas-respuestas.md) | PENDIENTE | — | — |
| [T18](tareas/T18-avance-comparacion.md) | PENDIENTE | — | — |
| [T19](tareas/T19-plan-accion.md) | PENDIENTE | — | — |
| [T20](tareas/T20-funding-programas.md) | PENDIENTE | — | — |
| [T21](tareas/T21-capacidad-financiera.md) | PENDIENTE | — | — |
| [T22](tareas/T22-ui-credito.md) | PENDIENTE | — | — |
| [T23](tareas/T23-portal.md) | PENDIENTE | — | — |
| [T24](tareas/T24-seguridad.md) | HECHO | [evidencias/T24.md](evidencias/T24.md) | Guard de sesión y SSN oculto. Siguiente: T05 |
| [T25](tareas/T25-politicas-operativas.md) | PENDIENTE | — | — |
| [T26](tareas/T26-corpus-ci.md) | PENDIENTE | — | — |
| [T27](tareas/T27-rendimiento-observabilidad.md) | PENDIENTE | — | — |
| [T28](tareas/T28-recorrido-lanzamiento.md) | PENDIENTE | — | — |

## Continuidad

Al cerrar sesión: actualizar tarea actual, paso exacto pendiente, archivos modificados y verificaciones realizadas. Copiar detalles a evidencias/Txx.md. No poner datos personales ni secretos en este archivo.
