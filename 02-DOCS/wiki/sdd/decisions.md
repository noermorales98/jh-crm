# SDD decisions log

Append-only. Newest at the bottom.

- 2026-11-05 — Spec `rondas-y-pagos-contrato-firmado` written after the code, for PR #39, so the
  tier-2 ship guard can let it land. Scope: signed contract required to send rounds and to create a
  case payment link; received payments are always recorded. Legal review and replaying failed
  Stripe webhooks stay out of scope.
- 2026-11-05 — Closing review of `rondas-y-pagos-contrato-firmado`: three refuters, no blockers.
  The owner chose to merge PR #39 now and record the test gaps in the progress decision queue.
- 2026-11-05 — Constitution v1.0.0 ratified by the owner. Choices: gitmoji commits (vs plain);
  delicate areas (payments, auth/MFA, contracts, database) always via PR + three refuters + owner's
  yes (vs refuters only, vs no special path); DB smokes must run in GitHub CI (vs by hand); no AI
  authorship marks (vs allowed). Existing rules in docs/02, 06, 07 and .cursor/rules ratified.
  Delicate paths enforced locally by `.rsc/sello-config.json` (not in git). Accessibility floor
  left out for now.
