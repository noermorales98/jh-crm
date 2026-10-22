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
| Action | [`src/actions/credit-import.ts`](../../../src/actions/credit-import.ts): `startCreditPdfImportAction`, `analyzeCreditPdfAction`, `confirmCreditPdfImportAction`, `saveCreditPdfImportDraftAction`, `listPendingConfirmCreditPdfJobsAction` |
| Servicio | [`src/server/credit-import/index.ts`](../../../src/server/credit-import/index.ts) `analyzeCreditPdf`, `confirmCreditPdfImport`; [`jobs.ts`](../../../src/server/credit-import/jobs.ts) `startCreditPdfImportJob`; [`extract.ts`](../../../src/server/credit-import/extract.ts) `coerceExtractionRaw` |
| Prisma | `CreditPdfImportJob.proposalJson` hasta confirmación humana. Al confirmar, persiste `CreditReport`, `CreditBureauSnapshot` y `CreditItem` |

La propuesta y la confirmación aceptan hasta 400 ítems (`EXTRACTION_ITEM_CEILING` en [`src/lib/validation/credit-import.ts`](../../../src/lib/validation/credit-import.ts)). Pasarse de ese techo deja cobertura `PARTIAL` y el conteo de lo que no cupo. El alta manual sigue en `items.max(200)` en [`src/lib/validation/credit-reports.ts`](../../../src/lib/validation/credit-reports.ts).

La revisión selecciona todas las cuentas extraídas y muestra página y calidad. [`src/lib/credit/review.ts`](../../../src/lib/credit/review.ts) guarda un borrador sin publicar. Confirmar reclama el job antes de crear el reporte. La misma clave devuelve el reporte ya guardado. Una revisión distinta no inserta otro. Si `coverage.metricsBlocked` es true, o falta un campo crítico, confirmar no escribe. Un score sin modelo no entra en scores certificados. Una propuesta sin `review` sigue en revisión 0. Un documento `UNKNOWN` pasa a `CREDIT_BUREAU_REPORT` si hay score o cualquier cuenta.

## Reporte y plan de acción

| Capa | Símbolo |
|---|---|
| UI reporte | [`app/crm/casos/[caseId]/credito/reportes/[reportId]/page.tsx`](../../../app/crm/casos/[caseId]/credito/reportes/[reportId]/page.tsx) |
| UI plan | [`app/crm/clientes/[clientId]/plan-de-accion/page.tsx`](../../../app/crm/clientes/[clientId]/plan-de-accion/page.tsx) → `getClientActionPlan` → [`ClientActionPlanView`](../../../src/components/clients/client-action-plan-view.tsx) |
| Hub de utilización / fondeo | [`src/components/clients/agency-client-detail.tsx`](../../../src/components/clients/agency-client-detail.tsx) consume `loadClientActionPlanHub` |
| Action | [`src/actions/credit-reports.ts`](../../../src/actions/credit-reports.ts): `loadClientActionPlanHub`, `loadClientNegativeAnalysis`, `suggestQuoteLinesFromReport` |
| Servicio | [`src/server/credit-reports/index.ts`](../../../src/server/credit-reports/index.ts); [`action-plan.ts`](../../../src/server/credit-reports/action-plan.ts) `getClientActionPlan`; [`src/lib/credit/actions.ts`](../../../src/lib/credit/actions.ts) `buildCreditActions` |
| PDF | [`app/api/clients/[clientId]/action-plan/pdf/route.ts`](../../../app/api/clients/[clientId]/action-plan/pdf/route.ts) → `buildClientActionPlanPdf` |
| Prisma | `CreditReport`, `CreditBureauSnapshot` (`score Int?`, `inquiries Int?`, `utilization Decimal?`), `CreditItem` |

