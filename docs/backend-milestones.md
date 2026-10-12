# Ahoden Elite Clean Backend Development Milestones

Version 1.0 | 10 October 2026

This engineering plan implements the backend of the current PRD. It covers Node.js, Express, Socket.IO and MySQL, with TypeScript recommended. XAMPP is a local database tool, not the production host. Mocha with Chai and Supertest handles backend tests; Jest remains for the later React frontend. No frontend implementation, native apps, salary disbursement or wider company operations are added.

## How to use this pack

1. Put AGENTS.md at your backend repository root. Copy the PRD to docs/PRD.docx and this plan to docs/backend-milestones.md. Keep docs/prompts and postman in the repository.
2. Open the backend repository in Codex. Share the M01 prompt. Subsequent prompts are in docs/prompts; run one milestone at a time.
3. Codex implements, tests and fixes the active milestone, updates OpenAPI/Postman, and writes its summary and test report. Inspect evidence and unresolved business decisions before advancing.
4. Status starts as NOT STARTED for every milestone. Use IMPLEMENTED WITH BLOCKED VERIFICATION when code exists but a required check cannot run; VERIFIED only when all technical gates pass. Client approval and live release are separate states.

The proposed API paths, JSON payloads, defaults and architecture below are implementation contracts to finalize in M01, not existing endpoints or completed test results. No backend has been built or tested by this planning pack.

## Architecture and engineering baseline

Use a modular monolith: src/modules/{auth,users,catalogue,bookings,payments,jobs,attendance,feedback,inventory,reports}; shared config, database, middleware, security and events. Routes handle transport; services own rules/transactions; repositories own persistence; provider adapters handle payments, storage and messaging. Add src/workers for outbox/reminders and tests/{unit,integration,api,realtime}. Keep infrastructure adapters replaceable without premature microservices.

Choose one MySQL-compatible ORM/migration tool in M01 and record the decision. Prisma is a candidate, not a PRD mandate. Pin a supported Node runtime and dependency versions after checking current official compatibility. Commit lockfiles. No MongoDB replacement. Run integration tests against real production-equivalent MySQL; run an additional compatibility check if XAMPP supplies MariaDB. Do not use SQLite or mocked repositories as proof of SQL behavior.

API baseline: /api/v1, JSON success {data,meta?} and error {error:{code,message,details?},requestId}; sensitive errors omit details. Health/readiness use {status}. Validate bodies, path and query inputs; use allowlists. Standard statuses are 400 invalid input, 401 unauthenticated, 403 forbidden, 404 missing/concealed resource, 409 state conflict, 429 throttled and 503 unavailable dependency. Document exceptions in OpenAPI. Use bounded pagination and request IDs.

Represent money as integer minor units plus currency and exact SQL decimals for quantities. Prices are server-calculated and snapshotted. Store timestamps in UTC; use Africa/Accra for business periods. Keep booking/job/payment states separate. Prevent duplicate booking, payment, refund and stock operations through persisted idempotency, unique constraints and transactions. Capture actor, action, entity, before/after, reason and request ID in transactional audit events.

Default security: least privilege, resource ownership, field allowlists, hashed passwords, short-lived access tokens, rotating refresh sessions, owner/admin MFA, safe cookie/CSRF handling, strict CORS, rate limits, request-size limits and redacted logs. Database migration credentials differ from runtime credentials. No staff route may change/delete original attendance, ratings or audits. Corrections are additional records. Audit protection is tamper resistance, not a claim of absolute immutability.

## Business decisions and integration gates

Maintain docs/decisions.md with decision, proposed development default, owner, deadline and production impact. Final prices/taxes, exact zones/hours, cancellation/refund/re-clean rules, approval limits, manager report fields, GPS accuracy/proximity, offline handling, photo consent/retention, export columns and notification channels require approved configuration before live use. No silent production defaults.

Gateway/network/merchant selection gates sandbox integration in M05. Storage and messaging providers gate external tests in M06/M10. Continue provider-independent development with labelled local adapters; report sandbox/provider evidence separately. USD checkout is not enabled by default. No live funds, customer notifications, production migration or deployment through a milestone prompt alone.

## Effort and sequencing

Order M01 through M11. Start audit and authorization in M02, not at the end. Payment adapters precede dispatch of prepaid jobs; attendance precedes payroll; durable events precede realtime delivery. The estimates total 50–75 focused developer days, excluding waits, product decisions and frontend work. They are effort estimates, not a promise that one developer can finish the whole website in 12 weeks. Re-estimate after M01 and M04 with actual velocity. Work can be split across developers only through explicit coordination and stable contracts.

## Required evidence after every milestone

