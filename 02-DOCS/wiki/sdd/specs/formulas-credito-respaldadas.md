---
type: spec
title: Spec — Fórmulas de crédito y fondeo respaldadas
description: WHAT y WHY de que cada regla del Plan de Acción, el Score Plan y la calculadora de fondeo tenga fuente y fecha, y corregir las que están mal.
tags: [sdd, spec, credito, fondeo, fuentes]
timestamp: 2026-11-15T00:00:00Z
topic: sdd
slug: formulas-credito-respaldadas
branch: claude/formulas-credito
status: approved
approved_by: Noeli, 2026-11-15 ("La apruebo")
---

# Spec — Fórmulas de crédito y fondeo respaldadas

> Slug: `formulas-credito-respaldadas` · Status: approved · Created: 2026-11-15
> Inherits: [constitution](../constitution.md). Evidencia: [formulas-credito-respaldo](../../guias/formulas-credito-respaldo.md).

## Problem & why

Parte de lo que el CRM muestra como cálculo de crédito y fondeo son reglas internas heredadas de
imitar pantallas de un competidor, sin fuente. Algunas están mal (las quiebras salen a los 10 años,
no a los 7), otras están desactualizadas (la SBA retiró su puntaje mínimo el 2026-03-01) y otras
presentan como estimado un monto que nadie publica (10–15 % de las ventas). Un asesor o un cliente
puede tomar decisiones con ellas.

## Cost of not building it

Se promete a un cliente un fondeo o un plazo que la ley o el mercado no respaldan; con CROA, una
promesa errónea es un riesgo legal y reputacional.

## The cheapest alternative

Solo quitar los montos. Quita el riesgo mayor, pero deja el 680 de la SBA, las quiebras a 7 años y
las tasas sin fuente. Por eso se corrigen también los criterios y se les pone fuente.

## Goals

- Cada umbral o cifra que usa el cálculo tiene fuente y fecha de verificación visibles.
- Lo que no tiene respaldo público no se muestra como estimado.
- Las reglas de ley se aplican como la ley.

## Non-goals / out of scope

- **Cancelación en días hábiles y bloqueo de servicios durante los 3 días (CROA §1679e y §1679b):** se
  documenta en la guía de evidencia y se lleva al abogado. No se cambia el comportamiento hasta su
  respuesta (decisión de Noe, 2026-11-15).
- Entrar a cuentas, API o código de Fondify. La referencia a Fondify es solo funcional.
- Predecir cambios de puntos. El Score Plan sigue sin hacerlo.
- Stripe en vivo e IAs de pago (se hacen después).

## Users & context

Asesores de JH que leen el Plan de Acción y la calculadora de fondeo, y clientes que ven el resumen
en el portal o en un PDF.

## What the user can do

Lo mismo que hoy: ver el plan de acción, la calculadora de fondeo y el Score Plan de un cliente.

## What result they get

- Cada requisito de la calculadora dice de dónde sale y cuándo se verificó.
- SBA 7(a) no exige un puntaje fijo: dice que decide el banco con flujo de caja (DSCR), antigüedad e
  historial.
- La línea de crédito de negocio se evalúa por dos niveles publicados (accesible y estándar), sin
  monto estimado por fórmula propia.
- El préstamo personal usa las tasas medias por puntaje de una fuente fechada.
- Una quiebra se sugiere para salida a los 10 años; el resto, a los 7 desde la primera morosidad.
- Las consultas siguen en la ventana de 6 meses que miran los prestamistas, etiquetada como criterio de la agencia (FICO cuenta 12 meses y no publica un número).

## What it must respect

Sin promesas (CROA): el aviso «no es una aprobación ni una oferta» se mantiene. Sin cambios de
esquema ni datos. Los PDFs y el portal usan los mismos textos. Español sencillo.

## How it proves it

Pruebas de humo de la calculadora y de la revisión de negativas con los casos reales (el reporte de
referencia), más casos nuevos de cada corrección; una prueba que falla si un umbral no trae fuente y
fecha en `src/lib/credit/sources.ts`.

## Behaviour

1. `src/lib/credit/sources.ts` guarda cada umbral con su fuente, su URL y su fecha de verificación.
2. `funding-calc.ts` lee los umbrales de ahí; sube la versión del cálculo.
3. `negative-review.ts` distingue quiebras (10 años) del resto (7 años).
4. La línea de negocio se evalúa contra el nivel accesible publicado, nombra el estándar y no calcula un monto.

## Acceptance criteria

- Ningún umbral de `funding-calc.ts` ni de `negative-review.ts` está fuera de `sources.ts`.
- Sin monto para línea de negocio ni SBA; el préstamo personal sigue con rango (tasa media por puntaje).
- Quiebra: sugerencia de salida a 10 años; cobranza y cargo: 7 años (+180 días).
- Consultas: se conserva la ventana de 6 meses, etiquetada como criterio de la agencia.
- Todos los textos con cifras de mercado muestran la fecha de verificación.

## Assumptions

- Experian/Curinos (nov 2026) es una fuente aceptable para tasas medias por puntaje.
- Las condiciones de Bluevine, OnDeck y Fundbox son referencia de mercado, no una regla.

## Points to clarify

- Ninguno abierto.
