---
type: spec
title: Spec — Desbloquear rondas y registrar siempre los pagos
description: WHAT and WHY del arreglo de rondas y pagos con contrato firmado (PR #39).
tags: [sdd, spec, rounds, payments, contracts]
timestamp: 2026-11-05T21:00:00Z
topic: sdd
slug: rondas-y-pagos-contrato-firmado
branch: fix/rondas-y-pagos-contrato-firmado
status: approved
approved_by: Noeli, 2026-11-05 ("Sí, la apruebo")
---

# Spec — Desbloquear rondas y registrar siempre los pagos

> Slug: `rondas-y-pagos-contrato-firmado` · Status: approved · Created: 2026-11-05
> Inherits: [constitution](../constitution.md) (todavía en borrador: no hereda principios ratificados)
> Ficha escrita **después** del código, para el PR #39. Describe lo que la rama ya hace.

## Problem & why
Desde el 23 de octubre, una comprobación pedía un permiso que no se podía guardar en ningún sitio.
Por eso el equipo no podía marcar ninguna ronda de disputas como enviada. Además, cuando un cliente
pagaba por Stripe una cotización ligada a un caso, el CRM no registraba el pago. Los pagos manuales
ligados a un caso también daban error. La agencia no podía trabajar ni cobrar con normalidad.

## Cost of not building it
- Ninguna ronda avanza: los clientes no reciben el servicio por el que pagan.
- Hay pagos cobrados que el CRM no registró. El equipo no sabe quién ha pagado y puede reclamar
  dinero que ya se cobró.
- Cada día que pasa hay más pagos perdidos que revisar a mano en Stripe.

## The cheapest alternative
Quitar la comprobación rota y no poner nada en su lugar. Desbloquea todo en minutos, pero deja que
se envíen rondas a clientes sin contrato firmado. Eso es un riesgo legal para la agencia. Por eso
se cambió el permiso imposible por una condición que sí se puede cumplir: un contrato firmado.

## Goals
- El equipo puede marcar una ronda como enviada cuando el cliente tiene un contrato firmado.
- Todo pago recibido (por Stripe o manual) queda registrado en el CRM, siempre.
- El contrato se exige antes de cobrar, al crear el enlace de pago, y no después.
- La pantalla explica qué falta cuando no se puede enviar una ronda.

## Non-goals / out of scope
- La revisión legal del contrato. Sigue pendiente y este cambio no la sustituye.
- Reenviar los webhooks de Stripe que fallaron desde el 23 de octubre. Se hace a mano después de
  desplegar.
- Importar de golpe los contratos firmados fuera del CRM.
- Nuevos permisos o roles para el equipo.
- Cambios en el portal del cliente.

## Users & context
- **Equipo de la agencia:** prepara y envía rondas de disputas, registra pagos manuales y crea
  enlaces de pago para cotizaciones.
- **Cliente:** paga una cotización con el enlace de pago de Stripe.

## What the user can do
- Un miembro del equipo puede marcar una ronda como enviada si el cliente tiene un contrato firmado
  para ese caso, o un contrato firmado sin caso asignado.
- Un miembro del equipo puede registrar un pago manual ligado a un caso, con o sin contrato.
- Un miembro del equipo puede crear el enlace de pago de una cotización ligada a un caso solo si el
  cliente tiene un contrato firmado.
- Un cliente puede pagar con ese enlace, y su pago queda registrado.

## What result they get
- Con contrato: la ronda queda en estado enviada, con su fecha de revisión y su tarea de
  seguimiento. Así se comprobó en pantalla con una base local (PR #39, sección "Comprobado").
- Sin contrato: la ronda no cambia y la pantalla muestra un aviso que dice que falta el contrato.
- Un pago de Stripe o un pago manual aparece en el CRM aunque el caso no tenga contrato.
- Al pedir un enlace de pago de un caso sin contrato, el CRM lo rechaza y explica el motivo.

## What it must respect
- Lo que ya se cobró no se puede perder: registrar un pago nunca depende del contrato.
- Las rondas de un caso no pueden usar el contrato de otro caso distinto.
- El calendario para elegir fecha tiene que abrirse delante del diálogo "Marcar enviada", no detrás.
- Las comprobaciones automáticas del proyecto (lint, tipos y build) tienen que seguir pasando.
- No hay decisiones previas en `02-DOCS/wiki/sdd/decisions.md` ni otras fichas: esta es la primera.

## How it proves it
- Una prueba nueva contra una base de datos de prueba: sin contrato la ronda se rechaza, con
  contrato se envía, y los pagos se registran siempre. Falló antes del arreglo y pasa después.
- Las comprobaciones automáticas del proyecto pasan, en local y en el CI de GitHub del PR #39.
- La comprobación en pantalla está descrita en el PR #39.
- **Sin comprobar todavía:** un pago real de Stripe en modo prueba de punta a punta, y las demás
  pruebas con base de datos que se ajustaron. Constan en el PR.

## Behaviour
- Main path: el equipo marca la ronda como enviada → el CRM busca un contrato firmado del cliente
  para ese caso o sin caso → lo encuentra → la ronda pasa a enviada, con fecha de revisión y tarea.
- Edge cases: el contrato del cliente está asignado a otro caso → no vale y la ronda no se envía.
  El cliente tiene varios contratos firmados → basta con uno que valga.
- Error paths: sin contrato válido → la ronda no cambia y la pantalla dice qué falta. Llega un pago
  de Stripe de un caso sin contrato → se registra igual y no se responde con error.

## Acceptance criteria
- Given un cliente con un contrato firmado para el caso, When el equipo marca la ronda como
  enviada, Then la ronda queda enviada, con su fecha de revisión y su tarea.
- Given un cliente con un contrato firmado sin caso asignado, When el equipo marca la ronda como
  enviada, Then la ronda queda enviada.
- Given un cliente sin contrato firmado, When el equipo marca la ronda como enviada, Then la ronda
  no cambia y se muestra el aviso de contrato.
- Given un cliente cuyo único contrato es de otro caso, When el equipo marca la ronda como enviada,
  Then la ronda no cambia.
- Given una cotización de un caso sin contrato, When llega su pago de Stripe, Then el pago queda
  registrado y el CRM responde sin error.
- Given un caso sin contrato, When el equipo registra un pago manual, Then el pago queda registrado.
- Given una cotización de un caso sin contrato, When el equipo pide su enlace de pago, Then se
  rechaza y se explica que falta el contrato.
- Given el diálogo "Marcar enviada" abierto, When se abre el calendario, Then el calendario se ve
  delante del diálogo.

## Points to clarify
- **suposición tomada** — el contrato firmado pasa a ser obligatorio para enviar rondas y para
  crear enlaces de pago de un caso. *Base:* el PR #39 lo marca como decisión de negocio y la dueña
  lo aceptó al pedir unirlo en main. *Riesgo:* los clientes con contrato firmado fuera del CRM se
  quedan bloqueados hasta que alguien lo registre.
- **decisión diferida** — reenviar los webhooks de Stripe fallidos desde el 23 de octubre. Se hace
  a mano después de desplegar.
- **decisión diferida** — la revisión legal del texto del contrato.
- **área no formulable** — la ficha se escribió después del código. Si la constitución añade
  reglas de calidad nuevas, puede que haya que revisar esta rama con ellas.

## Revisions
- 2026-11-05 — primera versión, escrita después del código para el PR #39.
- 2026-11-05 — aprobada por la dueña, sin cambios.