Write docs/milestones/Mxx-summary.md and Mxx-test-report.md. Include scope delivered, files/API/schema changed, PRD mapping, decisions/deviations, fixture/setup instructions, exact commands, runtime/database versions, actual pass/fail/skip counts and exit codes, failure fixes, acceptance-criterion evidence, regression coverage, provider/mock distinction and remaining risks. Include Postman requests with headers/body/status and assertions, migration and rollback/forward-fix notes, and next prompt. Do not include secrets, access tokens or customer data in reports.

Expected scripts established in M01: npm run lint; npm run typecheck; npm run build; npm run test:unit; npm run test:integration; npm run test:api; npm run test:realtime when introduced; npm run test:postman once runner support exists. CI must fail on test failures and unexpected skips in required gates. Empty test suites cannot count as verification. DB reset commands must validate an explicitly named test database before executing.

## Postman usage and sample contract

Import postman/Ahoden_Backend_Proposed.postman_collection.json and postman/Ahoden_Local.postman_environment.json. baseUrl defaults to http://localhost:3000. Populate development-only demoPassword and role tokens locally; never export real secrets. Seed fixtures supply IDs. Run only the active milestone folder plus implemented regressions; running future folders will fail until their routes exist. Set startsAt to a future enabled slot, from/to to a valid reporting period and coordinates to the assigned test job address.

The samples deliberately do not claim to be a full executable end-to-end suite. Token capture and quote/booking ID capture are provided where specified; staff tokens, addresses, paid/completed jobs, consent and inventory need fixtures. M02 MFA requires a dedicated fixture/challenge flow. Codex must align these samples with implemented OpenAPI and expand them into isolated positive/negative scenarios at each milestone. A duplicate POST only returns the initial result when the same idempotency key and payload are reused; change key for a new operation.

For payment webhook tests, use the selected provider's raw body and signing scheme in sandbox, or an explicit local fake fixture harness. Do not publish a generic production webhook bypass. Photo uploads additionally require upload to private storage and completion verification. Test Socket.IO with socket.io-client and authenticated room assertions; an ordinary HTTP/WS sample does not establish realtime isolation.

## Technical references

Express security: https://expressjs.com/en/advanced/best-practice-security/
Socket.IO middleware: https://socket.io/docs/v4/middlewares
Socket.IO rooms: https://socket.io/docs/v4/rooms/
Postman assertions: https://learning.postman.com/docs/tests-and-scripts/write-scripts/test-scripts/

## M01 Project foundation and database

Effort: 3–5 developer days. Status: VERIFIED. PRD mapping: 5, 7, 8.

Deliverables: Create a modular Express application with TypeScript strict mode, separate app/server entry points, validated environment configuration, structured redacted logs and request IDs. Set up MySQL migrations, an isolated test database, seed fixtures, error handling, validation, pagination conventions, OpenAPI and CI. Record ORM and runtime choices in an architecture decision record. Provide Windows PowerShell and XAMPP setup instructions and compare MariaDB behavior with production MySQL.

Acceptance and verification: Health is 200; readiness is 503 when the database is unavailable. Invalid configuration fails startup safely. Fresh migrations and deterministic test fixtures work against real MySQL. Tests cannot target production. CI executes lint, typecheck, build and Mocha tests. Database-down and malformed JSON paths return safe errors.

Postman samples:
- GET /health; role: none; expected 200.
- GET /ready; role: none; expected 200.

Codex prompt:

Read AGENTS.md, docs/PRD.docx, docs/backend-milestones.md and previous milestone reports. Inspect the repository and verify prerequisite milestones; do not overwrite unrelated work. Implement only this milestone in a modular Node.js/Express/TypeScript/MySQL backend. Follow the PRD, server-side permissions, transactional audit and real-database testing rules. Use local/test adapters when external setup is pending and record those limits. Run applicable lint, typecheck, build, Mocha unit/API/MySQL integration tests and prerequisite regressions; fix failures. Update OpenAPI and the Postman collection with positive and negative cases, fixtures and expected responses. Execute available Postman smoke tests and distinguish them from manual samples. Write docs/milestones/M01-summary.md and M01-test-report.md with commands, actual counts, failures, skipped/blocked checks, migration notes and acceptance evidence. Never invent passing tests. Finish with a concise milestone summary and the complete next-milestone prompt; do not implement the next milestone without a new instruction.

Active milestone: M01 Project foundation and database.
Prerequisite: none; inspect existing repository first.
Deliver: Create a modular Express application with TypeScript strict mode, separate app/server entry points, validated environment configuration, structured redacted logs and request IDs. Set up MySQL migrations, an isolated test database, seed fixtures, error handling, validation, pagination conventions, OpenAPI and CI. Record ORM and runtime choices in an architecture decision record. Provide Windows PowerShell and XAMPP setup instructions and compare MariaDB behavior with production MySQL.
Acceptance and tests: Health is 200; readiness is 503 when the database is unavailable. Invalid configuration fails startup safely. Fresh migrations and deterministic test fixtures work against real MySQL. Tests cannot target production. CI executes lint, typecheck, build and Mocha tests. Database-down and malformed JSON paths return safe errors.
Next prompt: return the complete prompt from docs/prompts/M02.md.

