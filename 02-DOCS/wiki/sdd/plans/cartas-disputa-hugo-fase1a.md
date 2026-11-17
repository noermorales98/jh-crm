---
type: plan
title: Plan — Cartas y estrategias de disputa según las reglas de Hugo (Fase 1A)
description: Plan técnico a nivel de estructura para alinear estrategias y plantillas de carta con las reglas de Hugo, sin migración.
tags: [sdd, plan, disputas, cartas]
timestamp: 2026-11-17T17:00:00Z
topic: sdd
slug: cartas-disputa-hugo-fase1a
status: draft
---

# Plan — Cartas y estrategias de disputa según las reglas de Hugo (Fase 1A)

> Spec: [../specs/cartas-disputa-hugo-fase1a.md](../specs/cartas-disputa-hugo-fase1a.md) · Constitution: [../constitution.md](../constitution.md) · Status: draft
> Last updated: 2026-11-17

## 0. Global Constraints

- **Sin migración:** `prisma/schema.prisma` y `prisma/migrations/` no se tocan. Cualquier cambio que lo necesite es Fase 2 y se detiene.
- **Calidad (constitución 4, 5, 7):** `npm run lint` y `npm run typecheck` sin errores; cada cambio de comportamiento trae una prueba en `scripts/smoke/` que falla sin el cambio; nada se da por hecho sin salida observada.
- **Idioma:** el texto de las cartas va en inglés; los mensajes y etiquetas de la interfaz, en español.
- **Texto legal de Hugo:** las plantillas de información personal, consultas y charge-off se copian de `.claude/skills/asistente-de-disputas/SKILL.md` sin reescribir. Las demás son borrador pendiente de Hugo.
- **Frases prohibidas en las plantillas:** `did not authorize`, `unauthorized`, `prevent further access by this user`, `violation of 15 U.S.C. §1681 and all of its subsections`, `guarantee`, `garantiz` y la raya larga `—`. Y el argumento de comparar con los otros burós (`other credit bureaus`, `consistency across`).
- **Direcciones de burós (constantes):** TransUnion Consumer Solutions, P.O. Box 2000, Chester PA 19016-2000 · Experian, P.O. Box 4500, Allen TX 75013 · Equifax Information Services LLC, P.O. Box 740256, Atlanta GA 30374-0256. En la carta van en tres líneas, sin comas.
- **Fecha:** `MM/DD/YYYY` con ceros (hoy sale `M/D/YYYY`).
- **Límites por carta:** charge-off 2 cuentas; colección 2 (suposición); consultas 5; información personal sin tope, una carta por buró. Una carta por buró por estrategia.
- **Nombre de archivo:** `disputa_<tipo>_r<ronda>_<NOMBRE_CLIENTE>_<BURÓ>_<Cuenta>.pdf` (variantes por tipo según la skill).
- **Pendiente = inactiva + sufijo** `(borrador, pendiente de Hugo)` en el nombre. Activarla exige el permiso nuevo `letters.approve` (dueño y admin).
- **Sin respaldo silencioso:** si el método tiene plantilla inactiva o no hay activa, la generación falla con un mensaje que nombra el método. No cae en la general.
- **Datos ficticios** en pruebas y seeds. Autoría humana en los commits, sin trailer de IA.
- **Encabezado con datos sensibles (decisión de Noe, 2026-11-17):** el encabezado lleva SSN y fecha de nacimiento completos. Solo se completan si quien genera tiene `sensitive.view`; sin ese permiso salen enmascarados. Cada generación con valores completos queda en el registro de actividad.

## 1. Context & constraints

- Criterios de aceptación que dan forma al diseño: spec §Acceptance (texto de Hugo, agrupación, sin respaldo silencioso, actualización de plantillas, permiso de activación, sugerencias, compatibilidad con `ACCURACY_R1`, nombre de archivo).
- Piezas existentes que se reutilizan: `ensureDefaultTemplates`, `templateForStrategy`, `generateLettersByStrategy` y `buildVarsForItems` (`src/server/letters/index.ts`); `renderTemplate` (`src/lib/letters/template.ts`); `DisputeLetterTemplate.version/active/strategy`; el permiso `letters.manage`.
- Constitución en juego: stack canon (TypeScript estricto, Next 16), pruebas tsx en `scripts/smoke/`, pruebas con BD en la MySQL desechable `jh_gates`.
- Fuera de alcance que el diseño no debe invadir: campos nuevos de la cuenta, `deliveredAt`, `FRIVOLOUS`, Exhibit A/B en PDF, compuerta de confirmación del cliente, direcciones editables, IA, contrato CROA.
- Decisión previa respetada: el conector con Claude no recibe cuerpos de carta ni el valor de la información personal (decisions.md, 2026-11-13).

