---
type: guide
title: Fórmulas de crédito y fondeo — qué está respaldado y qué no
description: Registro de evidencia de cada regla del Score Plan, el Plan de Acción y la calculadora de fondeo, con fuente y fecha.
tags: [credito, fondeo, fuentes, auditoria]
timestamp: 2026-11-15T00:00:00Z
topic: guias
slug: formulas-credito-respaldo
---

# Fórmulas de crédito y fondeo — registro de evidencia

Revisado el 2026-11-15 contra fuentes públicas y oficiales. **Fondify no es fuente**: solo se usó su
pantalla como referencia de funciones (inventario del 2026-10-08). No se entra a su cuenta, API ni código.

Estados: **RESPALDADA** (norma o dato oficial), **GUÍA** (regla práctica aceptada, no norma),
**MERCADO** (depende de cada prestamista y cambia; hay que fecharla), **PROPIA** (nuestra, sin fuente).

## Reglas de ley y de operación

| Regla en el código | Qué dice la fuente | Estado | Acción |
| --- | --- | --- | --- |
| Negativos salen a los 7 años desde la primera morosidad (+180 días en cobranzas) — `negative-review.ts` | 15 U.S.C. §1681c: 7 años; cuentas en cobranza, 180 días después de la morosidad ([Cornell LII](https://www.law.cornell.edu/uscode/text/15/1681c)) | RESPALDADA | Mantener |
| La misma regla de 7 años se aplica a **quiebras** | §1681c(a)(1): quiebras (Título 11) **10 años** desde la orden de relief | **ERROR** | Corregir: 10 años para quiebras |
| Plazo de cancelación = 3 **días naturales** en UTC — `legal-gate.ts` | CROA §1679e: hasta medianoche del tercer **día hábil** ([Cornell LII](https://www.law.cornell.edu/uscode/text/15/1679e)) | **INCUMPLE** (plazo más corto) | Contar días hábiles (sin domingos ni feriados federales) — confirmar con abogado |
| Se puede enviar una ronda o cobrar tras la firma | CROA §1679b(b): ningún servicio antes de firmar ni antes de terminar el periodo de 3 días hábiles ([FTC](https://www.ftc.gov/system/files/documents/cases/192_3059_boost_my_score_stipulation_filed_1.pdf)) | **FALTA** | Bloquear envío de rondas y enlace de pago hasta fin del periodo — confirmar con abogado |
| Texto "Notice of Cancellation" | §1679e(b): formulario con texto exacto | A verificar | Abogado |

## Reglas de puntaje

| Regla | Fuente | Estado |
| --- | --- | --- |
| Pesos FICO: pagos 35 %, deuda 30 %, antigüedad 15 %, nuevo crédito 10 %, mezcla 10 % | [myFICO](https://www.myfico.com/credit-education/whats-in-your-credit-score) | RESPALDADA (solo FICO; VantageScore usa otros) |
| Uso de tarjetas < 30 % | [Experian](https://www.experian.com/blogs/ask-experian/credit-education/score-basics/what-affects-your-credit-scores/) y [CFPB](https://www.consumerfinance.gov/archive/blog/credit-score-myths-might-be-holding-you-back-improving-your-credit/): regla práctica; los mejores puntajes suelen estar bajo 10 % | GUÍA — mostrarla así, con < 10 % como ideal |
| Consultas: "4 o más en 6 meses es mala señal" | myFICO: solo cuentan las de los últimos 12 meses; permanecen 2 años en el reporte. Los prestamistas suelen mirar 6 meses | PROPIA — se conserva como criterio de la agencia, etiquetado |
| El Score Plan no predice puntos | Decisión del código (`utilization-plan.ts`) | Correcto: mantenerlo |

## Calculadora de fondeo (`funding-calc.ts`, versión `fc01-2026-10-28`)

| Regla | Fuente | Estado | Acción |
| --- | --- | --- | --- |
| SBA 7(a) exige puntaje 680 y "SBA no fija score" | SBA subió el SBSS mínimo a 165 el 2025-06-01; el aviso 5000-876777 (2026-02-20) lo retiró desde 2026-03-01: cada banco aplica su política y debe documentar capacidad de pago (DSCR) ([NAGGL](https://www.naggl.org/sba-notice-formally-announcing-sunsetting-of-sbss-scoring-and-providing-new-underwriting-requirements-for-7a-small-loans/), [Coleman Report](https://colemanreport.com/main-street-monday-sba-replaces-its-january-16-small-loan-7a-sop-notice-here-is-what-changed/)) | El 680 es **MERCADO** y el texto está desactualizado | Quitar el 680 como requisito duro; mostrar "lo decide el banco: pide flujo de caja (DSCR), 2+ años, historial" |
| Línea de crédito: 625, 6 meses, ventas ≥ 8 000 USD/mes | Bluevine: 625, 12+ meses, 120 000 USD/año; OnDeck: 625 y 1 año; Fundbox: 600, 30 000 USD/año, 3–6 meses ([Bluevine](https://www.bluevine.com/business-loans), [OnDeck](https://www.ondeck.com/?p=197525), [NerdWallet](https://www.nerdwallet.com/business/loans/learn/bluevine-vs-fundbox)) | MERCADO | Mostrar dos niveles con fuente y fecha: "accesible" (600 / 30 000 USD / 3–6 m) y "estándar" (625 / 120 000 USD / 12 m) |
| Rango de línea = 10–15 % de las ventas anuales | Nadie publica una fórmula | PROPIA | Quitar el monto o mostrarlo como "ilustrativo", nunca como estimado |
| Préstamo personal (tasas de **nov 2026**: Experian las publica por mes y cambian unas décimas, p. ej. 10,99 % a 740 en nov y 11,10 % en ago): mínimo 640; APR 12 / 18 / 26 % por puntaje; topes 50 000 / 35 000 / 15 000 | Experian/Curinos (nov 2026, 36 meses): 12,25 % a 720; 15,06 % a 680; 17,58 % a 640; 18,30 % a 620. NerdWallet (pre-calificaciones): 15,1 % excelente, 19,6 % bueno, 23,9 % regular, 27,4 % malo ([Experian](https://www.experian.com/blogs/ask-experian/best-personal-loan-rates/), [NerdWallet](https://www.nerdwallet.com/personal-loans/learn/average-personal-loan-rates)). Mínimos publicados: 600 a 680 según prestamista | MERCADO | Usar la tabla de Experian por puntaje (fecha y fuente visibles); los topes pasan a "tope prudente" |
| Deuda/ingreso máximo 40 % | El 43 % era el límite de hipotecas calificadas y la regla de 2020 lo retiró; no hay umbral único ([CFPB](https://www.consumerfinance.gov/about-us/blog/qualified-mortgages-what-are-they-and-what-do-they-mean-for-you/)) | GUÍA | Mantener 40 % como criterio prudente, etiquetado como tal |
| Puntaje de referencia = el del medio de los tres | Práctica de hipotecas | GUÍA | Mantener; indicar que cada prestamista usa su propio puntaje |
| "Cobranzas/cancelaciones frenan el préstamo" | Práctica de suscripción, sin cifra única | GUÍA | Mantener, sin número |

## Lo que no se puede respaldar (decisión de producto)

- El monto "estimado" de líneas de negocio no tiene fórmula pública. Se muestra como ilustrativo o se quita.
- Ningún prestamista publica sus reglas exactas; todo resultado es una orientación. El aviso existente
  («no es una aprobación ni una oferta») se mantiene en pantalla y en el PDF.

## Verificaciones pendientes

- §1681c (7 y 10 años, 180 días en cobranzas) y §1679b/§1679e (CROA): el texto de la ley se consultó vía Cornell LII y un escrito de la FTC, pero lo confirma el abogado.
- Bluevine publica sus ventas mínimas de formas distintas (120 000 al año o 10 000 al mes); se usa 10 000 al mes. Fundbox: 3 o 6 meses según la fuente; se usa 6 (el más prudente).
- «Fecha» de una quiebra en el reporte (`dateOpened`): puede ser la presentación o el descargo; el texto pide confirmarla.

## Revisión periódica

Los valores de MERCADO se vuelven a verificar cada 6 meses o ante un cambio de la SBA. Cada valor lleva
su fuente y la fecha de verificación en `src/lib/credit/sources.ts`; `smoke:credit-sources` falla si
falta una fecha o si una cifra de mercado tiene más de 6 meses.
