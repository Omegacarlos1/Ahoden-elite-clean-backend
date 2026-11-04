# M04 test report

## Status and environment

- Status: VERIFIED
- Date: 4 November 2026
- Runtime: Node.js 24.19.0; npm 11.17.0
- Local database: XAMPP MariaDB 10.4.32
- Production-equivalent database: MySQL 8.4 GitHub Actions run 41858205596, success
- Test database: guarded `ahoden_elite_clean_test`; reset protection and separate runtime/migration principals retained

## Verification

| Command | Exit | Pass/fail/skip | Environment |
| --- | ---: | --- | --- |
| `npm run lint` | 0 | 0 ESLint errors/warnings after fix | Windows/local |
| `npm run typecheck` | 0 | TypeScript strict check passed | Windows/local |
| `npm run build` | 0 | Clean compiled build passed | Windows/local |
| `npm run test:unit` | 0 | 24 pass, 0 fail, 0 skip | Node/local |
| `npm run test:api` | 0 | 12 pass, 0 fail, 0 skip | Supertest/local |
| `npm run db:migrate` | 0 | Batch 4; 1 migration applied to development DB | MariaDB 10.4.32 |
| `npm run test:integration` | 0 | 34 pass, 0 fail, 0 skip; fresh batch 1 applied 4 migrations | Real MariaDB 10.4.32 |
| `postman spec lint openapi/openapi.yaml` | 0 | No specification issues; remote governance rules unavailable | Local Postman CLI |
| `postman collection lint postman/Ahoden_Backend.postman_collection.json` | 0 | No issues | Local Postman CLI |
| `postman environment lint postman/Ahoden_Local.environment.json --fail-severity warning` | 0 | 1 artifact scanned; 0 errors/warnings | Local Postman CLI |
| `npm run test:postman -- --env-var baseUrl=http://127.0.0.1:3001 --no-report-events` | 0 | 21 requests, 40 assertions, 0 failures | Live compiled API + real MariaDB |
| GitHub Actions `backend-ci` run 41858205596 | 0 | `npm ci`, least-privilege accounts, lint, typecheck, build, unit, API, reset, integration and Postman steps all succeeded | Ubuntu + MySQL 8.4 |

Unit count includes the existing uncommitted user-owned database startup tests;
those files were not staged as M04 work. The M04-specific API and integration
assertions are committed in their own suites.

## Acceptance and regression coverage

The 34 real-database integration tests include 12 M04 scenarios plus all M02/M03
critical regressions and database safeguards. M04 specifically proves:

- sequential and simultaneous identical-key replay creates one booking;
- simultaneous different-customer booking cannot exceed a capacity of one;
- expired quotes return `409`;
- expired unpaid reservations release capacity before a replacement hold;
- customer history is isolated and cross-customer reads are concealed;
- cancellation and reschedule policy snapshots are applied transactionally;
- simultaneous reschedules cannot exceed target capacity;
- unpaid prepaid jobs cannot be assigned;
- only active cleaners with covering availability can be assigned;
- simultaneous overlapping assignment of one cleaner yields one success/one conflict;
- reassignment requires a current version and reason and is audited;
- unassigned cleaners receive concealed `404`; and
- invalid/stale job-state transitions return `409`.

API contract tests additionally reject missing idempotency headers and client
booking/payment-state injection before service calls.

## Failures fixed and blocked checks

1. Initial integration run: 31 pass, 2 fail. InnoDB gap locks from a missing-key
   `SELECT ... FOR UPDATE` caused unrelated idempotency inserts to deadlock and
   return `500`. The claim flow now inserts first and lock-reads only after a
   duplicate-key collision.
2. Second integration run: 32 pass, 1 fail. A non-locking overlap read under
   repeatable-read isolation could use a stale snapshot after waiting on the
   cleaner row. The overlap query is now a locking current read.
3. Final lint sequence initially reported two unnecessary non-null assertions in
   the new concurrency test. They were removed; the standalone rerun passed.
4. The first final Postman server restart found a repository test server still
   listening on port 3001. Its exact Node PID was stopped; the clean rerun passed.
5. Postman OpenAPI lint initially found five inline YAML response descriptions
   whose commas were parsed as map separators. Quoting those values resolved all
   specification errors.

Blocked/skipped:

- The manual `Assign paid job - 201` Postman request was not executed because M04
  intentionally has no legitimate API/provider path to paid state. Equivalent
  manager/cleaner/paid-boundary behavior passed against controlled real-database
  integration fixtures. It is not reported as a Postman pass.
- No payment sandbox/provider, live funds, production migration, production
  notification, approved-credit policy or production dispatch was exercised.

## Postman evidence

The executable run used local files, the secret-free environment, the compiled
API on `127.0.0.1:3001`, and the real guarded test database. Expected negative
responses (`400`, `403`, `404`) count as passed assertions, not request failures.
The CLI reported its optional remote feature-flag fetch unavailable; local
collection execution and all 40 assertions completed with exit 0.

## Next milestone prompt

The complete next prompt is `docs/prompts/M05.md`. M05 was not started.
