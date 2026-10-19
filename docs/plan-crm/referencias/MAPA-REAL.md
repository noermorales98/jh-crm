# Mapa real del repositorio

[Volver al índice](../README.md) · [Evidencia T00](../evidencias/T00.md) · [Estado](../ESTADO.md)

Registro de T00 sobre el commit `eb489c58c10abd331d777ec30d8c65e746dd648a` (rama `main`). Las rutas de este archivo se comprobaron en ese HEAD. La propuesta `src/lib/credit/domain/` no existe. El equivalente actual es `src/lib/credit/` más `src/server/credit-reports/` y `src/server/credit-import/`.

## Stack observado

| Pieza | Valor en este HEAD |
|---|---|
| App | `jh-multiservices-crm` 0.1.0 |
| Gestor | npm 11.12.1, `package-lock.json` |
| Node local al registrar T00 | v24.14.1 |
| Node del job CI | 22, en [`.github/workflows/qa.yml`](../../../.github/workflows/qa.yml) |
| Framework | Next 16.3.4, React 19.2.8 |
| Datos | Prisma 6.19.3, `provider = "mysql"` en [`prisma/schema.prisma`](../../../prisma/schema.prisma) |
| Auth | `next-auth` 5.0.0-beta.32. Contexto de organización: `requireOrganization` / `requirePermission` en [`src/server/auth/guards.ts`](../../../src/server/auth/guards.ts). Permisos: `can` en [`src/server/auth/permissions.ts`](../../../src/server/auth/permissions.ts) |
| Runner de checks | `tsx` para `scripts/smoke/*`, ESLint (`npm run lint`), `tsc` vía `npm run typecheck` |
| CI | El workflow `QA` ya existe. No hay que crearlo. Corre lint, typecheck, smokes sin migrate y `build:qa` |

## Expediente

`Client` (línea 622) envuelve casos de servicio. `CreditCase` (línea 705) es 1:1 con `ServiceCase` de reparación (`serviceCaseId` único) y agrupa rondas, reportes, ítems y comparaciones.

No hay modelo de cuenta canónica. Cada fila de `CreditItem` es una observación de un buró dentro de un `CreditReport`.

## Importación de PDF

| Capa | Símbolo |
|---|---|
| UI | [`app/crm/casos/[caseId]/credito/importaciones/[jobId]/page.tsx`](../../../app/crm/casos/[caseId]/credito/importaciones/[jobId]/page.tsx), [`src/components/credit-reports/credit-pdf-import-progress.tsx`](../../../src/components/credit-reports/credit-pdf-import-progress.tsx) |
| Action | [`src/actions/credit-import.ts`](../../../src/actions/credit-import.ts): `startCreditPdfImportAction`, `analyzeCreditPdfAction`, `confirmCreditPdfImportAction`, `listPendingConfirmCreditPdfJobsAction` |
| Servicio | [`src/server/credit-import/index.ts`](../../../src/server/credit-import/index.ts) `analyzeCreditPdf`, `confirmCreditPdfImport`; [`jobs.ts`](../../../src/server/credit-import/jobs.ts) `startCreditPdfImportJob`; [`extract.ts`](../../../src/server/credit-import/extract.ts) `coerceExtractionRaw` |
| Prisma | `CreditPdfImportJob.proposalJson` hasta confirmación humana. Al confirmar, persiste `CreditReport`, `CreditBureauSnapshot` y `CreditItem` |

Tope vigente: `coerce` y el merge cortan ítems a 200 (`extract.ts`, aviso «Se truncaron ítems fusionados a 200»). Zod repite el tope en [`src/lib/validation/credit-import.ts`](../../../src/lib/validation/credit-import.ts) y [`src/lib/validation/credit-reports.ts`](../../../src/lib/validation/credit-reports.ts) (`items.max(200)`).

La UI de revisión marca seleccionado cada ítem con `isNegative` o, si no, los primeros 40 (`credit-pdf-import-progress.tsx`). Un documento `UNKNOWN` pasa a `CREDIT_BUREAU_REPORT` si hay snapshots o algún ítem `isNegative`.

