# M01 Project foundation and database — implementation summary

## Status and scope

- Status: **IMPLEMENTED WITH BLOCKED VERIFICATION**
- Date: 12 October 2026
- PRD mapping: sections 5, 7, and 8
- Prerequisite: none
- Verification boundary: all local checks pass on XAMPP MariaDB 10.4.32; the
  committed MySQL 8.4 GitHub Actions job has not yet run, so MariaDB-only evidence
  is not represented as production MySQL verification.

M01 only establishes the backend foundation. No authentication, customer,
booking, payment, attendance, or other later-milestone domain behavior was added.

## Acceptance evidence

| Criterion | Evidence | Result |
| --- | --- | --- |
| Modular Express application and separate app/server | `src/app.ts` creates the application; `src/server.ts` owns configuration, database, listener, and shutdown | Pass |
| Strict TypeScript and validated startup | Strict `tsconfig.json`; Zod environment schema; subprocess test exits 1 and conceals the supplied secret | Pass |
| Structured redacted logs and request IDs | Pino JSON logs, allowlisted request serializer, credential/token redaction, database URL sanitizer, `x-request-id` | Pass |
| Health is 200 | Supertest and Postman verify `{status:"ok"}` | Pass |
| Ready is 200 with DB | Real MariaDB probe plus Postman verify `{status:"ready"}` | Pass locally |
| Ready is 503 without DB | Supertest uses a real refused TCP/MySQL connection and verifies the safe `DATABASE_UNAVAILABLE` envelope | Pass locally |
| Malformed JSON is safe | Supertest and Postman verify 400 `MALFORMED_JSON` with request ID and no parser internals | Pass |
| Fresh migrations and deterministic fixtures | Guarded reset rolled back all M01 migrations, reapplied one migration, and seeded two namespaced records; idempotency tested | Pass on MariaDB |
| Tests cannot target production | Environment/host/database-name/reset-flag/production-target guards have positive and negative unit tests | Pass |
| Separate credentials | XAMPP script creates dev/test migration and runtime users; integration test proves distinct principals and denied runtime DDL | Pass locally |
| Production MySQL compatibility | CI provisions MySQL 8.4, separate test principals, migrations, and all Mocha suites | Pending remote CI |
| CI executes required checks | Workflow contains lint, typecheck, build, unit, API, integration, guarded reset, and Postman steps | Implemented; remote run pending |

## Implementation and API/schema changes

- Pinned Node 24/npm 11 toolchain and exact application/development dependency
  versions with a lockfile.
- Express 5 application with Helmet, explicit CORS origins, bounded JSON bodies,
  request IDs, safe 404/validation/parser/internal errors, and graceful shutdown.
- `GET /health` and `GET /ready`; no authentication required.
- Shared one-based pagination: page 1, page size 25, maximum 100.
- Knex/mysql2 connection pool sets UTC and shared strict SQL mode.
- Migration `202610120001_create_system_metadata` creates a namespaced JSON
  metadata table with unique/index constraints and millisecond UTC timestamps.
- Deterministic test fixture namespace with transaction-bound cleanup and insert.
- Secret-free OpenAPI 3.1 definition, Postman collection/environment, Windows
  XAMPP provisioning, migration scripts, README, ADR, decision register, report
  template, and GitHub Actions MySQL 8.4 workflow.

## Decisions and deviations

- ADR-001 selects Node 24 LTS, Express 5, Knex 3, and mysql2. Knex is the selected
  migration/query layer; no full ORM is introduced before domain tables exist.
- The user selected XAMPP MariaDB for local development. MariaDB 10.4 differences
  from production MySQL 8.4 are documented; CI is the production-engine gate.
- Postman CLI replaced Newman after the registry audit found 19 advisories in
  Newman's unmaintained transitive tree. The final full audit is clean.
- The Postman 503 folder is a documented manual sample and was not run because it
  requires deliberately stopping XAMPP. The same dependency-failure behavior was
  automated with both a failing probe and a real refused MySQL connection.

## Fixtures, setup, and migration notes

Run `scripts/setup-xampp.ps1` to create the two local databases, four separate
least-privilege accounts, and ignored environment files. The script is idempotent
and never prints its generated credentials. `npm run db:test:reset` is guarded and
affects only an allowlisted `_test` database. Production rollback is disabled;
review backup/restore and use a forward fix for applied production migrations.

See `docs/database-setup.md` for exact commands and the MariaDB/MySQL comparison.