Umbrales fijos del plan, en `action-plan.ts`: score mínimo 720, utilización máxima 10, edad mínima 30 meses y límite combinado 40_000. `qualified` sigue calculándose (`bureausApproved >= 1`) y no se muestra como elegibilidad. Si falta una apertura, `ageOk` queda null y esa fila no entra en `allOk`. El contador de consultas no decide la fila. El veredicto visible es `FUNDING_ESTIMATE_MESSAGE`. La sección 6 y el PDF salen de `buildCreditActions`. Sin cobertura guardada, la primera acción pide verificar datos. El catálogo de `action-plan-howto.ts` sigue en el archivo y ya no abre la ficha.

`avgScore` es la media aritmética de los `score` presentes. No hay campo de familia ni versión de modelo.

Las tarjetas certificadas salen de `buildRevolvingReading`. El total individual solo pasa cuando está `KNOWN`. Una identidad sin confirmar no se suma entre burós. La ficha y el PDF leen esa cifra en [`src/lib/credit/metrics-view.ts`](../../../src/lib/credit/metrics-view.ts). 3841 basis points se muestran como 38.4%. Un valor ausente no se ve como 0%. La moneda ausente no se rellena como USD.

## Score Plan, fondeo heurístico y AU

| Pieza | Ruta | Qué hace hoy |
|---|---|---|
| Optimización de utilización | [`src/lib/credit/score-plan.ts`](../../../src/lib/credit/score-plan.ts) `paydownCents`, `buildUtilizationScenario` | Pago por tarjeta y pago del conjunto, con piso de centavos. El conjunto queda null si el agregado no está conocido. Sin predicción de puntos |
| Presupuesto extra | [`src/lib/credit/budget.ts`](../../../src/lib/credit/budget.ts) `allocateUtilizationBudget` | Extra declarado, cubetas v1 y desempate por id. No envía pagos ni predice puntos |
| Anomalías | [`src/lib/credit/anomalies.ts`](../../../src/lib/credit/anomalies.ts) `buildAnomalyReading` | Diferencia de saldo, historial u ownership en identidad confirmada. No prueba inexactitud ni abre ronda |
| Afirmaciones | [`src/lib/credit/assertions.ts`](../../../src/lib/credit/assertions.ts) `assessAssertion` | Sí, no o no sé, sin opción marcada. No persiste ni crea `DisputeItem` |
| Bandas | [`src/lib/credit/funding-estimate.ts`](../../../src/lib/credit/funding-estimate.ts) `computeFundingEstimate` | Siempre `UNAVAILABLE`, `amount: null`, razón `PROGRAM_AND_VERIFIED_INPUTS_REQUIRED`. Sin fórmula |
| Panel | [`src/lib/credit/funding-prep.ts`](../../../src/lib/credit/funding-prep.ts) `buildFundingPrepPanel` | Muestra score y utilización observados y el motivo. Sin rango ni punto medio. Sin programa versionado, el resultado no es una aprobación |
| Programa | [`src/lib/credit/programs.ts`](../../../src/lib/credit/programs.ts) `evaluateProgram` | Reglas versionadas de un producto. `PASS` no es una aprobación y el monto sigue null |
| Capacidad | [`src/lib/credit/capacity.ts`](../../../src/lib/credit/capacity.ts) `assessCapacity` | DTI y DSCR solo con datos confirmados. No infiere el ingreso ni calcula un préstamo |
| Cifras de la ficha | [`src/lib/credit/metrics-view.ts`](../../../src/lib/credit/metrics-view.ts) `presentUtilization` | Muestra el basis point ya calculado. Vacío, parcial y conflicto no publican un número |
| Puntos FICO | [`src/lib/credit/action-plan-howto.ts`](../../../src/lib/credit/action-plan-howto.ts) `ficoImpact` | Texto fijo: sin estimación de puntos |
| AU | [`src/lib/credit/ownership.ts`](../../../src/lib/credit/ownership.ts) `buildOwnershipSummary` | Una AU confirmada cuenta una vez. El nombre del acreedor no clasifica. La inferencia queda sin resolver |
| Copia AU | `ClientActionPlanView` | Cuentas confirmadas, sin resolver y en conflicto. El límite AU no se presenta como capacidad personal |
| Otra lectura | [`src/lib/credit/qualification.ts`](../../../src/lib/credit/qualification.ts) `qualifyCreditProfile` | `sin_datos` / `revision` / `heuristica`. No es ruleset de programa ni el `qualified` del plan |
| Cotización sugerida | `suggestQuoteLinesFromReport` | Precios fijos (asesoría 120, charge-off y tardíos 250, datos personales 100, consultas 20) |
| Fondeo de expediente | [`src/actions/funding.ts`](../../../src/actions/funding.ts), [`src/server/funding/index.ts`](../../../src/server/funding/index.ts), modelos `FundingCase` / `FundingApplication` | Solicitud operativa. No calcula DTI ni DSCR |

