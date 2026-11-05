---
type: spec
title: Spec — Pruebas con base de datos en el CI
description: WHAT and WHY de ejecutar la prueba de contratos en GitHub y cerrar sus huecos.
tags: [sdd, spec, ci, tests, contracts]
timestamp: 2026-11-05T22:30:00Z
topic: sdd
slug: pruebas-bd-en-ci
branch: ci/pruebas-bd-en-ci
status: approved
approved_by: Noeli, 2026-11-05 ("Sí, apruebo ambas")
---

# Spec — Pruebas con base de datos en el CI

> Slug: `pruebas-bd-en-ci` · Status: approved · Created: 2026-11-05
> Inherits: [constitution](../constitution.md) v1.0.0 — principios 5, 6, 7 y 13.
> Cierra los dos huecos importantes de [progress/rondas-y-pagos-contrato-firmado](../progress/rondas-y-pagos-contrato-firmado.md).

## Problem & why
La prueba que demuestra las reglas de contratos solo corre a mano, porque necesita una base de
datos. GitHub no la ejecuta. Además, no comprueba la regla "una ronda no puede usar el contrato de
otro caso del mismo cliente". Si alguien rompe esa regla sin querer, nada avisa. La constitución
(principio 6) pide que estas pruebas corran en GitHub.

## Cost of not building it
- Un fallo en el envío de rondas o en los cobros puede llegar a main sin que nada lo detecte, como
  pasó el 23 de octubre, cuando se bloquearon las rondas y se perdieron pagos.
- La constitución queda incumplida en su principio 6 desde el primer día.
- Cada cambio en contratos o pagos depende de que alguien recuerde ejecutar la prueba a mano.

## The cheapest alternative
Ejecutar la prueba a mano antes de cada unión y pegar el resultado en el PR. No cuesta nada, pero
depende de la memoria de quien hace el cambio, y la regla de "otro caso" seguiría sin probar.

## Goals
- En cada PR y en cada subida a main, GitHub ejecuta la prueba de contratos contra una base de datos
  de prueba vacía, recién preparada.
- La prueba demuestra que el contrato de otro caso del mismo cliente no vale, ni para enviar una
  ronda ni para crear un enlace de pago.
- La prueba comprueba lo que hoy da por supuesto: que la ronda enviada guarda su fecha de revisión y
  su tarea, que una ronda rechazada no cambia, y que el pago manual queda guardado.

## Non-goals / out of scope
- Mover a GitHub las demás pruebas con base de datos (las `smoke:*` que usan `.env.local`).
  Se podrá hacer después, una a una.
- Cambiar el código de contratos, rondas o pagos. Solo cambian la prueba y GitHub.
- Probar un pago real de Stripe. En GitHub no hay claves de Stripe.
- Decidir las reglas de negocio pendientes: el contrato de un caso borrado y la cotización sin caso.
- Que el paso de base de datos frene la construcción actual: va en un trabajo aparte de GitHub.

## Users & context
- **La dueña y quien cambie el código:** quieren saber, antes de unir, que contratos y pagos siguen
  funcionando, sin ejecutar nada a mano.

## What the user can do
Abrir un PR o subir a main. No tiene que hacer nada más: GitHub ejecuta la prueba solo.

## What result they get
- En la página del PR aparece una comprobación nueva con el nombre de la prueba de base de datos.
- Si todo cumple, sale en verde. Si se rompe una regla de contratos o pagos, sale en rojo y el
  registro dice qué comprobación falló.
- Referencia: el registro de la prueba lista cada comprobación con ✓ o ✗, como hoy en local.

## What it must respect
- El trabajo actual de GitHub (lint, tipos, pruebas sin base de datos y construcción) sigue igual y
  sigue sin preparar ninguna base real (regla TEST-007 de `.github/workflows/qa.yml`).
- La prueba solo corre contra una base desechable llamada `jh_gates` en la propia máquina; nunca
  contra una base real. Ya lo exige la propia prueba.
- Ningún secreto real entra en GitHub: la base de prueba usa una contraseña de relleno (principio 15).
- Nunca se debilita una comprobación existente para que pase (principio 5).

## How it proves it
- La prueba ampliada se ejecuta en local contra una MySQL desechable. Su salida queda en el PR.
- Se comprueba que la nueva comprobación de "otro caso" **falla** si se quita el filtro de caso de la
  regla de contratos, y pasa con el código actual. La salida de ambas ejecuciones queda en el PR.
- El PR muestra el trabajo nuevo de GitHub en verde.

## Behaviour
- Main path: se abre o actualiza un PR → GitHub levanta una MySQL vacía → aplica las migraciones →
  ejecuta la prueba de contratos → verde si todas las comprobaciones pasan.
- Edge cases: el trabajo de base de datos corre aparte del de construcción; un fallo en uno no
  oculta el resultado del otro.
- Error paths: si las migraciones o la base fallan al arrancar, el trabajo sale en rojo con el
  motivo en el registro, y no se ejecuta la prueba.

## Acceptance criteria
- Given un cliente con un contrato firmado solo para su caso B, When el equipo marca como enviada
  una ronda de su caso A, Then se rechaza y la ronda no cambia.
- Given ese mismo cliente, When se pide el enlace de pago de una cotización del caso A, Then se
  rechaza por falta de contrato.
- Given la regla de contratos sin el filtro de caso, When se ejecuta la prueba, Then falla la
  comprobación de "otro caso".
- Given un contrato firmado para el caso, When la ronda se envía, Then queda guardada con su fecha de
  revisión y con una tarea de revisión.
- Given un pago manual registrado, When se cuentan los pagos del caso, Then hay uno más.
- Given un PR abierto, When GitHub termina, Then aparece el trabajo de base de datos y está en verde.
- Given el trabajo actual de GitHub, When termina, Then sus pasos son los mismos que antes.

## Points to clarify
- **suposición tomada** — GitHub usa una MySQL 8 de prueba. *Base:* el proyecto usa MySQL con
  Prisma. *Riesgo:* si producción usa MariaDB y alguna migración se comporta distinto, habría que
  cambiar la imagen.
- **suposición tomada** — el trabajo de base de datos corre en cada PR y en cada subida a main, como
  el actual. *Base:* el disparador de `qa.yml`. *Riesgo:* unos minutos más por PR.
- **decisión diferida** — hacer obligatoria esta comprobación para unir en GitHub (regla de rama).
  Es un ajuste de GitHub que hace la dueña.
- **decisión diferida** — mover las demás pruebas con base de datos a GitHub.

## Revisions
- 2026-11-05 — primera versión.
- 2026-11-05 — aprobada por la dueña, junto con la rama `ci/pruebas-bd-en-ci`.