## M02 Authentication permissions and audit foundation

Effort: 5–8 developer days. Status: IMPLEMENTED WITH BLOCKED VERIFICATION. PRD mapping: 3, 4.6, 4.9.

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

## M03 Service catalogue quotes and availability

Effort: 4–6 developer days. Status: NOT STARTED. PRD mapping: 4.1, 12.

Deliverables: Create owner-managed services, versioned price rules, service zones, business hours, capacity slots and customer addresses. Implement server-calculated quotes with expiry and immutable pricing snapshots, GHS minor-unit amounts and explicit tax fields. Store UTC and render business time in Africa/Accra. Introduce effective-dated owner-approved policies. Use conspicuously labelled development prices; do not activate unresolved prices, taxes or cancellation rules in production.

Acceptance and verification: Inactive services and out-of-zone addresses cannot produce bookable quotes. Client amounts are rejected or ignored. Test precision, quote expiry, pricing changes, slot boundaries and unavailable capacity. Managers cannot change prices. Price edits are audited. Recurring-service rules are explicit; do not silently add a recurring billing engine.

Postman samples:
- GET /api/v1/services; role: none; expected 200.
- POST /api/v1/quotes; role: customer; expected 201. Body: `{"serviceId": "{{serviceId}}", "addressId": "{{addressId}}", "startsAt": "{{startsAt}}", "inputs": {"bedrooms": 2}}`

Codex prompt:

Read AGENTS.md, docs/PRD.docx, docs/backend-milestones.md and previous milestone reports. Inspect the repository and verify prerequisite milestones; do not overwrite unrelated work. Implement only this milestone in a modular Node.js/Express/TypeScript/MySQL backend. Follow the PRD, server-side permissions, transactional audit and real-database testing rules. Use local/test adapters when external setup is pending and record those limits. Run applicable lint, typecheck, build, Mocha unit/API/MySQL integration tests and prerequisite regressions; fix failures. Update OpenAPI and the Postman collection with positive and negative cases, fixtures and expected responses. Execute available Postman smoke tests and distinguish them from manual samples. Write docs/milestones/M03-summary.md and M03-test-report.md with commands, actual counts, failures, skipped/blocked checks, migration notes and acceptance evidence. Never invent passing tests. Finish with a concise milestone summary and the complete next-milestone prompt; do not implement the next milestone without a new instruction.

Active milestone: M03 Service catalogue quotes and availability.
Prerequisite: M02 technically verified, or explicitly record prerequisite blockers.
Deliver: Create owner-managed services, versioned price rules, service zones, business hours, capacity slots and customer addresses. Implement server-calculated quotes with expiry and immutable pricing snapshots, GHS minor-unit amounts and explicit tax fields. Store UTC and render business time in Africa/Accra. Introduce effective-dated owner-approved policies. Use conspicuously labelled development prices; do not activate unresolved prices, taxes or cancellation rules in production.
Acceptance and tests: Inactive services and out-of-zone addresses cannot produce bookable quotes. Client amounts are rejected or ignored. Test precision, quote expiry, pricing changes, slot boundaries and unavailable capacity. Managers cannot change prices. Price edits are audited. Recurring-service rules are explicit; do not silently add a recurring billing engine.
Next prompt: return the complete prompt from docs/prompts/M04.md.

## M04 Bookings scheduling and job assignment

Effort: 5–7 developer days. Status: NOT STARTED. PRD mapping: 4.1, 4.3.

Deliverables: Build quote-to-booking conversion, customer history, transactional capacity reservations, reservation expiry, reschedule/cancel rules and manager job assignment. Maintain separate booking, job and payment states with explicit permitted transitions. Enforce cleaner availability and ownership. Add API idempotency keys for creation and audit cancellation/reassignment. Until payments are implemented, prepaid bookings stay pending payment.

Acceptance and verification: Concurrent bookings cannot exceed capacity; duplicate keys cannot create two bookings. Expired quote returns 409. Unauthorized resource access returns the documented safe response. Concurrent assignment/reschedule is protected. Invalid state jumps are rejected. Unpaid prepaid jobs cannot be dispatched; approved credit is a separately authorized future policy, not a loophole.

Postman samples:
- POST /api/v1/bookings; role: customer; expected 201. Body: `{"quoteId": "{{quoteId}}"}`
- GET /api/v1/bookings/{{bookingId}}; role: customer; expected 200.
- POST /api/v1/jobs/{{jobId}}/assignments; role: manager; expected 201. Body: `{"cleanerIds": ["{{cleanerId}}"]}`

Codex prompt:

