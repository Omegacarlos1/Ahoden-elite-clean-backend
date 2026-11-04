# M04 Postman samples

## Automated folder

Run the saved customer flow against the isolated test API:

```powershell
npm run test:postman:m04 -- --env-var baseUrl=http://127.0.0.1:3001 --no-report-events
```

The command executes successful M02 registration/login, the M03 address/quote
chain, and `M04 Bookings - Automated`. Runtime collection variables capture the
customer token, quote, idempotency key, booking and job IDs. The folder verifies:

- booking creation returns `201` with separate `pending_payment`, `pending`, and
  `awaiting_payment` states;
- identical key/payload replay returns the same booking and
  `Idempotency-Replayed: true`;
- own history and detail return `200`;
- client-supplied payment state returns the expected `400`;
- a customer assignment attempt returns the expected `403`; and
- policy-valid cancellation returns `200` and releases the reservation.

Concurrency, expired-quote, cross-customer, unavailable-cleaner, unpaid-dispatch,
invalid-transition and reassignment cases use the real-database Mocha suite because
they require controlled clocks, multiple authenticated actors, or parallel
transactions.

## Manual manager assignment sample

`M04 Manual manager assignment` is deliberately excluded from automated Postman
smoke tests. Populate these local environment placeholders only from a controlled
test/M05 flow:

| Variable | Scope | Meaning |
| --- | --- | --- |
| `m04ManagerAccessToken` | Environment/secret | Active manager access token |
| `m04CleanerId` | Environment | Active cleaner with a covering availability window |
| `m04PaidJobId` | Environment | Unassigned job whose booking has verified `paid` state |

M04 exposes no endpoint that can manufacture paid state. The manual request is
expected to return `201` only when those prerequisites are genuine; otherwise
`PAYMENT_REQUIRED` or an availability conflict is the correct result.
