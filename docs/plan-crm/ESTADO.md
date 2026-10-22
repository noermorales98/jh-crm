# Estado de implementación

[Volver al índice](README.md)

**T00, T01, T02, T03, T04, T05, T06, T07, T08, T09, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23, T24, T25, T26, T27 y T28 están HECHO.** Los ensayos de T03 y T06 corrieron en un MySQL local desechable. El 22 de octubre de 2026, `prisma migrate deploy` contra la base configurada terminó en 0: `20261019233000_credit_additive_identity` ya estaba aplicada y no había migraciones pendientes. Este paso no insertó filas. La activación real no se hizo. Los ejemplos aislados verificados del paquete no equivalen a tareas implementadas en el CRM.

Estados permitidos: PENDIENTE, EN_CURSO, BLOQUEADA, HECHO. Usar NO VERIFICADO dentro de evidencia para comprobaciones no ejecutadas. HECHO exige aceptación y enlace a evidencia; que un modelo afirme «terminado» no es prueba.

## Contexto de la sesión

- Rama / commit base: `main` @ `2b3ffb3`. T05, T06, T07, T08, T09, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23, T25, T26, T27 y T28 siguen sin commit.
- Gestor y comandos: npm 11.12.1, Node local v24.14.1 (el job QA declara Node 22). Scripts en `package.json`; CI en `.github/workflows/qa.yml`.
- Tarea actual: T28 HECHO.
- Próxima acción: no hay tarea siguiente. La migración ya no bloquea la compuerta. Sigue sin estar lista porque no hay política de plazos ni programa de prestamista revisados. No encender la lectura nueva ni el cobro.
- Entorno autorizado para pruebas: MySQL 26.7.0 en `127.0.0.1`, base vacía, borrada al terminar. No se usó la base configurada ni producción.
- Flags activos: la lectura de identidad v2 nace apagada. No hay columna nueva en `OrganizationSettings`.

## Seguimiento

| Tarea | Estado | Evidencia/commit | Bloqueo o siguiente paso |
|---|---|---|---|
| [T00](tareas/T00-linea-base.md) | HECHO | [evidencias/T00.md](evidencias/T00.md) | Mapa y smokes de crédito sin env. Siguiente: T01 |
| [T01](tareas/T01-contencion.md) | HECHO | [evidencias/T01.md](evidencias/T01.md) | Estimador indisponible. Siguiente: T02 |
| [T02](tareas/T02-contratos.md) | HECHO | [evidencias/T02.md](evidencias/T02.md) | Contratos sin migración. Siguiente: T03 |
| [T03](tareas/T03-schema-aditivo.md) | HECHO | [evidencias/T03.md](evidencias/T03.md) | Ensayo local en 0. La base configurada recibió esa migración. Siguiente: T04 |
| [T04](tareas/T04-normalizacion.md) | HECHO | [evidencias/T04.md](evidencias/T04.md) | Normalizador puro. No persiste. Siguiente en el orden: T24 |
| [T05](tareas/T05-identidad-canonica.md) | HECHO | [evidencias/T05.md](evidencias/T05.md) | Candidatos en memoria. No persiste. T06 ya siguió |
| [T06](tareas/T06-backfill-snapshots.md) | HECHO | [evidencias/T06.md](evidencias/T06.md) | Lectura v2 apagada. Ensayo local borrado. T07 ya siguió |
| [T07](tareas/T07-parser-completo.md) | HECHO | [evidencias/T07.md](evidencias/T07.md) | Extracción completa o parcial explícita. T08 ya siguió |
| [T08](tareas/T08-revision-confirmacion.md) | HECHO | [evidencias/T08.md](evidencias/T08.md) | Borrador distinto de publicar |
| [T09](tareas/T09-scores-modelos.md) | HECHO | [evidencias/T09.md](evidencias/T09.md) | Delta solo con el mismo modelo |
| [T10](tareas/T10-edades-consultas.md) | HECHO | [evidencias/T10.md](evidencias/T10.md) | Edad al corte del reporte |
| [T11](tareas/T11-metricas-revolving.md) | HECHO | [evidencias/T11.md](evidencias/T11.md) | Utilización sobre cuentas únicas |
| [T12](tareas/T12-usuarios-autorizados.md) | HECHO | [evidencias/T12.md](evidencias/T12.md) | AU confirmada, aparte del total propio. T13 ya siguió |
| [T13](tareas/T13-plan-utilizacion.md) | HECHO | [evidencias/T13.md](evidencias/T13.md) | Pago por tarjeta y pago del conjunto. T14 ya siguió |
| [T14](tareas/T14-presupuesto.md) | HECHO | [evidencias/T14.md](evidencias/T14.md) | Extra declarado, cubetas v1. T15 ya siguió |
| [T15](tareas/T15-anomalias.md) | HECHO | [evidencias/T15.md](evidencias/T15.md) | Diferencia descrita, sin prueba de error. T16 ya siguió |
| [T16](tareas/T16-entrevista-evidencia.md) | HECHO | [evidencias/T16.md](evidencias/T16.md) | Respuesta sí, no o no sé. No persiste. T17 ya siguió |
| [T17](tareas/T17-rondas-respuestas.md) | HECHO | [evidencias/T17.md](evidencias/T17.md) | Plazo sin política queda pendiente. T18 ya siguió |
| [T18](tareas/T18-avance-comparacion.md) | HECHO | [evidencias/T18.md](evidencias/T18.md) | Ausencia observada, sin causa. T19 ya siguió |
| [T19](tareas/T19-plan-accion.md) | HECHO | [evidencias/T19.md](evidencias/T19.md) | Acciones por datos, sin puntos. T20 ya siguió |
| [T20](tareas/T20-funding-programas.md) | HECHO | [evidencias/T20.md](evidencias/T20.md) | Programa versionado, sin monto. T21 ya siguió |
| [T21](tareas/T21-capacidad-financiera.md) | HECHO | [evidencias/T21.md](evidencias/T21.md) | DTI y DSCR sin préstamo. T22 ya siguió |
| [T22](tareas/T22-ui-credito.md) | HECHO | [evidencias/T22.md](evidencias/T22.md) | La cifra vacía no se ve como 0% ni como USD. T23 ya siguió |
| [T23](tareas/T23-portal.md) | HECHO | [evidencias/T23.md](evidencias/T23.md) | El portal no entrega lo ajeno ni un monto aprobado. T25 ya siguió |
| [T24](tareas/T24-seguridad.md) | HECHO | [evidencias/T24.md](evidencias/T24.md) | Guard de sesión y SSN oculto. T05 ya siguió |
| [T25](tareas/T25-politicas-operativas.md) | HECHO | [evidencias/T25.md](evidencias/T25.md) | Sin política revisada el envío y el cobro quedan en revisión. T26 ya siguió |
| [T26](tareas/T26-corpus-ci.md) | HECHO | [evidencias/T26.md](evidencias/T26.md) | F01–F30 corren en el smoke del CI. T27 ya siguió |
| [T27](tareas/T27-rendimiento-observabilidad.md) | HECHO | [evidencias/T27.md](evidencias/T27.md) | 250 cuentas medidas, sin p95 prometido. T28 ya siguió |
| [T28](tareas/T28-recorrido-lanzamiento.md) | HECHO | [evidencias/T28.md](evidencias/T28.md) | Recorrido sintético. La activación sigue apagada |

## Continuidad

Al cerrar sesión: actualizar tarea actual, paso exacto pendiente, archivos modificados y verificaciones realizadas. Copiar detalles a evidencias/Txx.md. No poner datos personales ni secretos en este archivo.