## 2. Architecture

```text
[ strategies.ts (registro) ] ──> [ templates.ts (textos) ] ──> [ ensureDefaultTemplates ] ──> [ BD: DisputeLetterTemplate ]
        │                                   │                          │
        │                       [ legacy-templates.ts ]                │ pendiente / versión
        v                                   v                          v
[ suggest.ts (cuenta, R2) ]      [ letter-render.ts (encabezado + items) ] ──> [ generateLettersByStrategy ]
                                                                                     │ trocea, valida plantilla
                                                                                     v
                                                                  [ DisputeLetter (borrador) + registro de actividad ]
[ permissions.ts: letters.approve ] ──> [ approveTemplate ] ──> UI de plantillas
```

- **registro de estrategias** (interno, puro) — fuente única de cada estrategia: etiqueta, base legal, tipo de destino, límite por carta, si es elegible, si su texto está aprobado, tipo de archivo. Mantiene las viejas como históricas.
- **textos de plantillas** (interno, puro) — contenido en inglés de cada plantilla y su estado (`approved` | `pending`). Los textos viejos pasan a un archivo aparte para reconocer plantillas sin editar.
- **render de carta** (interno, puro) — direcciones de burós, encabezado LetterStream, fecha, y el armado de `{{items}}` por estrategia (bloques de charge-off con errores numerados, lista de consultas, secciones de información personal).
- **sugerencias** (interno, puro) — estrategia por cuenta (con "esperar") y sugerencia de Ronda 2 según el resultado.
- **servicio de plantillas** (interno, con BD) — asegura el juego por organización: crea, actualiza las no editadas, deja borradores inactivos, avisa de versiones nuevas, aprueba.
- **generación de cartas** (interno, con BD) — valida plantillas antes de crear nada, trocea por límite, rellena variables y escribe el borrador.
- **permiso `letters.approve`** (interno) — solo dueño y admin.

**Decisión arquitectónica principal:** la lógica de negocio va en módulos puros (registro, textos, render, sugerencias) y la BD solo en dos servicios delgados. Se elige porque la constitución exige una prueba que falle sin el cambio y las pruebas con BD solo corren contra la MySQL desechable: así casi todo se prueba sin BD y rápido. Alternativa descartada: meter los textos nuevos directo en `src/server/letters/index.ts`; mezcla texto legal con acceso a datos y vuelve cada prueba una prueba de BD.

**Decisión de modelo de versiones sin migración:** un borrador de una estrategia que ya tiene plantilla activa se guarda como fila inactiva aparte (misma estrategia, nombre con `v2` y sufijo de pendiente). Aprobarlo la activa y desactiva la anterior en una sola operación. Así no se rompe lo que ya funciona (por ejemplo la queja al CFPB activa) mientras Hugo no apruebe el texto nuevo.

## 3. Interfaces & contracts

