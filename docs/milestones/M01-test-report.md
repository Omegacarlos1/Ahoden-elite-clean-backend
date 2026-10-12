# M01 Project foundation and database — test report

## Status and environment

- Status: **VERIFIED**
- Executed: 12 October 2026, local Windows/XAMPP environment
- Node.js: 24.19.0; npm: 11.17.0
- Local database: MariaDB 10.4.32, `utf8mb4`, XAMPP
- Production compatibility: MySQL 8.4 in successful GitHub Actions run
  [38275026817](https://github.com/Omegacarlos1/Ahoden-elite-clean-backend/actions/runs/38275026817)
- Required skipped/blocked checks: none. Docker/MySQL 8 was unavailable locally,
  but the required production-engine gate ran successfully in CI.

## Final command evidence

| Command | Exit | Result | Evidence |
| --- | ---: | --- | --- |
| `npm run lint` | 0 | Pass | ESLint, no findings |
| `npm run typecheck` | 0 | Pass | Strict `tsc --noEmit` |
| `npm run build` | 0 | Pass | Clean TypeScript emission |
| `npm run test:unit` | 0 | 12 pass, 0 fail, 0 skip | Config, startup safety, DB guards, pagination, log redaction |
| `npm run test:api` | 0 | 5 pass, 0 fail, 0 skip | Health/readiness, failing probe, malformed JSON, 404 |
| `npm run db:migrate` | 0 | 1 migration applied to development | XAMPP MariaDB development DB |
| `npm run db:test:reset` | 0 | 1 fresh migration; 2 deterministic fixtures | Guarded XAMPP test DB |
| `npm run test:integration` | 0 | 6 pass, 0 fail, 0 skip | Real MariaDB schema, fixtures, rollback, principals/DDL, ready and refused-connection 503 |
| `npm run test:postman` | 0 | 4 requests, 4 scripts, 9 assertions; 0 failures | Health, ready, 404, malformed JSON |
| `npm audit --json` | 0 | 0 vulnerabilities | 303 total dependency nodes reported |
| `docker --version` | 1 | Locally unavailable, not a required skip | Docker command not installed; MySQL 8.4 ran in CI instead |
| GitHub Actions run `38275026817` | 0 | Pass | MySQL 8.4; all setup and verification steps succeeded |

Total automated assertions/tests counted by their runners: 23 Mocha tests plus 9
Postman assertions, all passing. Migration/reset operations are reported
separately and are not counted as tests.

## Acceptance-path detail

- Health 200: API test and Postman request.
- Readiness 200: API test, real MariaDB integration test, and Postman request.
- Readiness 503: API failing-probe test and a real Knex/mysql2 TCP connection to
  an unused local port; response concealed connection data.
- Invalid configuration: spawned server process exited 1; stderr named only
  invalid fields and excluded the supplied password.
- Malformed JSON: API and Postman verified 400 and standard safe error envelope.
- Fresh migrations: guarded all-batch test rollback followed by batch 1 and
  deterministic transactional fixture seed.
- Production protection: unit tests cover wrong environment, production-like DB
  names, unapproved hosts, matching production target, and required reset flag.
- Credentials: live integration confirms migration/runtime identities differ and
  runtime DDL fails.

## Failures found and fixed

1. Initial type/lint runs found NodeNext/pino import types, exact-optional fields,
   migration result typing, and test lint issues. Imports/types/config scopes were
   corrected; assertions were not weakened.
2. The sandbox could not execute the `tsx` loader because `uv_os_get_passwd`
   returned `ENOMEM`. Verification scripts now compile first and run emitted JS;
   this is also closer to production execution.
3. Express ignored the first error handler because it had three runtime arguments.
   Restoring the four-argument signature fixed safe JSON/parser/404 handling.
4. PowerShell 5.1 lacked static RNG `GetBytes` and `utf8NoBOM`. The XAMPP script
   now uses an RNG instance and `.NET UTF8Encoding(false)`.
5. Knex initially discovered emitted `.d.ts` migrations. Clean builds and explicit
   `.js`/`.ts` migration extension allowlists fixed it.
6. A custom Pino serializer initially received wrapped values and caused API 500s.
   Raw serializer mode fixed it; the complete API suite was rerun.
7. npm reported 19 Newman-tree advisories (including one critical). Newman was
   removed in favor of Postman's maintained CLI; the final audit reports zero.

## Postman versus manual samples

The executable `M01 Foundation` folder ran locally without a Postman login; no run
data was published. The CLI warned that sandbox policy prevented writing its user-
profile log directory, but execution and all assertions succeeded. The `M01 Manual
dependency failure` folder was not run because it instructs an operator to stop
XAMPP. Its 503 behavior is covered automatically by the real refused-connection
integration test. Role is `none` for every M01 request; no credentials or customer
fixtures exist in this milestone.

## Migration and cleanup evidence

Test reset was bounded to `ahoden_elite_clean_test` after all safety checks. It
reverted only registered project migrations, reapplied the single M01 migration,
and replaced only `test.fixture` rows inside a transaction. No development,
staging, or production data was deleted. Production rollback remains disabled;
use backup plus reviewed forward-fix procedures.

## CI verification evidence

GitHub Actions run `38275026817`, job `114898259716`, completed successfully from
16:06:06Z to 16:07:16Z on 12 October 2026. The clean MySQL 8.4 service initialized;
`npm ci`, least-privilege account creation, lint, typecheck, build, unit tests, API
tests, guarded reset, integration tests, Postman smoke, and container cleanup all
reported `success`. M01 therefore meets the repository's technical `VERIFIED`
gate. Client acceptance and production release remain separate.
