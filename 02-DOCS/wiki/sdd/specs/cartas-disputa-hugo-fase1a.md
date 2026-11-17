---
type: spec
title: Spec — Cartas y estrategias de disputa según las reglas de Hugo (Fase 1, parte A)
description: WHAT y WHY de alinear las estrategias y plantillas de carta del CRM con las reglas de Hugo, sin migración.
tags: [sdd, spec, disputas, cartas]
timestamp: 2026-11-17T15:00:00Z
topic: sdd
slug: cartas-disputa-hugo-fase1a
status: draft
---

# Spec — Cartas y estrategias de disputa según las reglas de Hugo (Fase 1, parte A)

> Slug: `cartas-disputa-hugo-fase1a` · Status: draft · Created: 2026-11-17
> Inherits: [constitution](../constitution.md)
> Fuente de reglas: `.claude/skills/asistente-de-disputas/SKILL.md` y `docs/hugo/IMPLEMENTACION-CRM.md` §1 y "Decisiones de Hugo (17/11/2026)".
> Es la parte A de la Fase 1. La parte B (reglas en la IA y direcciones de burós) y la parte C (contrato CROA) van en specs aparte.

## Problem & why
Las cartas que genera el CRM contradicen las reglas de Hugo. La carta de exactitud argumenta que los
datos "no coinciden con los otros burós", y Hugo dice que un buró solo responde por su propio archivo y
que ese argumento puede empeorar la cuenta. El encabezado no sigue el formato de LetterStream, los
anexos son incompletos, no se pide el método de verificación en la primera ronda, no se avisa del CFPB,
la carta de consultas dice "no las autoricé" sin confirmación del cliente, y no existen cartas de
charge-off, colección, goodwill, validación de deuda ni disputa directa al acreedor. Hoy Hugo rehace las
cartas a mano en su propio Claude; el CRM no le sirve para su trabajo principal.

## Cost of not building it
Hugo sigue redactando las cartas fuera del CRM. Cada carta generada hoy y enviada tal cual lleva un
argumento que Hugo considera débil o riesgoso y, en consultas, una afirmación ("no las autoricé") que la
CROA prohíbe hacer sin confirmación del cliente. El riesgo de cumplimiento crece con cada cliente
nuevo que use esas plantillas.

## The cheapest alternative
Cambiar solo el texto de la plantilla de exactitud y dejar el resto. No basta: faltarían las cartas de
charge-off, seguimiento, acreedor y CFPB, y no se resolvería la agrupación (una carta por buró por tipo)
ni el nombre de archivo. Tampoco se puede pedir a Hugo que siga rehaciendo cartas a mano: es justo el
trabajo que el CRM debe quitarle.

## Goals
- Que la carta de Ronda 1 sea específica por buró, con el texto exacto de Hugo, y sirva de plantilla por defecto.
- Que existan todas las plantillas fijas que Hugo pidió, y que las que él aún no aprobó no se puedan usar por error.
- Que el CRM sugiera la estrategia correcta por tipo de cuenta y, en Ronda 2, según lo que respondió el buró.
- Que cada carta salga agrupada como Hugo la envía (una por buró por tipo, con sus máximos) y con su nombre de archivo.

## Non-goals / out of scope
- **No hay migración de base de datos** (decisión de Noe: la Fase 2 va con su aprobación). Quedan fuera los campos nuevos de la cuenta (DOFD, Charge-Off Amount, historial), `deliveredAt`, `holdReason`, `FRIVOLOUS`, `BUREAU_RESPONSE` y el canal `FURNISHER`.
- Los plazos siguen contándose desde el envío. Pasar a "desde la entrega" es Fase 2.
- Exhibit A y Exhibit B en PDF, y el ensamblado de anexos, son Fase 3. Esta parte solo ajusta el texto y la mención de anexos.
- La compuerta de "el cliente confirmó" para consultas e información personal es Fase 2.
- Direcciones de burós editables en Configuración (Fase 2). Las reglas en la IA y `HOW_TO_GUIDE` son la spec B. El contrato CROA es la spec C.
- Integrar LetterStream por API. Cartas de robo de identidad. Una tercera ronda (Hugo no la ha definido).
- Cambiar el texto legal de las plantillas que Hugo ya aprobó (las de información personal, consultas y charge-off de su skill).

## Users & context
Hugo y su equipo (asesores y especialistas) preparan las rondas de disputa de cada cliente desde el
caso. Generan las cartas, las revisan a mano y las envían por LetterStream. Hugo es quien aprueba el
texto legal.