## Reporte y plan de acción

| Capa | Símbolo |
|---|---|
| UI reporte | [`app/crm/casos/[caseId]/credito/reportes/[reportId]/page.tsx`](../../../app/crm/casos/[caseId]/credito/reportes/[reportId]/page.tsx) |
| UI plan | [`app/crm/clientes/[clientId]/plan-de-accion/page.tsx`](../../../app/crm/clientes/[clientId]/plan-de-accion/page.tsx) → `getClientActionPlan` → [`ClientActionPlanView`](../../../src/components/clients/client-action-plan-view.tsx) |
| Hub Score Plan / fondeo | [`src/components/clients/agency-client-detail.tsx`](../../../src/components/clients/agency-client-detail.tsx) consume `loadClientActionPlanHub` |
| Action | [`src/actions/credit-reports.ts`](../../../src/actions/credit-reports.ts): `loadClientActionPlanHub`, `loadClientNegativeAnalysis`, `suggestQuoteLinesFromReport` |
| Servicio | [`src/server/credit-reports/index.ts`](../../../src/server/credit-reports/index.ts); [`action-plan.ts`](../../../src/server/credit-reports/action-plan.ts) `getClientActionPlan` |
| PDF | [`app/api/clients/[clientId]/action-plan/pdf/route.ts`](../../../app/api/clients/[clientId]/action-plan/pdf/route.ts) → `buildClientActionPlanPdf` |
| Prisma | `CreditReport`, `CreditBureauSnapshot` (`score Int?`, `inquiries Int?`, `utilization Decimal?`), `CreditItem` |

Umbrales fijos del plan, en `action-plan.ts`: score mínimo 720, utilización máxima 10, consultas máximas 3, edad mínima 2.5 años, límite combinado 40_000. `qualified` sigue calculándose (`bureausApproved >= 1`) y no se muestra como elegibilidad. Si `dateOpened` falta, `ageOk` queda `null` y esa fila igual puede entrar en `allOk` (`ageOk === true || ageOk === null`). El veredicto visible es `FUNDING_ESTIMATE_MESSAGE`.

`avgScore` es la media aritmética de los `score` presentes. No hay campo de familia ni versión de modelo.

Las tarjetas del plan se deduplican con la clave `acreedor|buró|límite|saldo`. `totalLimit` y `totalUsed` suman `null` como 0. No hay identidad entre burós.

## Score Plan, fondeo heurístico y AU

| Pieza | Ruta | Qué hace hoy |
|---|---|---|
| Score Plan | [`src/lib/credit/score-plan.ts`](../../../src/lib/credit/score-plan.ts) `buildScorePlan` | Pago para llevar cada cuenta a un porcentaje meta. Sin presupuesto extra ni asignación |
| Bandas | [`src/lib/credit/funding-estimate.ts`](../../../src/lib/credit/funding-estimate.ts) `computeFundingEstimate` | Siempre `UNAVAILABLE`, `amount: null`, razón `PROGRAM_AND_VERIFIED_INPUTS_REQUIRED`. Sin fórmula |
| Panel | [`src/lib/credit/funding-prep.ts`](../../../src/lib/credit/funding-prep.ts) `buildFundingPrepPanel` | Muestra score y utilización observados y el motivo. Sin rango ni punto medio |
| Puntos FICO | [`src/lib/credit/action-plan-howto.ts`](../../../src/lib/credit/action-plan-howto.ts) `ficoImpact` | Texto fijo: sin estimación de puntos |
| AU | `isAuthorizedUser` dentro de `getClientActionPlan` | Regex sobre tipo, estado, remarks y nombre (`authorized user`, `usuario autorizado`, `au`) |
| Copia AU | `ClientActionPlanView` | Conteo de coincidencias. Sin máximo ni monto recomendado |
| Otra lectura | [`src/lib/credit/qualification.ts`](../../../src/lib/credit/qualification.ts) `qualifyCreditProfile` | `sin_datos` / `revision` / `heuristica`. No es ruleset de programa ni el `qualified` del plan |
| Cotización sugerida | `suggestQuoteLinesFromReport` | Precios fijos (asesoría 120, charge-off y tardíos 250, datos personales 100, consultas 20) |
| Fondeo de expediente | [`src/actions/funding.ts`](../../../src/actions/funding.ts), [`src/server/funding/index.ts`](../../../src/server/funding/index.ts), modelos `FundingCase` / `FundingApplication` | Solicitud operativa. No calcula DTI ni DSCR |