Read AGENTS.md, docs/PRD.docx, docs/backend-milestones.md and previous milestone reports. Inspect the repository and verify prerequisite milestones; do not overwrite unrelated work. Implement only this milestone in a modular Node.js/Express/TypeScript/MySQL backend. Follow the PRD, server-side permissions, transactional audit and real-database testing rules. Use local/test adapters when external setup is pending and record those limits. Run applicable lint, typecheck, build, Mocha unit/API/MySQL integration tests and prerequisite regressions; fix failures. Update OpenAPI and the Postman collection with positive and negative cases, fixtures and expected responses. Execute available Postman smoke tests and distinguish them from manual samples. Write docs/milestones/M04-summary.md and M04-test-report.md with commands, actual counts, failures, skipped/blocked checks, migration notes and acceptance evidence. Never invent passing tests. Finish with a concise milestone summary and the complete next-milestone prompt; do not implement the next milestone without a new instruction.

Active milestone: M04 Bookings scheduling and job assignment.
Prerequisite: M03 technically verified, or explicitly record prerequisite blockers.
Deliver: Build quote-to-booking conversion, customer history, transactional capacity reservations, reservation expiry, reschedule/cancel rules and manager job assignment. Maintain separate booking, job and payment states with explicit permitted transitions. Enforce cleaner availability and ownership. Add API idempotency keys for creation and audit cancellation/reassignment. Until payments are implemented, prepaid bookings stay pending payment.
Acceptance and tests: Concurrent bookings cannot exceed capacity; duplicate keys cannot create two bookings. Expired quote returns 409. Unauthorized resource access returns the documented safe response. Concurrent assignment/reschedule is protected. Invalid state jumps are rejected. Unpaid prepaid jobs cannot be dispatched; approved credit is a separately authorized future policy, not a loophole.
Next prompt: return the complete prompt from docs/prompts/M05.md.

## M05 Payments reconciliation and financial approvals

Effort: 7–10 developer days. Status: NOT STARTED. PRD mapping: 4.2, 4.6, 6.

Deliverables: Create a provider adapter, local fake adapter and selected gateway sandbox integration. Implement hosted MoMo/card checkout, payment attempts, signed raw-body webhooks, durable event inbox, independent server verification and reconciliation retries. Match reference, amount, currency and merchant context before settlement state changes. Add owner-approved refund and discount requests, concurrency-safe execution and append-only payment history. Do not hold database transactions open during external calls; track unknown provider outcomes before retrying.

Acceptance and verification: Browser redirects cannot mark bookings paid. Bad signatures, wrong amounts/currency/references and replay events are tested. Duplicates and out-of-order events do not double credit. Test provider timeout, crash after provider success, partial/refund failure and concurrent refund cap. Approval cannot be bypassed or executed twice. Mock tests plus sandbox evidence are distinct; no gateway credentials means sandbox blocked, not passed.

Postman samples:
- POST /api/v1/bookings/{{bookingId}}/payment-attempts; role: customer; expected 201. Body: `{"method": "momo", "returnUrl": "{{returnUrl}}"}`
- GET /api/v1/bookings/{{bookingId}}/payments; role: customer; expected 200.
- POST /api/v1/payments/{{paymentId}}/refund-requests; role: manager; expected 201. Body: `{"amountMinor": 10000, "reason": "Approved cancellation"}`

Codex prompt:

Read AGENTS.md, docs/PRD.docx, docs/backend-milestones.md and previous milestone reports. Inspect the repository and verify prerequisite milestones; do not overwrite unrelated work. Implement only this milestone in a modular Node.js/Express/TypeScript/MySQL backend. Follow the PRD, server-side permissions, transactional audit and real-database testing rules. Use local/test adapters when external setup is pending and record those limits. Run applicable lint, typecheck, build, Mocha unit/API/MySQL integration tests and prerequisite regressions; fix failures. Update OpenAPI and the Postman collection with positive and negative cases, fixtures and expected responses. Execute available Postman smoke tests and distinguish them from manual samples. Write docs/milestones/M05-summary.md and M05-test-report.md with commands, actual counts, failures, skipped/blocked checks, migration notes and acceptance evidence. Never invent passing tests. Finish with a concise milestone summary and the complete next-milestone prompt; do not implement the next milestone without a new instruction.

Active milestone: M05 Payments reconciliation and financial approvals.
Prerequisite: M04 technically verified, or explicitly record prerequisite blockers.
Deliver: Create a provider adapter, local fake adapter and selected gateway sandbox integration. Implement hosted MoMo/card checkout, payment attempts, signed raw-body webhooks, durable event inbox, independent server verification and reconciliation retries. Match reference, amount, currency and merchant context before settlement state changes. Add owner-approved refund and discount requests, concurrency-safe execution and append-only payment history. Do not hold database transactions open during external calls; track unknown provider outcomes before retrying.
Acceptance and tests: Browser redirects cannot mark bookings paid. Bad signatures, wrong amounts/currency/references and replay events are tested. Duplicates and out-of-order events do not double credit. Test provider timeout, crash after provider success, partial/refund failure and concurrent refund cap. Approval cannot be bypassed or executed twice. Mock tests plus sandbox evidence are distinct; no gateway credentials means sandbox blocked, not passed.
Next prompt: return the complete prompt from docs/prompts/M06.md.

