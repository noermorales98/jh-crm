# Evidencia post-T28 · auditoría profunda + P0

- Estado: HECHO (código P0; activación sigue apagada)
- Fecha: 23 de octubre de 2026
- Commit base: `main` @ trabajo local sobre `7c0a736` (índice Graphify Cloud)
- Repo Graphify: `noermorales98/jh-crm` (queryable)

## Auditoría (fuentes)

- Graphify Cloud: `activationGate` solo smoke; `decideOperation` solo UI + smokes antes del fix; `confirmCreditPdfImport` → impacto sin tests en grafo
- Thermos / security-review / code-quality (sesión): cobro/envío sin fail-closed en servidor; confirm PDF half-apply; portal policy duplicada; god-files
- Ponytail-debt: 0 marcadores `shortcut:`

## Cambios realizados

1. **Fail-closed `decideOperation` en `markRoundSent`**
   - [`src/server/rounds/index.ts`](../../../src/server/rounds/index.ts): exige `ALLOWED` antes de SENT
   - UI: `RoundActions` recibe `sendAllowed` / `sendBlockedReason` desde paneles (policy null → no botón enviar)
   - Smokes/seed con `ALLOWED_SEND_OPERATION` sintético (`scripts/smoke/_allowed-send-operation.ts`)

2. **Confirm PDF sin half-apply de cliente/SSN**
   - [`src/server/credit-import/index.ts`](../../../src/server/credit-import/index.ts): `createCreditReport` antes de `updateClient` / `applySensitivePartial`

3. **CI**
   - `ci:qa` incluye `smoke:credit-operations` y `smoke:credit-journey`

## Comprobaciones

| Comando | Exit |
|---|---:|
| `npm run smoke:credit-operations` | 0 |
| `npm run smoke:credit-journey` | 0 |

## Gaps humanos (no código)

- `POLICY`: política de plazos revisada y persistida
- `PROGRAM`: programa de prestamista revisado (no solo INTERNAL)
- No encender `isCreditIdentityReadEnabled` ni cobro hasta `activationGate.ready`

## Fuera de esta pasada (P1+) — cerrado en [POST-T28-paso-security-cq.md](POST-T28-paso-security-cq.md)

- Anclar `confirmCreditPdfImport` a `proposalJson` — HECHO (código)
- Validar `identityDecisionIds` — HECHO (código)
- `decideOperation(CHARGE_SERVICE)` en cobros crédito — HECHO (código; REVIEW sin política)
- Login portal multi-org fail-closed — HECHO (código)
- Unificar predicado portal — HECHO (código)
- Pipeline PDF compartido — HECHO (código)
- Partir `jobs.ts` / `extract.ts` — HECHO (código)
- `onRoundSent` con rastro — HECHO (código)