`disputeEligible` en `CreditItem` nace en `true`. Los listados de reporte e ítems de disputa ordenan `isNegative` descendente. El análisis ya no llama error a esa marca.

## Rondas, cartas y comparación

| Módulo | UI | Action | Servicio | Prisma |
|---|---|---|---|---|
| Rondas | `app/crm/casos/[caseId]/rondas/`, `app/crm/rondas/page.tsx` | [`src/actions/rounds.ts`](../../../src/actions/rounds.ts) `createRound`, `markRoundSent`, `markRoundReviewed` | [`src/server/rounds/index.ts`](../../../src/server/rounds/index.ts), [`src/lib/credit/rounds.ts`](../../../src/lib/credit/rounds.ts) `roundTiming`, [`src/lib/credit/operations.ts`](../../../src/lib/credit/operations.ts) `decideOperation` | `CreditRound`, `DisputeItem`. Sin política el plazo queda pendiente y la decisión de envío queda en revisión |
| Disputas | componentes en `src/components/disputes/` | [`src/actions/disputes.ts`](../../../src/actions/disputes.ts) | [`src/server/disputes/index.ts`](../../../src/server/disputes/index.ts) | `DisputeItem.outcome`. El análisis pregunta sí, no o no sé y no crea la disputa |
| Cartas | `app/crm/casos/[caseId]/rondas/[roundId]/cartas/[letterId]/` | [`src/actions/letters.ts`](../../../src/actions/letters.ts) | [`src/server/letters/index.ts`](../../../src/server/letters/index.ts) | `DisputeLetter`, `DisputeLetterItem` |
| Comparación | [`app/crm/casos/[caseId]/comparaciones/[comparisonId]/page.tsx`](../../../app/crm/casos/[caseId]/comparaciones/[comparisonId]/page.tsx) | [`src/actions/comparisons.ts`](../../../src/actions/comparisons.ts) `createComparison`, `overrideComparisonItem` | [`src/server/comparisons/index.ts`](../../../src/server/comparisons/index.ts) `classifyPair`, [`src/lib/credit/changes.ts`](../../../src/lib/credit/changes.ts) `compareReports` | `ReportComparison`, `ReportComparisonItem`. La etiqueta de ausencia es «No presente» |

`classifyPair` sigue devolviendo `DELETED` para la comparación guardada. La clave es buró + máscara + acreedor, o buró + acreedor si no hay máscara. `compareReports` lee la ausencia como `NOT_PRESENT` solo con cobertura completa e identidad confirmada, y deja el outcome formal aparte. La etiqueta de la comparación es «No presente». El delta de score se muestra sin color de logro. El PDF de avance conserva «Eliminado» porque cuenta el resultado registrado, y dice que no se infiere del reporte ni se atribuye a J&H.

## Portal

[`app/portal/(app)/`](../../../app/portal/(app)/) usa `requirePortalSession`. La página de progreso lee [`buildPortalView`](../../../src/lib/credit/portal-view.ts): otro cliente u otra organización no recibe el título del documento, un borrador no publica la utilización y lo confirmado se muestra con la lectura de T22. El delta no va en verde. «Eliminados» queda como resultado registrado. El escenario dice que no es un monto aprobado. La entrevista no se guarda ni crea una disputa. La página de reportes lista informes de progreso del asesor (`portal.listPortalProgressReports`), no el plan de acción. ACL de PDF de plan: el smoke `smoke:portal-pdf-acl` espera denegar `/api/clients/c1/action-plan/pdf`. Ese smoke carga entorno y no se ejecutó en T00 ni en T01.

