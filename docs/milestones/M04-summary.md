# M04 Bookings scheduling and job assignment summary

## Status and scope

- Status: IMPLEMENTED WITH BLOCKED VERIFICATION
- PRD mapping: 4.1 customer booking/history and 4.3 job assignment/state ownership
- Prerequisite: M03 was VERIFIED, client-accepted, and merged into `main`; latest M03 commit `c7ffc7b` is an ancestor of the M04 branch baseline.
- Branch: `feature/B04-bookings-scheduling-job-assignment`
- Remaining verification gate: GitHub Actions MySQL 8.4 run after push. Local MariaDB 10.4.32 checks passed; that does not prove MySQL compatibility.

## Acceptance evidence

| Criterion | Evidence | Result |
| --- | --- | --- |
| Quote-to-booking and history | `POST/GET /api/v1/bookings`, strict body validation, ownership-concealed detail and bounded history | PASS locally |
| Capacity cannot be exceeded | Capacity slot is row-locked, expired holds are released under lock, and parallel different-customer booking test yields one `201` and one `409` | PASS locally |
| Duplicate keys cannot create two bookings | Scoped key + SHA-256 payload hash + unique constraint; sequential and concurrent replay tests return one booking | PASS locally |
| Expired quote | Booking conversion checks the server clock and returns `409 QUOTE_EXPIRED` | PASS locally |
| Reservation expiry | Pending holds use `BOOKING_RESERVATION_TTL_SECONDS`; the next locked slot operation releases expired holds, expires booking/job state and restores capacity transactionally | PASS locally |
| Reschedule/cancel rules | Snapshotted notice/maximum-change rules are enforced; capacity and audit/history changes commit together | PASS locally |
| Unauthorized resource access | Cross-customer bookings and unassigned-cleaner jobs return concealed `404`; role violations return `403` | PASS locally |
| Concurrent reschedule/assignment | Target slots, jobs and cleaner user rows are locked; overlap uses a locking read; optimistic job versions reject stale writes | PASS locally |
| Explicit states and invalid jumps | Booking, payment and job state columns are separate; role-specific transition maps and versions return `409` for invalid/stale jumps | PASS locally |
| Unpaid prepaid dispatch | Customer-created booking is `pending_payment` / payment `pending` / job `awaiting_payment`; assignment returns `409 PAYMENT_REQUIRED`; no paid/credit API exists | PASS locally |
| Audit cancellation/reassignment | `booking.cancelled` and `job.reassigned` audit rows are written in the same transaction; existing audit mutation triggers remain enforced | PASS locally |

## Implementation and API/schema changes

Migration `202611040004_bookings_jobs_assignments.ts` adds:

- `api_idempotency_keys` with actor/operation/key uniqueness and request hashes;
- `bookings` with independent booking and payment states;
- `booking_quote_uses` and `booking_reschedules` history;
- `capacity_reservations` linked to existing capacity slots;
- `jobs`, `cleaner_availability`, and append-only `job_assignments`;
- no-delete triggers for the new operational/history tables.

The new bookings module keeps routes thin, domain transactions in
`BookingsService`, and persistence/locking queries in `BookingsRepository`.
M04 adds:

- `POST /api/v1/bookings`
- `GET /api/v1/bookings`
- `GET /api/v1/bookings/{bookingId}`
- `POST /api/v1/bookings/{bookingId}/cancel`
- `POST /api/v1/bookings/{bookingId}/reschedule`
- `POST /api/v1/cleaners/{cleanerId}/availability`
- `POST /api/v1/jobs/{jobId}/assignments`
- `GET /api/v1/jobs/{jobId}`
- `PATCH /api/v1/jobs/{jobId}/status`

`Idempotency-Key` is mandatory for booking and assignment creation. Reusing a key
with a different payload returns `409`; replaying the same request returns the
original resource with `Idempotency-Replayed: true`.

## Fixtures, migrations, and rollback/forward-fix

The existing conspicuously labelled M03 service/slot remains the automated
Postman prerequisite. No runtime fixture marks a booking paid. Real-database tests
insert explicitly controlled paid rows solely to exercise the assignment boundary;
there is no HTTP path to reproduce that state.

Development migration 004 was applied locally as batch 4. The migration is
append-only. Before production, review lock/trigger behavior on the target dataset,
take a verified backup, and deploy as a forward migration. After application,
changes require a new forward-fix migration; do not edit migration 004. The down
path exists for isolated local/test recreation only.

## Decisions, deviations, and remaining risks

- D-008 records the 15-minute default reservation hold, scoped idempotency,
  row-lock ordering, state separation and optimistic job versions.
- Reservation cleanup is transactionally lazy: a capacity operation on the slot
  releases expired holds. A scheduled sweep can be added with M05 workers without
  changing correctness at booking contention.
- Final cancellation/rescheduling/refund policy remains blocked by B-001. M04 uses
  quote-snapshotted development policies only.
- M04 does not implement a payment provider, paid-state endpoint, refund, credit
  policy, attendance proof or realtime dispatch. Those remain M05/M06 scope.
- Successful manager assignment is an integration-test result and a manual
  Postman sample. Automated Postman does not invent paid state.

## Postman and documentation

OpenAPI 3.1 version 0.4 documents required headers, state guarantees, ownership
responses and conflict cases. `M04 Bookings - Automated` chains M02 and M03 runtime
variables into booking creation/replay/history/negative/cancellation checks.
`M04 Manual manager assignment` contains secret-free placeholders and is excluded
from smoke tests until verified paid state is available. See
`docs/postman/M04-samples.md`.

## Next milestone prompt

The complete M05 prompt is stored at `docs/prompts/M05.md`. M05 was not implemented.
