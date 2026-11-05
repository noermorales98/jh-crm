---
type: progress
title: Progress — rondas-y-pagos-contrato-firmado
topic: sdd
slug: rondas-y-pagos-contrato-firmado
branch: fix/rondas-y-pagos-contrato-firmado
---

# Progress — rondas-y-pagos-contrato-firmado

Spec: [rondas-y-pagos-contrato-firmado](../specs/rondas-y-pagos-contrato-firmado.md) · PR #39

## Closing review (2026-11-05)

Three fresh-context refuters read `git diff dc61037 8dd3743`. No blocking findings.

- **Correctness:** no blockers. The gate is scoped by organization, client and signed status.
- **Security:** no blockers. Permissions, tenant scoping and Stripe signature checks hold.
- **Tests:** no blockers, two major gaps (below).

The owner chose to merge and record the gaps (2026-11-05, "Unir y apuntar huecos").

## Decision queue

- **review-after · major** — No test proves the spec rule "a round cannot use another case's
  contract". A mutant that drops the case filter in `src/server/contracts/signed-gate.ts` survives.
  Add a case to `scripts/smoke/contract-gates-db.ts`: same client, signed contract on case B, send
  a round of case A → rejected. Same for the payment link.
- **review-after · major** — `smoke:contract-gates-db` is not in CI (`.github/workflows/qa.yml`);
  CI only greps source text in `credit-operations.ts`. Decide whether CI gets a MySQL service.
- **review-after · minor** — The "sent" test checks only the status, not the review date and the
  follow-up task.
- **review-after · minor** — The manual-payment test passes even if no payment is stored; count rows.
- **review-after · minor** — `checkoutAllowed` / `looseError` only assert the error is not about the
  contract; they cannot show a link is created.
- **review-after · minor** — Deleting a case turns its contract into "no case", which then counts
  for every other case of that client. Policy question for the constitution.
- **review-after · minor** — A quote with no case gets a payment link without a contract. Matches
  the spec wording; confirm the intent.
- **manual · after deploy** — Replay in Stripe the webhooks that failed since 2026-10-23.
- **manual · after deploy** — A real Stripe test-mode payment end to end.