## What the user can do
Un usuario con permiso para editar rondas puede, desde el caso:
- Elegir una estrategia por cuenta (charge-off, colección, lates, consultas, información personal,
  seguimiento al buró, disputa directa al acreedor, validación de deuda, goodwill, queja al CFPB) y
  generar las cartas de la ronda.
- Ver la estrategia que el CRM sugiere y la razón, y cambiarla.
- Generar la carta de un tipo solo si su plantilla está aprobada. Las plantillas sin aprobar de Hugo
  se ven, pero no se pueden usar.

Un administrador puede activar una plantilla pendiente cuando Hugo la apruebe.

## What result they get
La referencia aprobada es el **texto de las plantillas de la skill de Hugo** (exportado el 16/11/2026),
que Hugo ya validó. El resultado correcto es que, con datos ficticios, la carta generada coincida con
ese texto con las variables rellenas:
- Información personal: plantilla de "Cartas de información personal".
- Consultas: plantilla de "Cartas de hard inquiries".
- Charge-off: plantilla de "Cartas de charge-off".

Para colección, goodwill, validación de deuda, seguimiento de Ronda 2, disputa directa al acreedor y
queja al CFPB no hay texto de Hugo todavía: se redactan con sus reglas y quedan marcadas como borrador
pendiente de su aprobación.

## What it must respect
- **Constitución:** una prueba en `scripts/smoke/` que falle sin el cambio, `lint` y `typecheck` en verde, y nada se da por hecho sin evidencia (principios 4, 5 y 7).
- **Revisión humana:** ninguna carta pasa a FINAL ni a enviada sin revisión de una persona (regla del modelo de cartas).
- **Datos existentes:** las rondas, cartas y disputas ya guardadas usan los valores `ACCURACY_R1`, `METHOD_R2`, etc. Siguen mostrándose bien y las estadísticas de efectividad por estrategia no se rompen.
- **Plantillas ya copiadas a cada organización:** hoy se copian la primera vez que se usan y solo se crean las que faltan. Una organización que ya las tiene no recibiría el texto nuevo por sí sola.
- **Skill de Hugo:** no se cambia el texto legal aprobado. Si una regla choca con el código, se señala.
- **Conector con Claude:** Claude no recibe el cuerpo de las cartas ni el valor de la información personal (decisión del 13/11). Esto no cambia.
- **Datos ficticios** en pruebas y seeds. Nunca datos reales de clientes.

## How it proves it
- Una prueba de humo por tipo de carta genera la carta con un cliente y un caso ficticios y la compara con el texto de referencia de la skill (diferencia exacta, no "se parece").
- Una prueba de agrupación: con varias cuentas ficticias, verifica una carta por buró por tipo, máximo 2 charge-offs y 5 consultas por carta, y una de información personal por buró.
- Una prueba de la sugerencia por tipo de cuenta y de la sugerencia de Ronda 2 por resultado.
- Una prueba de que una plantilla pendiente no genera carta y de que activarla la habilita.
- Una prueba de que un registro viejo con `ACCURACY_R1` o `GENERAL` sigue abriéndose y contándose en efectividad.
- La salida de las pruebas, `lint` y `typecheck` se pega en la verificación. Las pruebas con base de datos corren contra la MySQL desechable (`jh_gates`).

## Behaviour
- **Main path:** el usuario abre una ronda, el CRM sugiere una estrategia por cuenta según su tipo, el usuario genera las cartas y obtiene una por buró por tipo, con el encabezado de LetterStream, el bloque DATE/DOB/SSN a la derecha, la dirección completa del buró, la petición de resultados por escrito, el método de verificación en 15 días, el aviso de queja al CFPB y los tres anexos nombrados.
- **Prioridad sugerida:** charge-offs y colecciones, luego información personal, luego consultas de menos de 12 meses, y los lates cuando la cuenta lleve 2–3 meses al corriente. Un late de una cuenta que sigue atrasada se sugiere como "esperar".
- **Ronda 2 según la respuesta del buró:** borrada → cerrar y vigilar reinserción; actualizada con algo mal → seguimiento citando la carta 1; verificada sin atender los errores → método de verificación al buró más disputa directa al acreedor; sin respuesta → queja al CFPB. Las condiciones de tiempo (15 días sin método, 30 días desde la entrega) son Fase 2.
- **Edge cases:** más de 2 charge-offs de un buró → dos o más cartas; más de 5 consultas → más cartas; una cuenta cuyo tipo no se reconoce → la sugerencia cae en una disputa específica genérica marcada "no recomendada", nunca en la de exactitud entre burós.
- **Error paths:** al elegir una plantilla pendiente, el CRM explica que Hugo debe aprobarla y no genera la carta. La carta de consultas y la de información personal no llevan frases como "no las autoricé" o "no es mía".

