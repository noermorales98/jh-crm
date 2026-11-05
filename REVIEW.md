# REVIEW.md — what the reviewer reads first

Rules: [constitution](02-DOCS/wiki/sdd/constitution.md). Start every review summary with a count:
"3 findings: 1 blocker, 2 nits".

## What failure looks like here

- A query or action without the `organizationId` filter, or without checking that the client,
  case, quote or document belongs to that organization (principle 9).
- Money collected that is not recorded, or a payment, round or contract that is hard-deleted (17).
- SSN/ITIN or other personal data in a log, prompt, fixture, URL or error message (16).
- AI output used as a score, amount or decision instead of deterministic code (10).
- A destructive or non-reversible migration (18).
- A behaviour change with no smoke test that fails without it, or a test weakened to pass (5).
- A Stripe webhook path that trusts unsigned input or answers non-2xx to a valid payment.

## Paths to skip

- `node_modules/`, `.next/`, `graphify-out/`, `prisma/migrations/**/migration_lock.toml`.
- `.claude/skills/`, `.cursor/skills/`, `.codex/rsc/`, `.agents/` (vendored skills).
- `package-lock.json` (check only that it changed with `package.json`).

## Nit cap

At most 3 nits per review. Drop the rest.

## Always-human paths

Never merge without the owner's explicit yes (principle 13):

- Payments: `src/server/payments/`, `src/server/quotes/`, `src/server/payment-plans/`,
  `src/server/receipts/`.
- Sign-in and MFA: `auth.ts`, `auth.config.ts`, `src/server/auth/`, `src/server/mfa/`,
  `src/server/security/`.
- Contracts: `src/server/contracts/`.
- Database: `prisma/schema.prisma`, `prisma/migrations/`.

Enforced locally by `.rsc/sello-config.json` (`risk.raise`), which `rsc risk` reads.