```text
strategies.SELECTABLE_STRATEGIES -> DisputeStrategy[]          (sin ACCURACY_R1)
strategies.STRATEGY_INFO[s] -> { label, short, when, basis, target, order,
                                 legacy: boolean, approval: "approved"|"pending",
                                 maxPerLetter: number|null, fileKind: string }
  - invariant: toda estrategia vieja guardada en BD sigue siendo una DisputeStrategy válida.

suggest.suggestAccountStrategy({negativeType, previouslyVerified, stillDelinquent})
    -> DisputeStrategy | "WAIT"
  - CHARGE_OFF->CHARGE_OFF; COLLECTION->COLLECTION; LATE con stillDelinquent->"WAIT";
    LATE sin atraso vigente->LATE_PAYMENTS; resto->GENERAL (marcada no recomendada).
suggest.suggestRound2({outcome}) -> { strategies: DisputeStrategy[], note: string }
  - DELETED->[] (cerrar, vigilar reinserción); UPDATED->[METHOD_R2];
    VERIFIED->[METHOD_R2, FURNISHER_DIRECT]; NOT_RESPONDED->CFPB; el resto->[] con nota.
  - sin condiciones de tiempo (Fase 2).

render.bureauBlock(bureau) -> string[3]     // dirección completa, sin comas
render.formatLetterDate(date) -> "MM/DD/YYYY"
render.letterHeader(vars) -> string         // remitente izq.; DATE/DOB/SSN der.; destinatario abajo izq.
render.renderItems(strategy, items) -> string
  - CHARGE_OFF/COLLECTION: "Account in dispute #N" + errores numerados (líneas de disputeDetails)
  - INQUIRY: "<EMPRESA> – Date of inquiry: MM/DD/YYYY"
  - PERSONAL_INFO: secciones Name(s)/Address(es)/Employer(s)
render.chunkByLimit(items, max|null) -> items[][]   // orden estable
render.letterFileName({kind, round, client, bureau, account?}) -> string

letters.ensureDefaultTemplates(ctx) -> Template[] con { pending, updateAvailable }
  - nunca pisa texto editado; actualiza las no editadas (version+1); crea borradores inactivos
  - idempotente: llamarla dos veces no duplica filas
letters.templateForStrategy(ctx, strategy)
    -> Template | TemplatePendingError(method) | NoActiveTemplateError(method)
  - sin respaldo silencioso a GENERAL para métodos del registro
letters.approveTemplate(ctx, templateId) -> Template
  - exige letters.approve; quita el sufijo; activa; desactiva la activa anterior de esa estrategia
  - registra actividad
letters.updateTemplate(ctx, ...)
  - rechaza activar o quitar el sufijo de un borrador sin letters.approve
letters.generateLettersByStrategy(ctx, {roundId, cfpb?}) -> {letters, complaints}
  - valida todas las plantillas primero; si falta una, no crea ninguna carta y nombra el método
  - trocea por maxPerLetter; una carta por buró por estrategia (por trozo)
  - completa DOB/SSN solo con sensitive.view; si no, enmascarados; registra actividad
```

## 4. Data model & flow

**Entidades (sin cambios de esquema):**
- **DisputeLetterTemplate** — `strategy`, `name`, `content`, `version`, `active`. Pendiente = `active=false` y nombre con el sufijo. `updateAvailable` y `pending` se calculan al leer, no se guardan.
- **DisputeItem** — `strategy`, `disputeReason`, `disputeDetails` (texto libre, un error por línea), `targetLabel`.
- **Client** — `ssnEncrypted`, `ssnLast4`, `dateOfBirthEncrypted`.
- **DisputeLetter** — `contentSnapshot` (texto de la carta ya armada), `strategy`.

**Flujo principal (carta de charge-off):**
1. Se pulsa generar cartas de la ronda → `generateLettersByStrategy` lee las partidas pendientes y las agrupa por (buró, estrategia).
2. Para cada estrategia pide su plantilla; si alguna está pendiente o inactiva, falla con el nombre del método y no crea nada.
3. Trocea cada grupo por su límite (charge-off 2) y, para cada trozo, arma las variables: cliente, dirección del buró en tres líneas, fecha `MM/DD/YYYY`, DOB/SSN según permiso, y el bloque de cuentas con errores numerados.
4. Rellena la plantilla, guarda el borrador (`READY_FOR_REVIEW`) y registra la actividad.

**Flujo de plantillas:** al asegurar el juego, por cada estrategia asegurada: sin fila → crea (activa si está aprobada, inactiva con sufijo si es borrador); fila con texto igual al viejo conocido → actualiza y sube versión; fila editada → deja y marca `updateAvailable`; estrategia con activa previa y borrador nuevo → crea el borrador aparte una sola vez.

- **Fronteras de consistencia:** crear los borradores de una ronda es una transacción (todo o nada). Aprobar (activar una y desactivar otra) es una transacción.
- **Impacto de migración:** ninguno.

## 5. Testing strategy

