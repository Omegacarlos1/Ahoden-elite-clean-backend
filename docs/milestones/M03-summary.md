# M03 milestone report

## Status and scope

- Status: VERIFIED
- PRD mapping: 4.1, 12 (with pricing-audit control from 4.6)
- Prerequisites: M02 VERIFIED, client-accepted, and used as the stacked branch baseline

## Acceptance evidence

| Criterion | Evidence | Result |
| --- | --- | --- |
| Owner-managed services, zones, hours, capacity, prices, and policies | Strict owner-authenticated M03 routes, transaction-scoped repository/service operations, and real-DB integration flow | PASS |
| Public catalogue excludes inactive services | `GET /api/v1/services` integration assertion | PASS |
| Inactive and out-of-zone services cannot produce quotes | `SERVICE_UNAVAILABLE` and `ADDRESS_OUT_OF_ZONE` real-database integration assertions | PASS |
| Client amounts are not trusted | Strict quote schema rejects injected `totalMinor`; price, tax, currency, customer, and zone are server-owned | PASS |
| GHS precision and explicit tax | Integer minor units, basis-point tax, bigint half-up calculation; unit and integration assertions | PASS |
| Quote expiry and immutable snapshots | Server clock creates a 15-minute expiry; derived expired/bookable flags; DB triggers reject quote update/delete | PASS |
| Pricing changes do not mutate old quotes | Non-overlapping effective versions; old/new quote snapshot integration assertions | PASS |
| Slot boundaries and capacity | Exact UTC slot start, Africa/Accra business-window end check, full-capacity rejection | PASS |
| Managers cannot change prices | API and real-DB authorization assertions return 403 | PASS |
| Price edits are audited | Price version and audit event commit in one transaction with actor, reason, request ID, and snapshot | PASS |
| Recurring rules are explicit without a billing engine | Recurrence metadata and required recurring policy snapshot state `per_occurrence_upfront`, `automaticBilling=false`, and `recurringBillingCreated=false` | PASS |
| Unapproved production behavior remains disabled | `developmentOnly` is mandatory; production records require approval reference plus disabled-by-default activation gate | PASS; production decision blocked |

## Implementation and API/schema changes

Migration `202611040003_catalogue_quotes_availability.ts` adds services, immutable
price versions, exact region/locality zones and assignments, Africa/Accra business
hours, UTC capacity slots, customer-owned addresses, effective policy versions,
and immutable quote snapshots. Routes remain thin; catalogue rules and transaction
boundaries live in `CatalogueService`, while SQL reads are isolated in
`CatalogueRepository`. Shared authentication revalidates the active database user
and token role for every protected action.

The API adds public `GET /api/v1/services`; owner-only service, price, zone,
business-hour, capacity, and policy endpoints; customer-owned address endpoints;
and customer quote creation/read endpoints. Quotes snapshot service, address,
inputs, price version, explicit tax, recurrence, and policies. Capacity is checked
but intentionally not reserved until M04 quote-to-booking conversion.

## Verification

See `docs/milestones/M03-test-report.md`. Local lint, typecheck, build, 20 unit
tests in the current workspace, 8 API tests, 22 real-MariaDB integration tests,
OpenAPI/Postman lint, and a 7-request/11-assertion positive-only live Postman pass. GitHub
Actions run 41837641969 passed the committed branch on a clean MySQL 8.4 service.

## Failures fixed and blocked checks

The first migration run exposed a generated composite-index name over MySQL's
64-character limit; M03 now uses explicit short names. A later capacity test found
MariaDB silently applying first-`TIMESTAMP` automatic update behavior to
`capacity_slots.starts_at`; M03 business instants now use UTC `DATETIME`. The first
live Postman run found that a 2098-effective fixture price could quote 2099 but had
no current indicative price; its effective start is now 2026. All affected clean
gates were rerun successfully. The first pushed CI run then found two unsafe `any`
calls in a response-list assertion that had been added after the preceding local
lint; the assertion is now explicitly typed and subsequent CI passed. A compatible
lockfile refresh removed the high-severity runtime body-parser advisory without a
forced dependency downgrade.

## Fixtures, migrations, and rollback/forward-fix

Fixtures are conspicuously labelled `DEVELOPMENT`, use fixed UUIDs and a far-future
capacity slot, and reference a disabled non-login fixture owner. Test reset remains
bounded to the verified `_test` database. M03 rollback drops only M03 objects after
dropping quote immutability triggers. Production migration requires a verified
backup, MySQL 8.4 staging rehearsal, and forward-fix plan; no production migration
was run.

## Decisions, deviations, and remaining risks

D-007 records append-only effective pricing/policies, GHS minor units, the
15-minute quote TTL, Africa/Accra business time, and explicit non-billing recurring
semantics. B-001 remains unresolved: exact launch services, prices, taxes, zones,
hours, capacity, cancellation/refund/re-clean terms, and lead/travel rules require
client-owner approval. Production activation remains gated off. Exact zones use
owner-managed normalized locality matching; no unapproved maps/geocoding provider
was added. M03 quotes do not reserve capacity, so M04 must revalidate and lock the
slot transactionally.

## Postman and manual checks

The dedicated `test:postman:m03-passed` flow ran locally against the compiled API
and isolated MariaDB: 7 requests, 11 assertions, 0 failures, with only 200/201
responses. It uses successful M02 register/login setup, then lists services,
creates and lists the customer address, creates the quote, and reads it back.
Negative amount/zone cases remain covered by Mocha but are intentionally excluded
from the operator-facing positive-only folder. The database-down M01 folder
remains intentionally manual.

## Next milestone prompt

The complete M04 prompt is in `docs/prompts/M04.md` and is returned in the final
handoff. M04 has not been started.
