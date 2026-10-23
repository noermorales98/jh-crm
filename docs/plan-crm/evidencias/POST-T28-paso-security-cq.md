# Evidencia — backlog Security + Code quality (pasos 1–9)

- Estado: código listo para revisión (activación sigue apagada)
- Fecha: 23 de octubre de 2026
- Plan: backlog_security_quality (sin editar el plan)

## Pasos

| Paso | Cambio | Smoke |
|---|---|---|
| 1 | `confirmCreditPdfImport` ancla snapshots/items a `proposalJson` (`selectedItemIndexes`) | `smoke:credit-pdf-confirm-anchor` |
| 2 | `identitiesFromProposal` + `assertIdentityDecisionIdsAllowed` | idem |
| 3 | Compensación post-reporte: delete report + revert phase si falla seal/patches | ancla + review manual |
| 4 | `authenticatePortal` rechaza si `candidates.length > 1` | ancla (wiring) |
| 5 | `assertChargeAllowed` / `CHARGE_SERVICE` en `registerPayment` + `fulfillQuotePayment` | `smoke:credit-operations` |
| 6 | `portalVisibleDocumentWhere` canónico en `portal-view.ts` | `smoke:credit-portal` |
| 7 | `buildProposalFromDocumentBytes` compartido sync/async | ancla + jobs |
| 8 | Fallo de `onRoundSent` → audit `ROUND_SENT_AUTOMATION_FAILED` + activity OTHER | `smoke:credit-operations` |
| 9 | Split: `extract-constants/windows/merge`, `job-effects`, `proposal-from-document` | `smoke:credit-pdf-chunk-merge` |

## Comprobaciones

| Comando | Exit |
|---|---:|
| `npm run smoke:credit-pdf-confirm-anchor` | 0 |
| `npm run smoke:credit-operations` | 0 |
| `npm run smoke:credit-portal` | 0 |
| `npm run smoke:credit-pdf-chunk-merge` | 0 |
| `npx tsc --noEmit -p tsconfig.json` | 0 |

## Limitaciones

- Sin política humana de cobro, `assertChargeAllowed()` deja cobros de crédito en REVIEW (fail-closed esperado).
- Identidades en proposal JSON siguen vacías hasta identity v2; cualquier `identityDecisionIds` no vacío falla.
- Compensación de confirm no usa una sola `$transaction` con `createCreditReport` (helpers actuales); borra reporte huérfano si falla el post-reporte.
- Activación (`POLICY`/`PROGRAM`) no marcada HECHO.