| Criterio de la spec | Nivel | Qué comprueba | Qué simula |
| --- | --- | --- | --- |
| Charge-off coincide con Hugo | unit (puro) | carta renderizada igual a un archivo de referencia revisado contra la skill; párrafos fijos aparecen literales en la skill | datos ficticios |
| Consultas: una por buró, ≤5, "I do not recognize" | unit + integración | troceo y texto; con BD, cartas creadas por buró | BD real desechable |
| 3 charge-offs en un buró = 2 cartas | unit | `chunkByLimit` y el conteo de cartas | — |
| Info personal: una por buró con datos de ese buró | integración | cartas y contenido por buró | BD desechable |
| Sin argumento entre burós | unit | ninguna plantilla de R1 contiene las frases prohibidas | — |
| Encabezado de LetterStream | unit | tres líneas de dirección, sin comas, sin "Dispute Department", bloque DATE/DOB/SSN | — |
| Anexos | unit | la mención nombra ID, comprobante y tarjeta del Seguro Social | — |
| Plantilla pendiente no genera | integración | error con el nombre del método y cero cartas creadas | BD desechable |
| Sin respaldo silencioso | integración | plantilla inactiva + general activa → falla, no usa la general | BD desechable |
| STAFF no activa / admin sí | integración | `approveTemplate` y `updateTemplate` con distintos roles | contexto de rol ficticio |
| Plantilla sin editar se actualiza; editada se respeta | integración | versión nueva y `updateAvailable`; idempotencia | BD desechable |
| `ACCURACY_R1` oculta para elegir | unit | `SELECTABLE_STRATEGIES` no la incluye; el esquema de creación la rechaza | — |
| Registro viejo sigue válido | unit + integración | `isDisputeStrategy("ACCURACY_R1")` y efectividad cuenta la partida | BD desechable |
| Sugerencia por cuenta y por resultado | unit | tabla de entradas y salidas, incluido "WAIT" | — |
| Errores numerados | unit | tres líneas → `1.`, `2.`, `3.` | — |
| Nombre de archivo | unit | formato exacto por tipo | — |
| DOB/SSN completos solo con permiso | integración | con `sensitive.view` salen completos; sin él, enmascarados; hay entrada de actividad | cifrado de prueba |
| lint y typecheck | gate | cero errores | — |

- La línea e2e (navegador) queda fuera: la UI se comprueba con `lint`, `typecheck` y una revisión visual de la lista de plantillas en la verificación de cierre.
- Debe ser real, no simulado: la base de datos en las pruebas de plantillas y generación, porque ahí viven las reglas de "no pisar lo editado" y "todo o nada".
- Las pruebas puras entran a `ci:qa`; las de BD se registran como scripts y se ejecutan contra `jh_gates` con su salida en la verificación (constitución 6).

## 6. Sequencing & dependencies

1. Registro de estrategias + mover los textos viejos a `legacy-templates` + `SELECTABLE_STRATEGIES` — depends on: none — serial.
2. Direcciones de burós, fecha y encabezado LetterStream (puro) — depends on: #1 — parallelizable.
3. Render de items por estrategia, troceo y nombre de archivo (puro) — depends on: #1 — parallelizable.
4. Textos de plantillas: aprobadas (información personal, consultas, charge-off) y borradores, con archivos de referencia y pruebas de anclaje a la skill — depends on: #2, #3 — serial.
5. Sugerencias por cuenta y por resultado + actualizar los sitios que las usan — depends on: #1 — parallelizable.
6. Servicio de plantillas: asegurar, actualizar no editadas, borradores, `updateAvailable`, `approveTemplate`, permiso `letters.approve` — depends on: #4 — serial.
7. Generación: validar plantillas, troceo, DOB/SSN con permiso, actividad, sin respaldo silencioso — depends on: #3, #4, #6 — serial.
8. Interfaz: filtrar la lista de estrategias, etiquetas de pendiente, aviso de versión nueva, botón aprobar — depends on: #6 — serial.
9. Esquemas de creación y herramientas MCP con `SELECTABLE_STRATEGIES`; ajustar pruebas existentes — depends on: #1 — parallelizable.
10. Cableado de pruebas en `package.json` y `ci:qa`, verificación de cierre — depends on: #1–#9 — serial.

- Candidatas a paralelo (alcance disjunto): #2, #3, #5, #9 tras #1.
- Orden duro: #6 antes de #7 y #8 (el servicio define pendiente y aprobado); #4 antes de #6 (necesita los textos y el estado de cada uno).
- Riesgo de revisión (`rsc risk`): se espera nivel 2 por tocar `permissions.ts` y datos sensibles; eso exige panel de tres revisores y aprobación humana para integrar.

## 7. Risks & open decisions

**Risks** (de mayor a menor)