## Contratos de calidad

[`src/lib/credit/contracts.ts`](../../../src/lib/credit/contracts.ts) define calidad, revisión, familia, responsabilidad, dinero en centavos, basis points, fecha parcial, comparación de scores y `assertSameCreditScope`. [`src/lib/credit/normalize.ts`](../../../src/lib/credit/normalize.ts) propone familia, responsabilidad, alias, locale y fecha parcial sin escribir Prisma. El catálogo de alias nace vacío. El schema ya tiene columnas y tablas opcionales en `prisma/migrations/20261019233000_credit_additive_identity`. Esa migración se aplicó en un MySQL desechable de `127.0.0.1` y esa base se borró. La base configurada de la app no se migró. El adaptador de escritura todavía no guarda familia, responsabilidad ni calidad.

`adaptLegacyCreditItem` se llama desde `itemCreateData` y `updateCreditItem` en [`src/server/credit-reports/index.ts`](../../../src/server/credit-reports/index.ts). Solo rechaza un importe `INVALID`. Null y cero se guardan como antes. Familia y responsabilidad no se persisten. `provenance.ts` sigue aparte, para «N/A» de la extracción. El Zod legacy de [`src/lib/validation/credit-reports.ts`](../../../src/lib/validation/credit-reports.ts) conserva el rango 300–900; el contrato nuevo no lo convierte en regla universal.

Comprobación: `npm run smoke:credit-contracts`, `npm run smoke:credit-normalize`, `npm run smoke:credit-access`, `npm run smoke:credit-identity` y `npm run smoke:credit-backfill`, también en el job QA junto a los smokes de fondeo.

[`src/lib/credit/identity.ts`](../../../src/lib/credit/identity.ts) propone cuentas entre burós y solo las confirma con revisión explícita. No escribe `CanonicalTradeline` ni `AuditLog`. [`src/lib/credit/backfill.ts`](../../../src/lib/credit/backfill.ts) recorre por `id`, enlaza solo una decisión `CONFIRMED` y arma un snapshot con la política `t06-selection-2026-10-20`. `isCreditIdentityReadEnabled` nace en false. El plan de acción no importa ese módulo.

## Aislamiento

[`src/lib/credit/access.ts`](../../../src/lib/credit/access.ts) compara la organización de la sesión con el recurso y reutiliza `assertSameCreditScope`. Ver exige `creditReports.view`. Escribir exige `creditReports.manage`. No existe `credit:review`. `getCreditPdfImportJob` devuelve `ssnLast4` solo si el rol tiene `sensitive.view`. `findOpenJobForDocument` filtra por `organizationId`. La descarga de documentos sigue en `requestDownload`, acotada a la organización. `smoke:portal-pdf-acl` no se ejecutó: carga `.env`.

## Símbolos buscados

| Patrón | Resultado en este HEAD |
|---|---|
| `canonicalTradeline`, `ownershipType` | Columnas y `CanonicalTradeline` en el schema, FK nullable. El backfill enlaza en memoria y, en el ensayo local, tres filas sintéticas. Esa base se borró. La escritura habitual no llena la columna |
| `funding-estimate` | [`src/lib/credit/funding-estimate.ts`](../../../src/lib/credit/funding-estimate.ts) y `npm run smoke:funding-estimate` |
| `action-plan` | [`src/server/credit-reports/action-plan.ts`](../../../src/server/credit-reports/action-plan.ts) |
| `isNegative` | Columna de `CreditItem`, orden de listas, selección de importación y filtros de disputa |
| `qualified` | Booleano del plan de acción, distinto de `qualifyCreditProfile` |
| Modelos de consulta individual, DTI, DSCR o ruleset versionado | No están en `schema.prisma` |