`disputeEligible` en `CreditItem` nace en `true`. Los listados de reporte e ítems de disputa ordenan `isNegative` descendente.

## Rondas, cartas y comparación

| Módulo | UI | Action | Servicio | Prisma |
|---|---|---|---|---|
| Rondas | `app/crm/casos/[caseId]/rondas/`, `app/crm/rondas/page.tsx` | [`src/actions/rounds.ts`](../../../src/actions/rounds.ts) `createRound`, `markRoundSent`, `markRoundReviewed` | [`src/server/rounds/index.ts`](../../../src/server/rounds/index.ts) | `CreditRound`, `DisputeItem` |
| Disputas | componentes en `src/components/disputes/` | [`src/actions/disputes.ts`](../../../src/actions/disputes.ts) | [`src/server/disputes/index.ts`](../../../src/server/disputes/index.ts) | `DisputeItem.outcome` |
| Cartas | `app/crm/casos/[caseId]/rondas/[roundId]/cartas/[letterId]/` | [`src/actions/letters.ts`](../../../src/actions/letters.ts) | [`src/server/letters/index.ts`](../../../src/server/letters/index.ts) | `DisputeLetter`, `DisputeLetterItem` |
| Comparación | [`app/crm/casos/[caseId]/comparaciones/[comparisonId]/page.tsx`](../../../app/crm/casos/[caseId]/comparaciones/[comparisonId]/page.tsx) | [`src/actions/comparisons.ts`](../../../src/actions/comparisons.ts) `createComparison`, `overrideComparisonItem` | [`src/server/comparisons/index.ts`](../../../src/server/comparisons/index.ts) `classifyPair`, `buildMatchKey` | `ReportComparison`, `ReportComparisonItem` |

`classifyPair` devuelve `DELETED` si el ítem está en el reporte base y no en el comparado. La clave es buró + máscara + acreedor, o buró + acreedor si no hay máscara. `autoResult` es determinista; `manualResult` permite corrección. La etiqueta de UI es «Eliminado» (`COMPARISON_RESULT_LABELS`). El delta de score se pinta en verde si es positivo. Ese código no escribe que la ronda causó el cambio. Tampoco separa, en la etiqueta, «ausente en el segundo reporte» de «resultado de la disputa».

## Portal

[`app/portal/(app)/`](../../../app/portal/(app)/) usa `requirePortalSession`. La página de reportes lista informes de progreso del asesor (`portal.listPortalProgressReports`), no el plan de acción ni un monto de fondeo. ACL de PDF de plan: el smoke `smoke:portal-pdf-acl` espera denegar `/api/clients/c1/action-plan/pdf`. Ese smoke carga entorno y no se ejecutó en T00 ni en T01.

## Contratos de calidad

[`src/lib/credit/contracts.ts`](../../../src/lib/credit/contracts.ts) define calidad, revisión, familia, responsabilidad, dinero en centavos, basis points, fecha parcial, comparación de scores y `assertSameCreditScope`. El schema ya tiene columnas y tablas opcionales en `prisma/migrations/20261019233000_credit_additive_identity`. Esa migración no se aplicó: el host configurado no es loopback. No hay backfill y el adaptador de escritura todavía no guarda familia, responsabilidad ni calidad.

`adaptLegacyCreditItem` se llama desde `itemCreateData` y `updateCreditItem` en [`src/server/credit-reports/index.ts`](../../../src/server/credit-reports/index.ts). Solo rechaza un importe `INVALID`. Null y cero se guardan como antes. Familia y responsabilidad no se persisten. `provenance.ts` sigue aparte, para «N/A» de la extracción. El Zod legacy de [`src/lib/validation/credit-reports.ts`](../../../src/lib/validation/credit-reports.ts) conserva el rango 300–900; el contrato nuevo no lo convierte en regla universal.