| Riesgo | Disparador | Impacto | Mitigación |
| --- | --- | --- | --- |
| SSN y fecha completos en texto plano en la carta guardada (decisión de Noe) | Se genera una carta con `sensitive.view` | Datos sensibles visibles para quien abra la carta, o salir hacia correo, portal o IA | Solo se completan con `sensitive.view`; entrada en el registro de actividad; revisar que el cuerpo de carta no llegue al conector con Claude ni a la IA; panel de seguridad (tier 2); la Fase 3 puede mover la resolución al render del PDF |
| Una plantilla editada por una organización se pisa por error | Comparación de texto mal hecha | Se pierde trabajo del cliente | Prueba que edita, vuelve a asegurar y verifica que el texto no cambia; comparación solo contra textos viejos conocidos |
| Respaldo silencioso a la general al activar borradores | Plantilla inactiva en un método | Carta equivocada enviada | Criterio y prueba específicos; el servicio lanza error en lugar de caer |
| Romper registros viejos con `ACCURACY_R1` | Quitar el valor del conjunto válido | Etiquetas y estadísticas rotas | Se conserva como estrategia histórica; prueba de lectura y de efectividad |
| STAFF activa un borrador | Permiso demasiado amplio | Texto no aprobado en uso | `letters.approve` solo dueño y admin; `updateTemplate` rechaza activar borradores |
| Texto de Hugo copiado con error | Transcripción manual | Carta legal distinta a la aprobada | Archivos de referencia revisados y prueba que exige que los párrafos fijos aparezcan literales en la skill |
| Cartas parciales si falla una plantilla a mitad de la ronda | Falla después de crear algunas | Ronda a medias | Validar todas las plantillas antes de crear; crear en una transacción |
| Colisión con otro trabajo en `strategies.ts` (lo importan unos 15 archivos) | Cambios en paralelo | Conflictos y regresiones de tipos | Cambio en rama propia; `typecheck` después de cada tarea |

**Decisiones abiertas**

- Si la Fase 3 resolverá DOB/SSN al armar el PDF en vez de guardarlos en el borrador: se decide al planificar la Fase 3.
- Si el límite de colección es 2 (suposición tomada de charge-off) o 5 (regla general de la skill): cierra cuando Hugo apruebe esa plantilla.
- Cómo se identifican apellidos de soltera o direcciones donde el cliente sí vivió en la carta de información personal: fuera de esta spec; se registra para Fase 2.
- Decisiones tomadas al planificar (van también a `../decisions.md`): módulos puros + dos servicios con BD; versiones sin migración como fila inactiva aparte; pendiente = inactiva + sufijo; encabezado con valores completos solo con `sensitive.view`.

## Tasks
<!-- generated by tasks on 2026-11-17; IDs are stable, do not renumber -->

Numeración de criterios de la spec (orden de `## Acceptance criteria`): AC1 charge-off = Hugo · AC2 consultas una por buró ≤5 · AC3 3 charge-offs = 2 cartas · AC4 info personal una por buró · AC5 sin argumento entre burós · AC6 "I do not recognize" · AC7 encabezado LetterStream · AC8 anexos · AC9 pendiente no genera · AC10 sin respaldo silencioso · AC11 permiso de activar · AC12 plantilla vieja sin editar se actualiza · AC13 activa de R2/lates/CFPB se conserva, borrador aparte, aprobar reemplaza · AC14 DOB/SSN según permiso · AC15 plantilla editada se respeta y se avisa · AC16 `ACCURACY_R1` oculta al elegir · AC17 errores numerados · AC18 sugerencia por cuenta ("esperar") · AC19 sugerencia de Ronda 2 · AC20 registro viejo `ACCURACY_R1` sigue válido · AC21 nombre de archivo · AC22 lint y typecheck.

Las pruebas con BD corren contra la MySQL desechable `jh_gates` (ver `config.yaml` → `testing.db_smokes`). Los nombres `smoke:<x>` se registran en T015.