## M06 Cleaner attendance checklists and photo evidence

Effort: 6–8 developer days. Status: NOT STARTED. PRD mapping: 4.3, 4.9.

Deliverables: Implement assigned-job views, check-in/out, append-only attendance events, geofence/accuracy checks, exception review and service-specific checklist versions. Reject client authority over recorded event time; offline reports record capture metadata separately from receipt time and require policy-based review. Implement private photo upload intents and verified upload completion, consent records, content validation, upload quotas, hashes and authorized expiring download URLs. Completion requires approved attendance, checklist and before/after evidence, or an explicit audited exception.

Acceptance and verification: Wrong cleaner, remote coordinates, low accuracy, duplicate check-ins and impossible checkout sequences fail safely. Attendance originals cannot be overwritten. Out-of-order/offline and clock manipulation are tested. No consent means no upload. Test oversized/invalid files, object-path tampering and cross-customer downloads. Unverified uploads do not count as job evidence; EXIF is not treated as trustworthy proof.

Postman samples:
- POST /api/v1/jobs/{{jobId}}/attendance/check-in; role: cleaner; expected 201. Body: `{"latitude": 5.6037, "longitude": -0.187, "accuracyMeters": 15}`
- POST /api/v1/jobs/{{jobId}}/photos/upload-intents; role: cleaner; expected 201. Body: `{"kind": "before", "contentType": "image/jpeg", "sizeBytes": 120000, "consentId": "{{consentId}}"}`
- POST /api/v1/jobs/{{jobId}}/attendance/check-out; role: cleaner; expected 201. Body: `{"latitude": 5.6037, "longitude": -0.187, "accuracyMeters": 15}`

Codex prompt:

Read AGENTS.md, docs/PRD.docx, docs/backend-milestones.md and previous milestone reports. Inspect the repository and verify prerequisite milestones; do not overwrite unrelated work. Implement only this milestone in a modular Node.js/Express/TypeScript/MySQL backend. Follow the PRD, server-side permissions, transactional audit and real-database testing rules. Use local/test adapters when external setup is pending and record those limits. Run applicable lint, typecheck, build, Mocha unit/API/MySQL integration tests and prerequisite regressions; fix failures. Update OpenAPI and the Postman collection with positive and negative cases, fixtures and expected responses. Execute available Postman smoke tests and distinguish them from manual samples. Write docs/milestones/M06-summary.md and M06-test-report.md with commands, actual counts, failures, skipped/blocked checks, migration notes and acceptance evidence. Never invent passing tests. Finish with a concise milestone summary and the complete next-milestone prompt; do not implement the next milestone without a new instruction.

Active milestone: M06 Cleaner attendance checklists and photo evidence.
Prerequisite: M05 technically verified, or explicitly record prerequisite blockers.
Deliver: Implement assigned-job views, check-in/out, append-only attendance events, geofence/accuracy checks, exception review and service-specific checklist versions. Reject client authority over recorded event time; offline reports record capture metadata separately from receipt time and require policy-based review. Implement private photo upload intents and verified upload completion, consent records, content validation, upload quotas, hashes and authorized expiring download URLs. Completion requires approved attendance, checklist and before/after evidence, or an explicit audited exception.
Acceptance and tests: Wrong cleaner, remote coordinates, low accuracy, duplicate check-ins and impossible checkout sequences fail safely. Attendance originals cannot be overwritten. Out-of-order/offline and clock manipulation are tested. No consent means no upload. Test oversized/invalid files, object-path tampering and cross-customer downloads. Unverified uploads do not count as job evidence; EXIF is not treated as trustworthy proof.
Next prompt: return the complete prompt from docs/prompts/M07.md.

## M07 Working hours reviews and payroll exports

Effort: 3–5 developer days. Status: NOT STARTED. PRD mapping: 4.4.

Deliverables: Calculate hours from valid approved attendance pairs, exclude overlapping intervals and unresolved anomalies, and retain calculation provenance. Implement manager review and CSV/XLSX export with date/cleaner filters and explicit business timezone. No salary transfers, statutory deductions or invented wage rules. Track export actor, filters and generation time.

Acceptance and verification: Test overnight jobs, missing checkout, overlap, exception corrections and rounding policy. Rejected/unresolved intervals are excluded or visibly flagged, never silently paid. Audit export/review. Customers and cleaners cannot export other staff hours. Protect CSV/XLSX against spreadsheet formula injection. Re-running a period gives the same result for the same input version.