Comprobación: `npm run smoke:credit-contracts`, también en el job QA junto a los smokes de fondeo.

## Símbolos buscados

| Patrón | Resultado en este HEAD |
|---|---|
| `canonicalTradeline`, `ownershipType` | Columnas y `CanonicalTradeline` en el schema, FK nullable, sin filas ni backfill. La escritura actual no las llena |
| `funding-estimate` | [`src/lib/credit/funding-estimate.ts`](../../../src/lib/credit/funding-estimate.ts) y `npm run smoke:funding-estimate` |
| `action-plan` | [`src/server/credit-reports/action-plan.ts`](../../../src/server/credit-reports/action-plan.ts) |
| `isNegative` | Columna de `CreditItem`, orden de listas, selección de importación y filtros de disputa |
| `qualified` | Booleano del plan de acción, distinto de `qualifyCreditProfile` |
| Modelos de consulta individual, DTI, DSCR o ruleset versionado | No están en `schema.prisma` |

## Clasificación de hallazgos

La matriz está en [MATRIZ-HALLAZGOS.md](MATRIZ-HALLAZGOS.md). Aquí sólo se dice si el código de este commit todavía lo muestra.

| Hallazgo | Clasificación | Dónde |
|---|---|---|
| Cuentas contadas por buró; mezcla installment/revolving | Vigente | `CanonicalTradeline` existe y está vacía. El plan sigue sumando por observación y trata límite null como 0 |
| Score sin familia/versión; promedio como preparación | Vigente | `CreditBureauSnapshot.score` sigue siendo un entero. `CreditScoreObservation.modelFamily` nace null. `avgScore` es la media |
| Bandas de fondeo y puntos FICO sin modelo | Retirado en superficies activas (T01) | `computeFundingEstimate` no devuelve monto. `ficoImpact` no publica puntos. El PDF nuevo se genera al vuelo |
| AU por regex y montos fijos | Parcialmente vigente | Sigue el regex. La copia ya no recomienda cantidad ni $15,000. Los precios de cotización de servicio no se tocaron |
| Edad null permite qualified | Vigente | `ageOk === null` entra en `allOk` |
| Parser con tope 200 y prioridad de negativos | Parcialmente vigente | El corte a 200 está. La extracción no descarta positivos, pero la confirmación preselecciona negativos o los primeros 40, y un `UNKNOWN` con un negativo se clasifica como reporte |
| Negativo tratado como disputable | Vigente | `disputeEligible` por defecto `true`; listas ordenadas por `isNegative` |
| Score Plan sólo paydown | Vigente | `buildScorePlan` no reparte un presupuesto |
| Consultas como contador; antigüedad con reloj de ejecución | Vigente | `inquiries Int?` se conserva. `CreditInquiry` nace vacía y no se fabrica desde el contador. La edad usa `Date.now()` y `dateOpened`, no `reportDate` |
| Cambio posterior a ronda como logro causal | Parcialmente vigente | El diff no afirma la causa. La etiqueta «Eliminado» y el delta verde tampoco la niegan ni la separan de la disputa |
| Programas y capacidad financiera sin datos completos | Vigente | No hay DTI/DSCR ni ruleset versionado. El monto de fondeo queda indisponible hasta T20. `qualifyCreditProfile` no los sustituye |
| Tests que fijan la heurística actual | Parcialmente vigente | `smoke:funding-estimate` y `smoke:funding-prep` exigen `UNAVAILABLE`. `smoke:score-plan` sigue fijando el paydown. `smoke:credit-contracts` cubre null, cero y centavos |
| Corpus F01–F30, aislamiento entre organizaciones, datos de producción | No verificable en T00 | Quedan para T24 y T26. No se consultó producción |

La contención de bandas y puntos quedó en T01. Los contratos de calidad quedaron en T02. T03 dejó el SQL aditivo y el cliente generado; el `migrate deploy` no se ejecutó porque la base configurada no es local. T03 no está HECHO. T04 no se abrió.
