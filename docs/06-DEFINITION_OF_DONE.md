# DEFINITION OF DONE

Una funcionalidad no está terminada solo porque tenga pantalla.

## Reglas globales

Toda historia debe cumplir, según corresponda:

- modelo de datos;
- backend;
- validación;
- UI;
- permisos;
- Activity;
- manejo de errores;
- estados vacíos;
- loading;
- QA;
- responsive;
- no romper flujos existentes.

## Lead terminado (UI; modelo = Client + Opportunity)

No hay tabla `Lead`. Ver `ARCHITECTURE_V1.md`.

```text
✓ se crea Client + Opportunity
✓ se edita
✓ se asigna
✓ tiene fuente
✓ tiene interés
✓ tiene nextFollowUpAt
✓ aparece en dashboard
✓ mantiene historial
✓ WON crea ServiceCase sin duplicar persona
✓ puede marcarse LOST
✓ no elimina Opportunity
```

## ServiceCase terminado

```text
✓ se crea
✓ pertenece a Client
✓ pertenece a Service
✓ tiene status
✓ tiene stageId (WorkflowStage; no string stage)
✓ tiene nextActionAt
✓ mantiene historial de etapas nuevas (ServiceCaseStageHistory)
✓ soporta tareas
✓ soporta documentos
✓ soporta notas
✓ soporta pagos
```

## Reparación de crédito terminada

```text
✓ crea expediente
✓ recibe documentos
✓ registra reporte
✓ registra elementos
✓ crea ronda
✓ relaciona elementos con ronda
✓ almacena fecha de envío
✓ agenda revisión
✓ crea tarea
✓ registra respuesta
✓ registra resultado
✓ permite ronda siguiente
✓ permite finalizar
✓ conserva timeline
```

## Pago terminado

```text
✓ registra monto
✓ registra método
✓ registra fecha
✓ registra servicio
✓ permite varios pagos
✓ calcula total pagado
✓ calcula saldo
✓ conserva historial
```

## Documento terminado

```text
✓ guarda metadata
✓ archivo privado
✓ valida permisos
✓ genera acceso temporal
✓ registra Activity
✓ maneja error de upload
✓ no expone URL permanente
```

## Ticket terminado

Un ticket pasa a DONE solamente después de:

```text
IMPLEMENTED
↓
VERCEL PREVIEW
↓
QA
↓
BUGS RESUELTOS
↓
REGRESSION PASS
↓
DONE
```
