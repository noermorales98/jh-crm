# Runbook de activación

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

El 22 de octubre de 2026 la migración ya no bloquea la compuerta. `activationGate` sigue en no lista: no hay una política de plazos revisada ni un programa de prestamista revisado. La lectura nueva y el cobro siguen apagados.

## Flags

- `isCreditIdentityReadEnabled` nace con la lista vacía. Ninguna organización lee la vista nueva.
- No hay una columna nueva en `OrganizationSettings`.
- `FEATURE_CLIENT_PORTAL` sigue siendo el interruptor del portal. Esta tarea no lo enciende.
- `computeFundingEstimate` sigue sin monto. Apagar la lectura nueva no vuelve a mostrar puntos ni un monto aprobado.

## Qué vigilar

- El evento de telemetría solo trae tipo, duración, versión, conteo, calidad e id. No trae nombre, SSN, saldo ni PDF.
- No hay un p95 prometido. Una muestra vacía no inventa presupuesto.
- El cobro sin política revisada queda en `REVIEW` y no mueve dinero.

## Recuperación

1. Vaciar la lista que recibe `isCreditIdentityReadEnabled`. La lectura vuelve a la de siempre.
2. No borrar reportes, revisiones ni acciones ya guardadas.
3. Una unión incorrecta se separa con `splitIdentity`. No se reescribe una carta ya enviada.
4. No correr `db push` ni `migrate reset` contra la base configurada.

## Estado el 22 de octubre de 2026

- `20261019233000_credit_additive_identity` está aplicada en la base configurada. `prisma migrate deploy` terminó en 0 y no había pendientes. Este paso no insertó filas. El ensayo local de T03 y T06 se borró.
- La compuerta de esta base lleva `migrationApplied: true`. `ready` sigue en false por `POLICY` y `PROGRAM`.
- No hay una política de plazos validada. El plazo legal sigue pendiente de determinar.
- No hay un programa de un prestamista revisado. Un `PASS` interno no es una aprobación y no tiene monto.
- El cobro no se enciende solo. Sin política revisada queda en `REVIEW` y no mueve dinero.

## Comprobación

`npm run smoke:credit-journey` recorre las cifras sintéticas y comprueba que la compuerta no está lista. La pantalla, el PDF de una sesión y la base configurada quedan fuera de ese comando.