| ID | [P] | Task | Done-check | Depends-on | Trace | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| T001 |  | Dividir `strategies.ts`: registro ampliado (estrategias nuevas, `legacy`, `approval`, `maxPerLetter`, `fileKind`, `SELECTABLE_STRATEGIES`), textos a `templates.ts` (con los viejos en `legacy-templates.ts`) y sugerencias a `suggest.ts`, con re-exportaciones | `npx tsx scripts/smoke/dispute-strategies.ts` verde, ahora afirma: `SELECTABLE_STRATEGIES` no incluye `ACCURACY_R1`; `strategyLabel("ACCURACY_R1")` sigue dando etiqueta; toda estrategia vieja pasa `isDisputeStrategy`; las afirmaciones de texto pasan a `dispute-templates-text.ts` sin cambiar; `npm run typecheck` verde | — | AC16, AC20 | 1 |
| T002 | [P] | Añadir direcciones de burós, `formatLetterDate`, encabezado LetterStream (DATE/DOB/SSN a la derecha, destinatario en 3 líneas sin comas) y la mención de anexos | `npx tsx scripts/smoke/dispute-letter-render.ts` falla antes y pasa después: 3 líneas por buró sin comas, sin "Dispute Department", fecha `MM/DD/YYYY` con ceros, mención "government-issued ID, proof of address and Social Security card" | T001 | AC7, AC8 | 1 |
| T003 | [P] | Añadir `renderItems` por estrategia (bloques de cuenta con errores numerados, lista de consultas, secciones de información personal), `chunkByLimit` y `letterFileName` | `npx tsx scripts/smoke/dispute-letter-items.ts` falla antes y pasa después: tres líneas de detalle salen `1.`,`2.`,`3.`; 3 cuentas con límite 2 dan trozos [2,1]; 6 consultas con límite 5 dan [5,1]; nombre exacto `disputa_chargeoff_r1_JANE-DOE_TRANSUNION_Chase1234.pdf` | T001 | AC3, AC17, AC21 | 1 |
| T004 |  | Escribir los textos aprobados de información personal, consultas y charge-off con sus archivos de referencia (`scripts/smoke/fixtures/hugo-letters/*.txt`) | `npx tsx scripts/smoke/dispute-templates-text.ts` falla antes y pasa después: cada carta renderizada con datos ficticios es idéntica a su archivo de referencia; los párrafos fijos aparecen literales en `.claude/skills/asistente-de-disputas/SKILL.md`; consultas empieza con "I do not recognize this inquiry"; ninguna frase prohibida (§0) | T002, T003 | AC1, AC4, AC5, AC6, AC7, AC8 | 1 |
| T005 |  | Escribir los borradores pendientes (colección, disputa directa al acreedor, validación de deuda, goodwill, seguimiento R2 v2, lates v2, CFPB v2) y degradar `GENERAL` a "no recomendada" | `npx tsx scripts/smoke/dispute-templates-text.ts` verde con casos nuevos: cada borrador marca `approval: "pending"`, trae `{{items}}`, ninguna frase prohibida y ninguna raya larga; R2 cita la carta anterior | T004 | AC5, AC9 | 1 |
| T006 | [P] | Reescribir `suggestAccountStrategy` (con `stillDelinquent`, resultado `"WAIT"`) y añadir `suggestRound2`; actualizar los sitios que las llaman | `npx tsx scripts/smoke/dispute-suggest.ts` falla antes y pasa después: CHARGE_OFF→`CHARGE_OFF`; late atrasada→`WAIT`; verificada→`[METHOD_R2, FURNISHER_DIRECT]`; borrada→cerrar; `npm run typecheck` verde | T001 | AC18, AC19 | 1 |
| T007 | [P] | Añadir el permiso `letters.approve` a `ADMIN_ONLY` en `permissions.ts` | `npx tsx scripts/smoke/letters-approve-permission.ts` falla antes y pasa después: OWNER y ADMIN lo tienen; SPECIALIST, STAFF y VIEWER no; `letters.manage` de STAFF intacto | T001 | AC11 | 2 |
| T008 |  | Hacer que `ensureDefaultTemplates` cree aprobadas activas, cree borradores inactivos con sufijo, actualice las no editadas (versión +1), respete las editadas, guarde el borrador de una estrategia con activa previa como fila aparte, y calcule `pending` y `updateAvailable`; sin crear `ACCURACY_R1` en organizaciones nuevas | `npx tsx scripts/smoke/letters-templates-db.ts` (contra `jh_gates`) falla antes y pasa después: texto viejo sin editar pasa a versión 2; texto editado intacto con `updateAvailable`; segunda llamada no duplica filas; R2/lates/CFPB activas siguen activas | T004, T005 | AC12, AC13, AC15 | 1 |
| T009 |  | Añadir `approveTemplate` (permiso `letters.approve`, quita el sufijo, activa, desactiva la anterior de esa estrategia, registra actividad), proteger `updateTemplate` contra activar o quitar el sufijo de un borrador, y exponer la acción `approveLetterTemplate` | `npx tsx scripts/smoke/letters-approve-db.ts` (contra `jh_gates`) falla antes y pasa después: STAFF es rechazado; admin aprueba; la activa anterior queda inactiva; `updateTemplate` con STAFF no puede activar un borrador | T007, T008 | AC11, AC13 | 2 |
| T010 |  | Hacer estricto `templateForStrategy` (sin respaldo a `GENERAL` para métodos del registro, errores con el nombre del método) y reescribir `generateLettersByStrategy`: validar todas las plantillas antes de crear, trocear por `maxPerLetter`, una carta por buró y estrategia, en una transacción | `npx tsx scripts/smoke/letters-generate-db.ts` (contra `jh_gates`) falla antes y pasa después: consultas en 2 burós = 2 cartas ≤5; 3 charge-offs de un buró = 2 cartas; info personal = 1 por buró con solo sus datos; plantilla pendiente = error con el método y 0 cartas; inactiva + general activa = error | T003, T008 | AC2, AC3, AC4, AC9, AC10 | 1 |
| T011 |  | Armar las variables de la carta con los módulos puros (fecha, bloque del buró, items) y completar DOB y SSN según `sensitive.view` (enmascarados sin permiso), con entrada en el registro de actividad | `npx tsx scripts/smoke/letters-header-sensitive-db.ts` (contra `jh_gates`) falla antes y pasa después: con `sensitive.view` el SSN y la fecha salen completos; sin él, `XXX-XX-1234`; hay una entrada de actividad por generación completa; la carta de charge-off integrada coincide con su archivo de referencia | T002, T003, T010 | AC1, AC7, AC14, AC17 | 1 (recalcular: toca datos sensibles, el plan espera 2) |
| T012 | [P] | Hacer que las listas para elegir estrategia usen `SELECTABLE_STRATEGIES` y etiquetar las pendientes | `npm run typecheck` verde; `grep -rn "DISPUTE_STRATEGIES" src/components` no devuelve listas de selección; revisión visual en el cierre | T001 | AC16 | 1 |
| T013 |  | Mostrar en la lista de plantillas la etiqueta "borrador, pendiente de Hugo", el aviso "versión nueva disponible" y el botón "Aprobar y activar" solo con `letters.approve` | `npm run typecheck` verde; en el cierre, captura de la pantalla con un borrador y un administrador | T009 | AC11, AC13, AC15 | 1 |
| T014 | [P] | Hacer que los esquemas de creación y las herramientas MCP acepten solo `SELECTABLE_STRATEGIES` al crear y sigan leyendo `ACCURACY_R1`; ajustar `mcp-write-disputes.ts` | `npx tsx scripts/smoke/mcp-write-disputes.ts` y `npx tsx scripts/smoke/dispute-scope-method.ts` verdes; una creación con `ACCURACY_R1` es rechazada y una lectura vieja se muestra | T001 | AC16, AC20 | 1 |
| T015 |  | Registrar los smokes nuevos en `package.json` y añadir los puros a `ci:qa` | `npm run smoke:dispute-letter-render && npm run smoke:dispute-letter-items && npm run smoke:dispute-templates-text && npm run smoke:dispute-suggest && npm run smoke:letters-approve-permission` verdes | T002, T003, T004, T005, T006, T007 | AC22 | 1 |
| T016 |  | Cierre: todas las pruebas verdes y `verify` contra main | `npm run lint && npm run typecheck && npm run ci:qa` exit 0; los 5 smokes con BD verdes contra `jh_gates` con su salida pegada; `npx @ericrisco/rsc risk --base main` recalculado | todas | AC1 a AC22 | — |

