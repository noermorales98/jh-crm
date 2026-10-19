# Estado de implementación

[Volver al índice](README.md)

**T00, T01 y T02 están HECHO.** T03 está BLOQUEADA: el SQL aditivo y el cliente están listos, y el ensayo en base no se ejecutó. El resto sigue pendiente. Los ejemplos aislados verificados del paquete no equivalen a tareas implementadas en el CRM.

Estados permitidos: PENDIENTE, EN_CURSO, BLOQUEADA, HECHO. Usar NO VERIFICADO dentro de evidencia para comprobaciones no ejecutadas. HECHO exige aceptación y enlace a evidencia; que un modelo afirme «terminado» no es prueba.

## Contexto de la sesión

- Rama / commit base: `main` @ `e633f9d`. T03 sigue sin commit.
- Gestor y comandos: npm 11.12.1, Node local v24.14.1 (el job QA declara Node 22). Scripts en `package.json`; CI en `.github/workflows/qa.yml`.
- Tarea actual: T03 BLOQUEADA.
- Próxima acción: `npx prisma migrate deploy` solo si el host de la base es `127.0.0.1` o `localhost`. No abrir T04 ni hacer backfill.
- Entorno autorizado para pruebas: local, smokes sin `.env`. La base configurada no es loopback; no se migró. No se usó producción.
- Flags activos: ninguno activado por este paquete.

## Seguimiento

| Tarea | Estado | Evidencia/commit | Bloqueo o siguiente paso |
|---|---|---|---|
| [T00](tareas/T00-linea-base.md) | HECHO | [evidencias/T00.md](evidencias/T00.md) | Mapa y smokes de crédito sin env. Siguiente: T01 |
| [T01](tareas/T01-contencion.md) | HECHO | [evidencias/T01.md](evidencias/T01.md) | Estimador indisponible. Siguiente: T02 |
| [T02](tareas/T02-contratos.md) | HECHO | [evidencias/T02.md](evidencias/T02.md) | Contratos sin migración. Siguiente: T03 |
| [T03](tareas/T03-schema-aditivo.md) | BLOQUEADA | [evidencias/T03.md](evidencias/T03.md) | SQL y cliente listos. `migrate deploy` NO VERIFICADO: el host no es loopback. No está HECHO |
| [T04](tareas/T04-normalizacion.md) | PENDIENTE | — | — |
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
| [T24](tareas/T24-seguridad.md) | PENDIENTE | — | — |
| [T25](tareas/T25-politicas-operativas.md) | PENDIENTE | — | — |
| [T26](tareas/T26-corpus-ci.md) | PENDIENTE | — | — |
| [T27](tareas/T27-rendimiento-observabilidad.md) | PENDIENTE | — | — |
| [T28](tareas/T28-recorrido-lanzamiento.md) | PENDIENTE | — | — |

## Continuidad

Al cerrar sesión: actualizar tarea actual, paso exacto pendiente, archivos modificados y verificaciones realizadas. Copiar detalles a evidencias/Txx.md. No poner datos personales ni secretos en este archivo.
