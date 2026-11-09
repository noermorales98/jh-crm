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
- 2026-11-05 — Business rules BR-043..BR-046 added to `docs/02-BUSINESS_RULES.md`. Quote with no
  case needs no contract (vs always require one). Deleted-case contracts only documented, not coded
  (vs voiding them), because cases are only deleted with the whole organization.
- 2026-11-05 — `main` protected for PRs: `lint + typecheck + build:qa` and
  `db smokes (MySQL desechable)` must be green to merge (vs no protection). Admins can still push
  directly, as principle 12 allows.
- 2026-11-09 — Spec `conector-mcp-claude` approved and clarified by the owner. Remote MCP with OAuth
  for claude.ai and the apps (vs personal token for Desktop/Code only, vs both in phases). Delete
  exactly as the app allows, soft delete where rule 17 applies (vs archive only, vs no delete).
  All roles may connect, bounded by their permissions (vs no VIEWER, vs OWNER/ADMIN, vs per-user
  switch). Connections never expire for the user; short-lived internal token with silent refresh
  and revocation (vs 7/30/90 days) — risk of a lost device accepted. Delivered in three batches,
  one PR each (vs all at once, vs read-only first).
- 2026-11-09 — Plan `conector-mcp-claude` (batch 1). Own OAuth 2.1 server inside the CRM, reusing the
  Auth.js session, MFA and sessionVersion (vs an external identity provider, which would add a new
  stack piece and duplicate login/roles). Generic read tools (list/get/search) plus one write tool
  per app action (vs one tool per entity and operation, 80+ tools after three batches). "Delete"
  maps to the app's archive/cancel actions. Access token 1 h, non-expiring refresh token rotated on
  every use with reuse detection. Connector behind FEATURE_MCP_CONNECTOR and a per-organization
  switch, off by default (constitution rule 18).
