# Decision and blocker register

| ID | Decision / blocker | Current position | Owner | Deadline | Production impact |
| --- | --- | --- | --- | --- | --- |
| D-001 | Runtime and data-access layer | Node.js 24 LTS; Express 5; Knex migrations/query builder with `mysql2`; ADR-001 | Technical lead | M01 | Approved technical baseline; re-review before Node 24 EOL |
| D-002 | Local database | XAMPP MariaDB 10.4.32 for developer use; MySQL 8.4 remains production/CI compatibility target | Technical lead | M01 | MariaDB-only success cannot authorize production release |
| D-003 | API envelope/pagination | Standard error envelope and request ID; page 1/25 default/100 maximum | Technical lead | M01 | All future endpoints must reuse these conventions |
| D-004 | Authentication/session security | scrypt passwords; short HMAC access tokens; opaque rotating refresh cookies with double-submit CSRF; encrypted TOTP; ADR-002 | Technical lead | M02 | Signing/encryption/bootstrap secrets must be independently managed and rotated |
| D-005 | M02 outbound delivery | No-op local runtime adapter and in-memory test capture only | Technical lead | M02 | Invitation/reset production delivery remains blocked by B-005 |
| D-007 | M03 catalogue activation and quote semantics | Append-only effective-dated GHS price/policy versions; 15-minute immutable quote snapshots; exact Africa/Accra capacity slots; recurring services are schedule metadata with per-occurrence upfront payment and no billing engine; all pending business configuration is explicitly `developmentOnly` | Technical lead | M03 | Production catalogue records require an approval reference and the disabled-by-default `CATALOGUE_PRODUCTION_ACTIVATION_ENABLED` gate; final client prices, taxes, zones, hours, capacity and policies remain blocked by B-001 |
| D-008 | M04 booking, reservation and assignment concurrency | Persist scoped idempotency keys with payload hashes; lock capacity/cleaner rows; hold unpaid capacity for 15 minutes by default; use policy snapshots for changes; keep booking, payment and job states separate; require optimistic job versions for transitions/reassignment | Technical lead | M04 | M04 cannot mark payment paid and provides no credit bypass; paid dispatch depends on M05 verified provider state, while production cancellation/rescheduling remains blocked by B-001 |
| B-001 | Launch services, exact pricing, taxes, zones, hours, capacity, cancellation/refund/re-clean policies | Unapproved; use labelled nonproduction fixtures only | Client owner/product representative | Before M03 production behavior | Checkout/booking production activation blocked |
| B-002 | Payment gateway, networks, merchant/settlement and USD | Unapproved; GHS only is the stated baseline | Client owner | Before M05 provider integration | Live payment activation blocked |
| B-003 | GPS accuracy/proximity, offline review, photo consent/retention | Unapproved | Client owner/operations | Before M06 production behavior | Attendance/photo activation blocked |
| B-004 | Manager report fields, approval thresholds, payroll export format | Unapproved | Client owner | Before M07/M10 | Sensitive workflows/report visibility blocked |
| B-005 | Storage and messaging providers/channels/budget | Unapproved | Client owner | Before M06/M10 external integration | Only local adapters/tests permitted |
| B-006 | Domain, hosting, source/IP handover, support window, acceptance representative | Unapproved | Client owner + delivery lead | Before release | Production procurement/deployment/UAT sign-off blocked |