**T001 — Interfaces**
- Produces: `DISPUTE_STRATEGIES` (todas, incluidas históricas) · `SELECTABLE_STRATEGIES: DisputeStrategy[]` · `STRATEGY_INFO[s]: { label, short, when, basis, target, order, legacy: boolean, approval: "approved"|"pending", maxPerLetter: number|null, fileKind: string }` · `STRATEGY_TEMPLATES` y `CFPB_TEMPLATE` re-exportados desde `templates.ts` · `suggestAccountStrategy` y `suggestRound2` re-exportados desde `suggest.ts`. Los módulos que ya importan de `strategies.ts` no cambian su import.

**T002 — Interfaces**
- Produces: `bureauBlock(bureau: "TRANSUNION"|"EXPERIAN"|"EQUIFAX"): [string, string, string]` · `formatLetterDate(d: Date): string` (`MM/DD/YYYY`) · `letterHeader(v: { fullName, addressLine, cityLine, date, dob, ssn, bureau }): string` · `ENCLOSURES_LINE: string`.

**T003 — Interfaces**
- Produces: `renderItems(strategy: DisputeStrategy, items: LetterItem[]): string` con `LetterItem = { creditorName, accountNumberMasked: string|null, disputeReason: string, disputeDetails: string|null, targetLabel?: string, inquiryDate?: string }` · `chunkByLimit<T>(items: T[], max: number|null): T[][]` (orden estable) · `letterFileName(i: { kind: string, round: number, client: string, bureau: string, account?: string }): string`.

