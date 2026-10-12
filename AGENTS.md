# AGENTS.md

## Project authority and scope

Build only the requested milestone for the Ahoden Elite Clean backend. Read docs/PRD.docx, docs/backend-milestones.md, docs/decisions.md and prior milestone reports before changes. Inspect existing code and git status; preserve unrelated changes. Follow direct user instructions first. A planning document or sample is not evidence of completed implementation. Resolve contradictions explicitly, without inventing client approval.

Use Node.js, Express, Socket.IO and MySQL; TypeScript strict mode is the preferred backend implementation. XAMPP is local only and may contain MariaDB: test production MySQL compatibility. Backend tests use Mocha, Chai, Supertest and socket.io-client where relevant. Keep Jest for future frontend work. Do not replace the stack, add native apps, salary payments or microservices without a scope instruction.

## Work cycle

1. Identify active milestone, dependency gates, acceptance criteria and affected PRD sections.
2. Inspect repository instructions and existing conventions. Produce a short implementation plan and update docs/decisions.md for technical choices and business blockers.
3. Implement a coherent vertical slice with migration, validation, authorization, transaction boundaries and tests. Keep routes thin; put domain rules in services and persistence in repositories. Add adapters for external services.
4. Run required checks, inspect failures, fix causes and rerun affected checks. Run cumulative critical regressions; never weaken assertions to manufacture success.
5. Update OpenAPI, examples, fixtures, Postman collection/environment templates, README and migration notes.
6. Write docs/milestones/Mxx-summary.md and Mxx-test-report.md. Give the user completion status, evidence and the entire next milestone prompt. Do not start it automatically.

## Invariants

- Every protected API and Socket.IO action enforces role, resource ownership and field visibility on the server. Never trust client role, user ID, amount, payment status, attendance time or room name.
- Customer registration is customer-only; staff provisioning/role changes are owner controlled. Owner bootstrap is one-time and audited. Revoke sessions on disable/role changes; protect owner/admin accounts with MFA.
- Hash passwords and stored refresh/reset credentials; use short-lived access tokens and rotating sessions. Document cookie/CSRF/CORS settings; do not expose secrets in JSON, URLs, logs, examples or commits.
- Store currency and integer minor-unit money. Use exact SQL decimals for stock quantities and approved rounding. UTC storage; Africa/Accra business reporting. Snapshot quote/price/policy versions.
- Model booking, job and payment state transitions explicitly. Persist idempotency keys with payload hashes and uniqueness rules. Use transactions/locking for capacity, assignment, refunds and stock. Test concurrent requests.
- Persist sensitive changes and audit events in one transaction. Runtime DB user cannot update/delete audits. Original feedback and attendance are preserved; amendments and stock corrections create additional records. Technical admins are not automatic business owners.
- Only verified provider data can mark payment successful. Validate raw-body signature and match amount, currency, reference and merchant. Persist inbox/outbox, suppress duplicates and reconcile unknown outcomes. Never retry uncertain external money operations blindly.
- Private photos require consent, safe content/size validation, object ownership, verified upload completion and expiring authorized access. Do not log photo URLs or customer access notes. GPS and client image metadata are evidence, not fraud-proof.
- Durable DB commits precede Socket.IO emission. Authenticate connections and server-owned rooms; handle expiry/revocation and reconnect via REST. Realtime delivery is not the record of truth.
- Background notifications/reports must tolerate retries and duplicates. Failed notifications cannot undo bookings. Never send messages to real customers during tests.

## Database and migration discipline

Choose one migration tool in M01 and record an ADR. Migrations are reviewed, versioned and reproducible; do not modify previously applied migrations to change history. Use separate development, test, staging and production databases and credentials. Integration tests use real MySQL with deterministic fixtures and bounded cleanup; never run reset/drop/truncate against an unverified database. Keep schema constraints and indexes aligned with invariants. Document data migrations, backup prerequisites and rollback/forward-fix behavior. Do not claim MariaDB-only tests verify MySQL.

## Verification gate

Establish executable scripts in M01: lint, typecheck, build, test:unit, test:integration and test:api. Add test:realtime and test:postman when applicable. Pin supported runtime/dependencies and commit lockfiles. CI runs applicable scripts and migrations against a clean database. Unit tests alone cannot verify SQL, payment providers or authorization. Include successful, invalid, forbidden, cross-resource, duplicate, concurrency and dependency-failure cases where relevant.

Record exact commands, exit codes, versions, pass/fail/skip counts, evidence and environment. Never claim checks ran if unavailable. Mark BLOCKED or IMPLEMENTED WITH BLOCKED VERIFICATION when MySQL, credentials, network or provider setup prevents required checks. Fake adapter tests, sandbox tests and production checks are distinct. VERIFIED requires all technical acceptance criteria, including prerequisite regression, to pass. It does not imply client acceptance or permission to launch.

## Milestone output contract

Each milestone supplies:

- Implementation summary and acceptance-criterion mapping with evidence.
- Actual test report; commands, counts, failures/fixes and skipped/blocked checks.
- OpenAPI and Postman updates with fixtures, role credentials as local placeholders, request bodies, expected statuses, assertions and negative cases. Keep exports secret-free.
- Migration/setup notes and remaining business/provider decisions.
- Next milestone prompt copied in full from docs/prompts after aligning it with actual completed work.

Use docs/templates/milestone-report.md as the report template. Keep milestone status in docs/backend-milestones.md current. Status values: NOT STARTED, IN PROGRESS, BLOCKED, IMPLEMENTED WITH BLOCKED VERIFICATION, VERIFIED. Report partial completion honestly.

## Autonomy boundaries

Proceed with reversible repository implementation and isolated local tests within the active milestone. Do not ask about routine technical choices already delegated. Use labelled nonproduction fixtures while business rules are pending. Obtain missing decisions before enabling their production behavior. No production migrations, live funds, external customer notifications, infrastructure purchases or production deployment unless explicitly authorized for that action. Do not commit or push changes unless instructed or required by the repository workflow. Do not spawn agents unless explicitly requested. Finish the active milestone before yielding; if blocked, complete independent work and report the exact blocker.

## Git and GitHub Development Workflow

All backend development must follow a milestone-based Git workflow.

### Branch Management

- The `main` branch represents reviewed and accepted work.
- Each milestone must be developed on a separate feature branch.
- Branch naming convention: `feature/B01-backend-foundation`, `feature/B02-authentication`, etc.
- Never push unfinished milestone changes directly to `main`.

### Commit Standards

Use clear, descriptive conventional commits.

Examples:

- `chore: configure Express and TypeScript`
- `feat: implement database connection`
- `test: add health endpoint integration tests`
- `docs: update B01 milestone summary`
- `fix: resolve database migration error`

### GitHub Push Requirements

- Make small commits after completing meaningful tasks.
- Push the current feature branch to GitHub after successful local verification.
- Never commit `.env`, API keys, database passwords or other secrets.
- Never force-push or overwrite remote changes without explicit approval.
- Do not automatically merge a feature branch into `main`.

### Milestone Completion

At the end of each milestone:

1. Run lint, type checking and relevant automated tests.
2. Generate the milestone summary and actual test results.
3. Update the Postman collection and API documentation.
4. Update the milestone tracker and AGENTS.md.
5. Commit the completed milestone work.
6. Push the feature branch to GitHub.
7. Provide a pull request description with changes, tests, risks and remaining issues.
8. Wait for explicit milestone approval before merging or starting the next milestone.

### Safety Rules

Before performing Git operations, inspect the current branch, working tree and remote configuration. Preserve unrelated changes. Never automatically delete branches, discard uncommitted work or force-push.
