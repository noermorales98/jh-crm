# QA PLAN — Grok Bot / QA manual

## Objetivo

Probar cada vertical funcional desde Vercel Preview antes de hacer merge.

## Regla

Nunca usar producción como entorno de pruebas.

## Formato de bug

```text
ID:
Severidad:
Feature:
URL:
Usuario:
Precondiciones:

Pasos:
1.
2.
3.

Esperado:

Actual:

Evidencia:

Notas:
```

## Severidad

```text
BLOCKER
CRITICAL
HIGH
MEDIUM
LOW
```

## Suite — Lead

- crear lead válido;
- intentar crear sin campos requeridos;
- cambiar status;
- programar follow-up;
- marcar LOST;
- convertir;
- intentar conversión duplicada;
- verificar source después de conversión.

## Suite — Client

- abrir ficha;
- editar;
- agregar segundo servicio;
- verificar independencia entre ServiceCase.

## Suite — ServiceCase

- crear;
- cambiar stage;
- revisar StageHistory;
- crear nextActionAt;
- completar;
- poner ON_HOLD.

## Suite — Tasks

- crear;
- completar;
- vencida;
- hoy;
- futura;
- cancelar;
- visualizar en dashboard.

## Suite — Documents

- upload permitido;
- tipo inválido;
- archivo grande;
- acceso sin permiso;
- descarga autorizada;
- URL temporal;
- documento eliminado/archivado.

## Suite — Credit Repair

1. crear CreditCase;
2. agregar reporte;
3. registrar CreditItems;
4. crear ronda;
5. agregar items;
6. marcar SENT;
7. verificar Activity;
8. verificar Task;
9. revisar resultado;
10. crear siguiente ronda;
11. completar expediente.

## Suite — Payments

- registrar pago;
- múltiples pagos;
- editar;
- verificar balance;
- evitar valores inválidos.

## Regression mínima antes de merge

```text
Login
Dashboard
Lead create
Lead conversion
Client open
ServiceCase open
Task create
Document access
CreditCase open
Payment calculation
```
