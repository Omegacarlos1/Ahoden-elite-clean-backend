# M02 milestone report

## Status and scope

- Status: IMPLEMENTED WITH BLOCKED VERIFICATION (local MariaDB complete; MySQL 8.4 CI pending at report creation)
- PRD mapping: 3, 4.6, 4.9
- Prerequisites: M01 VERIFIED and merged through PR #1

## Acceptance evidence

| Criterion | Evidence | Result |
| --- | --- | --- |
| Customer registration cannot select privileged fields | Strict Zod allowlist and role-injection API test | PASS |
| Staff provisioning/role/status owner-controlled | Owner middleware, invitation acceptance, forbidden customer test, session revocation | PASS |
| Owner bootstrap one-time; owner/admin MFA | Locked singleton, encrypted TOTP, single-use recovery codes, reuse tests | PASS |
| Safe login/session/reset behavior | Generic login errors; short access token; hashed rotating refresh family; disabled user rejection; expiring/single-use reset tests | PASS |
| Resource authorization | Current-user lookup and concealed cross-customer read test | PASS |
| Transactional immutable audit | Registration/bootstrap/invite/security/reset audit in transactions; DB triggers reject update/delete | PASS |
| Cleaner finance denial | No finance resource exists before M05; owner-only authorization foundation is tested | NOT APPLICABLE IN M02 API |
| MySQL compatibility | Workflow provisions MySQL 8.4 and runs migrations/all gates | PENDING CI |

## Implementation and API/schema changes

Added customer registration, customer/staff login, owner bootstrap, mandatory owner/admin TOTP, recovery codes, refresh rotation/reuse detection, logout with CSRF, password reset, staff invitation/acceptance, current-user and owner security operations. Sensitive credentials are hashed at rest; TOTP seeds are AES-256-GCM encrypted. M02 migration adds seven authentication tables plus append-only audit triggers.

## Fixtures, migrations, and rollback/forward-fix

Migration `202610120002_authentication_foundation.ts` is additive and was applied cleanly to XAMPP MariaDB. Local/test reset reapplies both migrations. Previously applied migrations were not modified. Production requires a backup and staged forward-fix plan; the owner-bootstrap record must not be removed after use.

## Decisions, deviations, and remaining risks

ADR-002 records scrypt, signed access tokens, opaque refresh credentials, double-submit CSRF, TOTP encryption, and audit protection. Local notification delivery is intentionally a no-op; tests use an in-memory capture adapter. Production email/SMS remains blocked by B-005. The in-memory rate limiter is suitable for one process only and must be replaced by a shared store before horizontal scaling.

## Postman and manual checks

Automated folders M01 and M02 ran 9 requests and 17 assertions with no failures. Database-down readiness remains a documented manual-only sample because it requires stopping XAMPP. Owner bootstrap/MFA/reset/invitation secrets remain automated Mocha integration cases and are not exported as Postman secrets.

## Next milestone prompt

See `docs/prompts/M03.md`. M03 was not implemented.
