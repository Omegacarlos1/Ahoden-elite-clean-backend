# M02 test report

## Environment

- Date: 2026-10-12
- Node.js 24.19.0; npm 11.17.0
- Local database: XAMPP MariaDB 10.4.32, isolated `ahoden_elite_clean_test`
- Production compatibility target: MySQL 8.4 in GitHub Actions (pending at report creation)

## Verification

| Command | Exit | Pass/fail/skip | Environment |
| --- | ---: | --- | --- |
| `npm run lint` | 0 | PASS | local |
| `npm run typecheck` | 0 | PASS | local |
| `npm run build` | 0 | PASS | local |
| `npm run test:unit` | 0 | 15 pass, 0 fail | local |
| `npm run test:api` | 0 | 5 pass, 0 fail | local |
| `npm run test:integration` | 0 | 15 pass, 0 fail; fresh 2-migration schema | real MariaDB |
| `npm run test:postman` | 0 | 9 requests, 17 assertions, 0 fail | live local API/MariaDB |
| `git diff --check` | 0 | PASS | local |
| GitHub Actions `backend-ci` | pending | MySQL 8.4 verification not yet available | CI |

Total Mocha result: 35 passing, 0 failing. Postman CLI warned that its user-profile log directory was not writable and that cloud publishing was unauthenticated; neither affected the local run or exit code.

## Failures fixed and blocked checks

The first integration run had 12 passing and 2 failing. Refresh reuse revocation was initially rolled back because the error was thrown inside the transaction; detection now commits family revocation/audit before returning the safe error. User-security audit serialization initially included a Knex SQL expression; the audit now records only concrete before/after fields. The rerun passed. MySQL 8.4 remains the only pending technical check until the pushed branch workflow completes.

## Coverage notes

Tests cover field injection, generic bad login, active and disabled accounts, current-user access, cross-customer concealment, refresh rotation and reuse, owner bootstrap reuse, TOTP enrollment/challenge, recovery-code reuse, owner-only staff invite and acceptance, session revocation, reset expiry/single use, real transaction rollback, least-privilege DDL rejection, and DB-enforced audit immutability. No finance route exists yet, so cleaner finance field filtering becomes executable with the finance milestone.