Postman samples:
- GET /api/v1/attendance/reviews?from={{from}}&to={{to}}; role: manager; expected 200.
- GET /api/v1/payroll/hours/export?from={{from}}&to={{to}}&format=csv; role: manager; expected 200.

Codex prompt:

Read AGENTS.md, docs/PRD.docx, docs/backend-milestones.md and previous milestone reports. Inspect the repository and verify prerequisite milestones; do not overwrite unrelated work. Implement only this milestone in a modular Node.js/Express/TypeScript/MySQL backend. Follow the PRD, server-side permissions, transactional audit and real-database testing rules. Use local/test adapters when external setup is pending and record those limits. Run applicable lint, typecheck, build, Mocha unit/API/MySQL integration tests and prerequisite regressions; fix failures. Update OpenAPI and the Postman collection with positive and negative cases, fixtures and expected responses. Execute available Postman smoke tests and distinguish them from manual samples. Write docs/milestones/M07-summary.md and M07-test-report.md with commands, actual counts, failures, skipped/blocked checks, migration notes and acceptance evidence. Never invent passing tests. Finish with a concise milestone summary and the complete next-milestone prompt; do not implement the next milestone without a new instruction.

Active milestone: M07 Working hours reviews and payroll exports.
Prerequisite: M06 technically verified, or explicitly record prerequisite blockers.
Deliver: Calculate hours from valid approved attendance pairs, exclude overlapping intervals and unresolved anomalies, and retain calculation provenance. Implement manager review and CSV/XLSX export with date/cleaner filters and explicit business timezone. No salary transfers, statutory deductions or invented wage rules. Track export actor, filters and generation time.
Acceptance and tests: Test overnight jobs, missing checkout, overlap, exception corrections and rounding policy. Rejected/unresolved intervals are excluded or visibly flagged, never silently paid. Audit export/review. Customers and cleaners cannot export other staff hours. Protect CSV/XLSX against spreadsheet formula injection. Re-running a period gives the same result for the same input version.
Next prompt: return the complete prompt from docs/prompts/M08.md.

## M08 Ratings complaints and reclean workflows

Effort: 3–5 developer days. Status: NOT STARTED. PRD mapping: 4.5.

Deliverables: Implement completed-job ratings, complaints and re-clean requests with customer ownership checks, low-rating alerts and manager responses/resolution notes. Preserve original submissions; staff may add separate audited notes only. Configure approved 24-hour eligibility/timing rules and notifications without hardcoding an unapproved interpretation.

Acceptance and verification: Test duplicate rating submission, invalid score, another customer job, noncompleted job and re-clean deadline boundaries. Manager update/delete of original feedback is forbidden. Resolution retains original text. Owner sees every low rating/complaint. Alerts are durably queued with duplicate suppression and failure visibility.

Postman samples:
- POST /api/v1/jobs/{{jobId}}/ratings; role: customer; expected 201. Body: `{"score": 2, "comment": "Please review the kitchen clean."}`
- POST /api/v1/jobs/{{jobId}}/complaints; role: customer; expected 201. Body: `{"message": "An area needs attention."}`
- POST /api/v1/jobs/{{jobId}}/reclean-requests; role: customer; expected 201. Body: `{"reason": "Kitchen requires another clean."}`

Codex prompt:

Read AGENTS.md, docs/PRD.docx, docs/backend-milestones.md and previous milestone reports. Inspect the repository and verify prerequisite milestones; do not overwrite unrelated work. Implement only this milestone in a modular Node.js/Express/TypeScript/MySQL backend. Follow the PRD, server-side permissions, transactional audit and real-database testing rules. Use local/test adapters when external setup is pending and record those limits. Run applicable lint, typecheck, build, Mocha unit/API/MySQL integration tests and prerequisite regressions; fix failures. Update OpenAPI and the Postman collection with positive and negative cases, fixtures and expected responses. Execute available Postman smoke tests and distinguish them from manual samples. Write docs/milestones/M08-summary.md and M08-test-report.md with commands, actual counts, failures, skipped/blocked checks, migration notes and acceptance evidence. Never invent passing tests. Finish with a concise milestone summary and the complete next-milestone prompt; do not implement the next milestone without a new instruction.

Active milestone: M08 Ratings complaints and reclean workflows.
Prerequisite: M07 technically verified, or explicitly record prerequisite blockers.
Deliver: Implement completed-job ratings, complaints and re-clean requests with customer ownership checks, low-rating alerts and manager responses/resolution notes. Preserve original submissions; staff may add separate audited notes only. Configure approved 24-hour eligibility/timing rules and notifications without hardcoding an unapproved interpretation.
Acceptance and tests: Test duplicate rating submission, invalid score, another customer job, noncompleted job and re-clean deadline boundaries. Manager update/delete of original feedback is forbidden. Resolution retains original text. Owner sees every low rating/complaint. Alerts are durably queued with duplicate suppression and failure visibility.
Next prompt: return the complete prompt from docs/prompts/M09.md.