## Remaining business/provider decisions

No unresolved business rule was enabled. Pricing/tax/zones/hours/policies,
gateway/merchant setup, GPS/photo policy, reporting visibility, approval limits,
providers, domain/hosting, and acceptance/handover remain in `docs/decisions.md`.

## Pull request description

### Changes

- Add modular strict-TypeScript Express foundation and safe system probes.
- Add Knex/mysql2 migration, isolated XAMPP databases/accounts, fixtures, and
  production-target guards.
- Add unit/API/MariaDB integration/Postman tests, OpenAPI, CI, and M01 operations
  documentation.

### Tests

- Local: lint/typecheck/build pass; 12 unit, 5 API, 6 integration, and 9 Postman
  assertions pass; npm audit reports zero vulnerabilities.
- Pending: first remote MySQL 8.4 GitHub Actions execution.

### Risks and remaining issues

- MariaDB JSON/collation/DDL behavior does not prove MySQL compatibility until CI
  passes.
- No production deployment, migration, backup drill, external provider, or client
  acceptance was performed.

## Complete next-milestone prompt

# M02 Authentication permissions and audit foundation

Effort: 5–8 developer days. Status: NOT STARTED. PRD mapping: 3, 4.6, 4.9.

Deliverables: Implement customer registration, staff invitation, one-time owner bootstrap, login, short-lived access tokens, rotating refresh sessions, logout, password reset and owner/admin MFA enrollment and verification. Use explicit field allowlists, password hashing, rate limiting and hashed reset/refresh credentials at rest. Establish server-side role and resource authorization and an append-only audit writer. Staff provisioning and role changes are owner controlled. Select and document cookie/CSRF/CORS behavior for the eventual React client.

Acceptance and verification: Public registration cannot set staff/owner role. Invalid login is generic; disabled users and revoked/reused refresh credentials are rejected. Reset tokens expire and are single-use. Test MFA challenge/recovery and owner bootstrap reuse. Customer A cannot read B; cleaners cannot access finances. Audit insertion commits with sensitive business transactions; application credentials cannot update/delete audits.

Postman samples:
- POST /api/v1/auth/register; role: none; expected 201. Body: `{"name": "Demo Customer", "email": "customer@example.test", "password": "{{demoPassword}}"}`
- POST /api/v1/auth/login; role: none; expected 200. Body: `{"email": "{{customerEmail}}", "password": "{{demoPassword}}"}`
- GET /api/v1/auth/me; role: customer; expected 200.

Codex prompt:

Read AGENTS.md, docs/PRD.docx, docs/backend-milestones.md and previous milestone reports. Inspect the repository and verify prerequisite milestones; do not overwrite unrelated work. Implement only this milestone in a modular Node.js/Express/TypeScript/MySQL backend. Follow the PRD, server-side permissions, transactional audit and real-database testing rules. Use local/test adapters when external setup is pending and record those limits. Run applicable lint, typecheck, build, Mocha unit/API/MySQL integration tests and prerequisite regressions; fix failures. Update OpenAPI and the Postman collection with positive and negative cases, fixtures and expected responses. Execute available Postman smoke tests and distinguish them from manual samples. Write docs/milestones/M02-summary.md and M02-test-report.md with commands, actual counts, failures, skipped/blocked checks, migration notes and acceptance evidence. Never invent passing tests. Finish with a concise milestone summary and the complete next-milestone prompt; do not implement the next milestone without a new instruction.

Active milestone: M02 Authentication permissions and audit foundation.
Prerequisite: M01 technically verified, or explicitly record prerequisite blockers.
Deliver: Implement customer registration, staff invitation, one-time owner bootstrap, login, short-lived access tokens, rotating refresh sessions, logout, password reset and owner/admin MFA enrollment and verification. Use explicit field allowlists, password hashing, rate limiting and hashed reset/refresh credentials at rest. Establish server-side role and resource authorization and an append-only audit writer. Staff provisioning and role changes are owner controlled. Select and document cookie/CSRF/CORS behavior for the eventual React client.
Acceptance and tests: Public registration cannot set staff/owner role. Invalid login is generic; disabled users and revoked/reused refresh credentials are rejected. Reset tokens expire and are single-use. Test MFA challenge/recovery and owner bootstrap reuse. Customer A cannot read B; cleaners cannot access finances. Audit insertion commits with sensitive business transactions; application credentials cannot update/delete audits.
Next prompt: return the complete prompt from docs/prompts/M03.md.

