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

## Lead terminado

```text
✓ se crea
✓ se edita
✓ se asigna
✓ tiene fuente
✓ tiene interés
✓ tiene seguimiento
✓ aparece en dashboard
✓ mantiene historial
✓ se convierte sin duplicación
✓ puede marcarse perdido
```

## ServiceCase terminado

```text
✓ se crea
✓ pertenece a Client
✓ pertenece a Service
✓ tiene status
✓ tiene stage
✓ tiene nextActionAt
✓ mantiene historial de etapas
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