## Clasificación de hallazgos

La matriz está en [MATRIZ-HALLAZGOS.md](MATRIZ-HALLAZGOS.md). Aquí sólo se dice si el código de este commit todavía lo muestra.

| Hallazgo | Clasificación | Dónde |
|---|---|---|
| Cuentas contadas por buró; mezcla installment/revolving | Corregido en lectura | La utilización certificada es revolving, abierta e individual. Hipoteca, installment y charge no entran. El límite null no se suma como 0 |
| Score sin familia/versión; promedio como preparación | Corregido en lectura | `scoreDelta` no publica delta si falta el modelo o las fechas. El promedio se rotula informativo. `CreditScoreObservation` sigue sin filas en la base configurada |
| Bandas de fondeo y puntos FICO sin modelo | Retirado en superficies activas (T01) | `computeFundingEstimate` no devuelve monto. `ficoImpact` no publica puntos. El PDF nuevo se genera al vuelo |
| AU por regex y montos fijos | Corregido en lectura | La ficha usa la responsabilidad confirmada. Una inferencia no cuenta. No hay máximo ni monto recomendado |
| Edad null permite qualified | Corregido en lectura | `ageOk` null ya no entra en `allOk`. La edad usa la fecha del reporte |
| Parser con tope 200 y prioridad de negativos | El corte silencioso y la preferencia por negativos salieron del extractor | El prompt pide todas las cuentas. 250 ítems se conservan. Una página vacía, una ventana cortada o el presupuesto de 5 llamadas dejan `PARTIAL` y no se publican. No hay motor de OCR. El alta manual sigue en 200 |
| Negativo tratado como disputable | Parcialmente vigente | El análisis describe la marca y la diferencia entre burós. No prueba inexactitud ni abre ronda. `disputeEligible` sigue en true por defecto |
| Score Plan sólo paydown | Corregido en lectura | `allocateUtilizationBudget` reparte un extra declarado. No envía pagos ni predice puntos |
| Consultas como contador; antigüedad con reloj de ejecución | Corregido en lectura | El contador se muestra como tal y no fabrica filas. La edad usa la fecha del reporte. `CreditInquiry` sigue sin filas en la base configurada |
| Cambio posterior a ronda como logro causal | Corregido en lectura | La comparación dice «No presente» y no pinta el delta como logro. El outcome registrado sigue diciendo «Eliminado» y el PDF aclara que no se atribuye a J&H. T19 no se abrió |
| Plazo de ronda en 30 días | Corregido en lectura | `onRoundSent` ya no suma 30 días. Sin política el plazo queda pendiente de determinar. `decideOperation` no inventa un plazo y deja el envío en revisión |
| Programas y capacidad financiera sin datos completos | Parcialmente vigente | `assessCapacity` calcula DTI y DSCR sin guardarlos y sin convertirlos en préstamo. No hay ingreso en `Client`. No hay programa guardado. `qualifyCreditProfile` no los sustituye |
| Tests que fijan la heurística actual | Parcialmente vigente | `smoke:funding-estimate` y `smoke:funding-prep` exigen `UNAVAILABLE`. `smoke:score-plan` fija 7,000, el conjunto de 6,500, la meta 0 y el centavo. `smoke:credit-budget` cubre 6,000, el sobrante, el empate y el límite ausente. `smoke:credit-contracts` cubre null, cero y centavos. `smoke:credit-normalize` cubre hipoteca, AU, locale y alias. `smoke:credit-access` cubre permiso, tenant y SSN. `smoke:credit-identity` cubre candidatos, revisión y split. `smoke:credit-backfill` cubre corte, reanudación, 10000 y asOf. `smoke:credit-review` cubre doble confirmación, versión, parcial y permiso. `smoke:credit-scores` cubre +25, modelos distintos, fecha ausente y score 0. `smoke:credit-temporal` cubre 64 meses, fecha parcial, 29 de febrero, SOFT y contador legado. `smoke:credit-revolving` cubre F01, límite ausente, más de 100% y saldo a favor. `smoke:credit-ownership` cubre una AU en tres burós, el conflicto y el ownership desconocido. `smoke:credit-anomalies` cubre 4,320, meses distintos, 30 late, cobertura parcial, charge-off y ownership. `smoke:credit-assertions` cubre correcto, no sé, documento ajeno, revocado, concurrencia y borrador inventado. `smoke:credit-rounds` cubre borrador, recepción desconocida, PDF, reintento y override. `smoke:credit-changes` cubre ausencia, cobertura parcial, identidad, saldo, modelo, VERIFIED y otro buró. `smoke:credit-actions` cubre orden, recálculo, dato incompleto, respuesta correcta, cierre y texto inventado. `smoke:credit-programs` cubre fuente, vigencia, modelo, edad, vacío, opcional, burós y ratio exacto. `smoke:credit-capacity` cubre ingreso vacío, deuda parcial, doble conteo, período, moneda, documento y mínimo. `smoke:credit-metrics` cubre vacío, parcial, conflicto, desactualizado, 38.4% y moneda ausente. `smoke:credit-portal` cubre cliente ajeno, enlace vencido, borrador, entrevista, revocación y 38.4%. `smoke:credit-operations` cubre política ausente, revocación, vigencia, otro servicio y cobro simulado. `smoke:credit-corpus` recorre F01–F30. `smoke:credit-telemetry` cubre la redacción, la caché ajena, el reintento y 250 cuentas. `smoke:credit-journey` recorre 7 000, 42.5%, 41.5% y 30%, y deja la activación apagada |
| Corpus F01–F30, aislamiento entre organizaciones, datos de producción | Parcialmente vigente | `smoke:credit-corpus` recorre F01–F30 con las funciones reales, sin base y sin un PDF de persona. El recorrido de pantalla y la base configurada siguen fuera. No se consultó producción |