**T006 — Interfaces**
- Produces: `suggestAccountStrategy(i: { negativeType: CreditNegativeType|null, previouslyVerified: boolean, stillDelinquent: boolean }): DisputeStrategy | "WAIT"` · `suggestRound2(i: { outcome: DisputeOutcome|null }): { strategies: DisputeStrategy[], note: string }`.
- Consumes: la llamada en `src/server/credit-reports/negative-review.ts` y la que pinta la sugerencia en `client-negative-analysis-panel.tsx`; deben pasar `stillDelinquent` desde el monto vencido de la cuenta.

**T008 — Interfaces**
- Consumes: `STRATEGY_TEMPLATES[s] -> { name, subject, content, approval }` y los textos viejos de `legacy-templates.ts`; `DisputeLetterTemplate { strategy, name, content, version, active }`.
- Produces: `ensureDefaultTemplates(ctx) -> (Template & { pending: boolean, updateAvailable: boolean })[]`; pendiente = `active=false` y nombre que termina en `(borrador, pendiente de Hugo)`.

**T009 — Interfaces**
- Consumes: `hasPermission(role, "letters.approve")`.
- Produces: `approveTemplate(ctx, templateId) -> Template` (lanza `DomainError` si falta el permiso o la plantilla no está pendiente) · acción `approveLetterTemplate(templateId)`.

**T010 — Interfaces**
- Consumes: `chunkByLimit`, `STRATEGY_INFO[s].maxPerLetter`.
- Produces: `templateForStrategy(ctx, s) -> Template` o `DomainError("La plantilla de <método> está pendiente de aprobación de Hugo.")` / `DomainError("No hay plantilla activa para <método>.")` · `generateLettersByStrategy(ctx, { roundId, cfpb? }) -> { letters, complaints }`.

**T011 — Interfaces**
- Consumes: `hasPermission(ctx.role, "sensitive.view")`, descifrado de `Client.ssnEncrypted` y `dateOfBirthEncrypted`, `ssnLast4`, `writeActivityLog`.
- Produces: variables `client.dob`, `client.ssn`, `bureau.line1..3`, `date`, `items`; SSN enmascarado `XXX-XX-<last4>` sin permiso.

## Review Workload Forecast

| Dimension | Forecast | Why |
| --- | --- | --- |
| Estimated changed lines | 1 600 a 2 200 | textos de 12 plantillas y 6 archivos de referencia (unas 700), módulos puros (unas 400), servicios (unas 300), UI, pruebas |
| Files / areas | unos 28: `src/lib/disputes/*` (5 nuevos), `src/server/letters/index.ts`, `permissions.ts`, acciones, 4 componentes, validación y MCP, 8 smokes, fixtures, `package.json` | núcleo puro, servicios, permisos, UI |
| Risk | máx. nivel 2; 2 tareas (T007, T009) | tier 2 exige panel de tres revisores y aprobación humana; T011 se recalcula en el diff real |
| Suggested delivery | `autochain`, en 3 PR: (1) T001 a T006 y T015 parcial (núcleo puro, sin BD); (2) T007 a T011 (permiso, plantillas, generación, datos sensibles, nivel 2); (3) T012 a T014 y T016 (interfaz, MCP, cierre) | supera `line_budget` 400 y mezcla áreas; el PR 2 es el que lleva aprobación humana |