## M09 Inventory equipment and consumption controls

Effort: 4–6 developer days. Status: NOT STARTED. PRD mapping: 4.7.

Deliverables: Create supply items with units, append-only stock movement ledger, usage linked to jobs, equipment assignment and damage/loss reporting. Derive stock balances transactionally and compare consumption by service/job volume. Add configurable low-stock and unusual-use alerts; corrections use reversal/adjustment entries with reason and permissions.

Acceptance and verification: Concurrent consumption cannot overspend stock. Test negative quantity, incompatible units, duplicate movement, unauthorized adjustment and failed transaction rollback. Equipment cannot have conflicting active assignments. Low-stock alerts are deduplicated; replenishment resolves the alert. Consumption comparisons respect service type and units.

Postman samples:
- POST /api/v1/jobs/{{jobId}}/supply-usage; role: cleaner; expected 201. Body: `{"itemId": "{{itemId}}", "quantity": "0.50", "unit": "litre"}`
- POST /api/v1/equipment/{{equipmentId}}/issue-reports; role: cleaner; expected 201. Body: `{"type": "damaged", "description": "Handle needs repair."}`

Codex prompt:

Read AGENTS.md, docs/PRD.docx, docs/backend-milestones.md and previous milestone reports. Inspect the repository and verify prerequisite milestones; do not overwrite unrelated work. Implement only this milestone in a modular Node.js/Express/TypeScript/MySQL backend. Follow the PRD, server-side permissions, transactional audit and real-database testing rules. Use local/test adapters when external setup is pending and record those limits. Run applicable lint, typecheck, build, Mocha unit/API/MySQL integration tests and prerequisite regressions; fix failures. Update OpenAPI and the Postman collection with positive and negative cases, fixtures and expected responses. Execute available Postman smoke tests and distinguish them from manual samples. Write docs/milestones/M09-summary.md and M09-test-report.md with commands, actual counts, failures, skipped/blocked checks, migration notes and acceptance evidence. Never invent passing tests. Finish with a concise milestone summary and the complete next-milestone prompt; do not implement the next milestone without a new instruction.

Active milestone: M09 Inventory equipment and consumption controls.
Prerequisite: M08 technically verified, or explicitly record prerequisite blockers.
Deliver: Create supply items with units, append-only stock movement ledger, usage linked to jobs, equipment assignment and damage/loss reporting. Derive stock balances transactionally and compare consumption by service/job volume. Add configurable low-stock and unusual-use alerts; corrections use reversal/adjustment entries with reason and permissions.
Acceptance and tests: Concurrent consumption cannot overspend stock. Test negative quantity, incompatible units, duplicate movement, unauthorized adjustment and failed transaction rollback. Equipment cannot have conflicting active assignments. Low-stock alerts are deduplicated; replenishment resolves the alert. Consumption comparisons respect service type and units.
Next prompt: return the complete prompt from docs/prompts/M10.md.

## M10 Owner reports notifications and realtime

Effort: 5–7 developer days. Status: NOT STARTED. PRD mapping: 4.8, 5, 6.

Deliverables: Implement owner financial KPIs, limited manager reports, filters and paginated exports; reconcile totals to payment/refund ledger. Add weekly summaries and monthly PDF generation through a background worker and transactional outbox with retries and dead-letter visibility. Integrate chosen notification providers via adapters. Socket.IO authenticates connections and server-assigned rooms, rechecks permissions and publishes committed events only. REST remains the authoritative source after reconnect.

Acceptance and verification: Test net revenue versus gross receipts/refunds, cutoff dates and timezone boundaries. Managers/cleaners must not receive owner financial fields or room events. Test token expiry, role change/revocation, reconnect, outbox retry and duplicate delivery. Failed notifications cannot roll back a confirmed booking. Use socket.io-client automated tests; plain WebSocket requests are not equivalent Socket.IO tests.

Postman samples:
- GET /api/v1/owner/dashboard?from={{from}}&to={{to}}; role: owner; expected 200.
- GET /api/v1/manager/operations?from={{from}}&to={{to}}; role: manager; expected 200.
- POST /api/v1/owner/reports; role: owner; expected 202. Body: `{"periodStart": "{{from}}", "periodEnd": "{{to}}", "format": "pdf"}`

Codex prompt:

