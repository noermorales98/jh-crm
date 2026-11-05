# SDD decisions log

Append-only. Newest at the bottom.

- 2026-11-05 — Spec `rondas-y-pagos-contrato-firmado` written after the code, for PR #39, so the
  tier-2 ship guard can let it land. Scope: signed contract required to send rounds and to create a
  case payment link; received payments are always recorded. Legal review and replaying failed
  Stripe webhooks stay out of scope.