## Acceptance criteria
- Given un cliente y un caso ficticios con un charge-off en TransUnion, When se genera la carta de charge-off, Then el texto coincide con la plantilla de Hugo con las variables rellenas, incluye la petición del método de verificación en 15 días y el aviso de queja al CFPB.
- Given un cliente con consultas en dos burós, When se generan las cartas de consultas, Then hay una carta por buró, cada una solo con las consultas de ese buró, y ninguna carta pasa de 5.
- Given tres charge-offs en un mismo buró, When se generan las cartas, Then hay dos cartas de ese buró (2 + 1 cuentas).
- Given información personal reportada en los tres burós, When se generan las cartas, Then hay una por buró con solo los datos de ese buró.
- Given cualquier carta nueva de Ronda 1, When se lee su texto, Then no contiene el argumento de que los datos "no coinciden con los otros burós".
- Given la carta de consultas, When se lee su texto, Then empieza con "I do not recognize this inquiry" (no "I did not authorize them").
- Given el encabezado de una carta, When se lee, Then la dirección del buró está completa en tres líneas, sin "Dispute Department" y sin comas, con DATE, DOB y SSN a la derecha.
- Given los anexos de una carta, When se lee la mención, Then nombra ID, comprobante de domicilio y tarjeta del Seguro Social.
- Given una plantilla pendiente de aprobación de Hugo, When un usuario intenta generar su carta, Then no se genera y se le dice por qué.
- Given una cuenta de charge-off y otra de late que sigue atrasada, When el CRM sugiere estrategia, Then sugiere `CHARGE_OFF` para la primera y "esperar" para la segunda.
- Given una partida con resultado "verificada", When se prepara la Ronda 2, Then se sugieren método de verificación y disputa directa al acreedor.
- Given una carta o disputa guardada antes con `ACCURACY_R1`, When se abre, Then se muestra con su etiqueta y cuenta en las estadísticas de efectividad.
- Given un archivo generado, When se nombra, Then sigue `disputa_<tipo>_r<ronda>_<NOMBRE_CLIENTE>_<BURÓ>_<Cuenta>.pdf`.
- `npm run lint` y `npm run typecheck` pasan sin errores.

## Points to clarify
- **pregunta abierta** — ¿Cómo reciben el texto nuevo las organizaciones que ya tienen las plantillas viejas copiadas? Opciones: reemplazar el texto de las que no se han editado, o crear versiones nuevas y desactivar las viejas.
- **pregunta abierta** — ¿Qué pasa con `ACCURACY_R1`? Propongo conservarlo solo para datos viejos y que la Ronda 1 nueva use `CHARGE_OFF` (y los demás tipos), con `GENERAL` como respaldo "no recomendado". ¿Se oculta `ACCURACY_R1` de las listas para elegir?
- **pregunta abierta** — Los errores numerados por cuenta de la carta de charge-off, ¿los escribe la persona que revisa o salen de otro dato? Hoy la carta solo lista lo disputado.
- **pregunta abierta** — ¿Quién puede activar una plantilla pendiente? Propongo solo OWNER y ADMIN.
- **suposición tomada** — "Pendiente de Hugo" se guarda dejando la plantilla inactiva y poniendo "(borrador, pendiente de Hugo)" en el nombre. *Base:* no hay migración. *Riesgo:* si alguien la activa sin el visto bueno de Hugo, se usa un texto no aprobado; la Fase 2 debe agregar un estado propio.
- **suposición tomada** — Las direcciones de los burós son constantes en el código por ahora (las tres de la skill). *Base:* la edición en Configuración necesita migración. *Riesgo:* si Hugo corrige una dirección hay que cambiar código.
- **suposición tomada** — Hasta la Fase 2 no hay compuerta de confirmación del cliente. *Base:* toda carta pasa por revisión humana antes de FINAL. *Riesgo:* una carta de consultas podría enviarse sin que el cliente confirmara; el texto "I do not recognize" y la advertencia en pantalla lo reducen, no lo eliminan.
- **decisión diferida** — Qué lleva la Ronda 3, qué hacer con una disputa "frívola" y cuándo dejar de disputar: siguen pendientes de Hugo.
- **decisión diferida** — Estado "pendiente de aprobación", `deliveredAt`, `FRIVOLOUS`, `BUREAU_RESPONSE`: Fase 2.
- **área no formulable** — Cómo se reflejan en la carta de colección los casos de colección interna del acreedor original frente a cobradores de terceros; Hugo no tiene plantilla guardada.