Read AGENTS.md, docs/PRD.docx, docs/backend-milestones.md and previous milestone reports. Inspect the repository and verify prerequisite milestones; do not overwrite unrelated work. Implement only this milestone in a modular Node.js/Express/TypeScript/MySQL backend. Follow the PRD, server-side permissions, transactional audit and real-database testing rules. Use local/test adapters when external setup is pending and record those limits. Run applicable lint, typecheck, build, Mocha unit/API/MySQL integration tests and prerequisite regressions; fix failures. Update OpenAPI and the Postman collection with positive and negative cases, fixtures and expected responses. Execute available Postman smoke tests and distinguish them from manual samples. Write docs/milestones/M10-summary.md and M10-test-report.md with commands, actual counts, failures, skipped/blocked checks, migration notes and acceptance evidence. Never invent passing tests. Finish with a concise milestone summary and the complete next-milestone prompt; do not implement the next milestone without a new instruction.

Active milestone: M10 Owner reports notifications and realtime.
Prerequisite: M09 technically verified, or explicitly record prerequisite blockers.
Deliver: Implement owner financial KPIs, limited manager reports, filters and paginated exports; reconcile totals to payment/refund ledger. Add weekly summaries and monthly PDF generation through a background worker and transactional outbox with retries and dead-letter visibility. Integrate chosen notification providers via adapters. Socket.IO authenticates connections and server-assigned rooms, rechecks permissions and publishes committed events only. REST remains the authoritative source after reconnect.
Acceptance and tests: Test net revenue versus gross receipts/refunds, cutoff dates and timezone boundaries. Managers/cleaners must not receive owner financial fields or room events. Test token expiry, role change/revocation, reconnect, outbox retry and duplicate delivery. Failed notifications cannot roll back a confirmed booking. Use socket.io-client automated tests; plain WebSocket requests are not equivalent Socket.IO tests.
Next prompt: return the complete prompt from docs/prompts/M11.md.

## M11 Release hardening recovery and backend handover

Effort: 5–8 developer days. Status: NOT STARTED. PRD mapping: 7, 8, 12, 13.

Deliverables: Run the complete API journey and regressions; review authorization, upload security, dependency vulnerabilities and migrations. Load-test critical paths using a documented staging workload and agreed latency/error targets. Produce staging deployment, TLS/secrets configuration, backup/restore drill, health/monitoring, incident/runbook and rollback or forward-fix procedures. Complete data-retention jobs, private-file lifecycle and audit access controls. Prepare frontend API handover and client UAT scripts.

Acceptance and verification: Fresh setup and upgrade migrations pass on production-equivalent MySQL. Demonstrate isolated backup restore and data integrity. No unresolved critical/high security findings without explicit recorded risk acceptance. Critical API journeys and Postman smoke suite pass; sandbox evidence and remaining production checks are recorded separately. Backend-ready does not mean full website accepted. Live payments/deployment require their specific authorization and client release gates.

Postman samples:
- GET /health; role: none; expected 200.
- GET /ready; role: none; expected 200.
- GET /api/v1/owner/dashboard?from={{from}}&to={{to}}; role: owner; expected 200.

Codex prompt:

Read AGENTS.md, docs/PRD.docx, docs/backend-milestones.md and previous milestone reports. Inspect the repository and verify prerequisite milestones; do not overwrite unrelated work. Implement only this milestone in a modular Node.js/Express/TypeScript/MySQL backend. Follow the PRD, server-side permissions, transactional audit and real-database testing rules. Use local/test adapters when external setup is pending and record those limits. Run applicable lint, typecheck, build, Mocha unit/API/MySQL integration tests and prerequisite regressions; fix failures. Update OpenAPI and the Postman collection with positive and negative cases, fixtures and expected responses. Execute available Postman smoke tests and distinguish them from manual samples. Write docs/milestones/M11-summary.md and M11-test-report.md with commands, actual counts, failures, skipped/blocked checks, migration notes and acceptance evidence. Never invent passing tests. Finish with a concise milestone summary and the complete next-milestone prompt; do not implement the next milestone without a new instruction.

Active milestone: M11 Release hardening recovery and backend handover.
Prerequisite: M10 technically verified, or explicitly record prerequisite blockers.
Deliver: Run the complete API journey and regressions; review authorization, upload security, dependency vulnerabilities and migrations. Load-test critical paths using a documented staging workload and agreed latency/error targets. Produce staging deployment, TLS/secrets configuration, backup/restore drill, health/monitoring, incident/runbook and rollback or forward-fix procedures. Complete data-retention jobs, private-file lifecycle and audit access controls. Prepare frontend API handover and client UAT scripts.
Acceptance and tests: Fresh setup and upgrade migrations pass on production-equivalent MySQL. Demonstrate isolated backup restore and data integrity. No unresolved critical/high security findings without explicit recorded risk acceptance. Critical API journeys and Postman smoke suite pass; sandbox evidence and remaining production checks are recorded separately. Backend-ready does not mean full website accepted. Live payments/deployment require their specific authorization and client release gates.
Next prompt: provide the frontend API handover and list pending client/production release checks; do not begin frontend implementation.