La contención de bandas y puntos quedó en T01. Los contratos de calidad quedaron en T02. T03 dejó el SQL aditivo y un ensayo local desechable. T04 dejó el normalizador puro; no persiste ni fusiona cuentas. T24 dejó el guard de sesión y ocultó el último cuatro del SSN a quien no tiene `sensitive.view`. T05 dejó candidatos reversibles; no los escribe ni los usa el plan. T06 recorre esos candidatos, enlaza solo lo confirmado y publica un snapshot sin encender la lectura nueva. El ensayo local se borró. La base configurada ya tiene las tablas de T03 y no se rellenó. T07 dejó la extracción completa o parcial explícita. T08 separa el borrador de la publicación. T09 compara scores solo con el mismo buró y modelo. T10 calcula la antigüedad al corte del reporte. T11 calcula la utilización sobre cuentas revolving únicas. T12 separa los usuarios autorizados confirmados. T13 separa el pago por tarjeta del pago del conjunto. T14 reparte un presupuesto extra declarado. T15 describe diferencias entre burós sin tratarlas como error. T16 registra la respuesta del cliente sin crear una disputa. T17 separa el borrador del envío y no inventa un plazo. T18 describe el cambio observado y no lo atribuye a una disputa. T19 deriva las acciones del reporte y no promete puntos. T20 evalúa un programa concreto y no calcula un monto. T21 calcula DTI y DSCR sin inferir el ingreso. T22 muestra la cifra calculada y no convierte un vacío en 0% ni en USD. T23 muestra al cliente solo lo publicado de su sesión y no un monto aprobado. T25 deja el envío y el cobro en revisión hasta que haya una política revisada y vigente. T26 recorre F01–F30 en el smoke del CI. T27 mide 250 cuentas sintéticas dos veces y no publica un p95. El evento no guarda nombre, SSN ni saldo. T28 recorre esas cifras juntas y deja la activación apagada. No hay una tarea siguiente.
