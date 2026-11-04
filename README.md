# Ahoden Elite Clean backend

Modular Node.js/Express API for Ahoden Elite Clean. M04 adds idempotent
quote-to-booking conversion, transactional capacity reservations, customer booking
history, policy-governed cancellation/rescheduling, cleaner availability, and
concurrency-safe job assignment to the M01–M03 platform.

## Requirements

- Node.js 24 LTS and npm 11
- XAMPP MariaDB 10.4+ for local development
- Production target: MySQL 8.4 LTS (verified separately in CI)
- Windows PowerShell 5.1+

## Windows/XAMPP setup

1. Start **MySQL** from the XAMPP Control Panel.
2. From the repository root, create the isolated databases and accounts:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-xampp.ps1 -UseBlankRootPassword
   ```

   Omit `-UseBlankRootPassword` to receive a secure password prompt if the local
   root account has a password. The script creates development/test databases,
   separate migration/runtime accounts, and ignored `.env.local` files. It never
   prints generated passwords.

3. Apply development migrations and recreate the guarded test schema:

   ```powershell
   npm install
   npm run db:migrate
   npm run db:test:reset
   ```

4. Start the API:

   ```powershell
   npm run dev
   ```

   `GET http://127.0.0.1:3000/health` checks the process; `GET /ready` also checks
   database connectivity.

   M03 development catalogue data must set `developmentOnly: true`. Final prices,
   taxes, zones, hours, capacity, and policies are unresolved and cannot be
   activated for production while `CATALOGUE_PRODUCTION_ACTIVATION_ENABLED=false`.
   Keep that gate disabled until the client owner approves the launch configuration
   and supplies a recorded approval reference. Quotes expire after
   `QUOTE_TTL_SECONDS` (900 seconds by default).

   M04 capacity holds expire after `BOOKING_RESERVATION_TTL_SECONDS` (900 seconds
   by default). Customer-created prepaid bookings remain `pending_payment`; M04
   exposes no route that can mark them paid. Manager assignment requires a
   confirmed booking with verified paid state, which M05 will establish through
   provider verification. There is no approved-credit bypass.

## Verification

```powershell
npm run lint
npm run typecheck
npm run build
npm run test:unit
npm run test:api
npm run test:integration
npm run test:postman
```

`db:test:reset` refuses to run unless the environment is `test`, the host is
allowlisted, the database ends in `_test`, and `ALLOW_TEST_DATABASE_RESET=true`.
It rolls back only versioned project migrations and deletes only namespaced test
fixtures. Never point local environment files at production.

## API conventions

- Versioned business routes use `/api/v1`; platform probes remain `/health` and
  `/ready`.
- Success responses use `{ "data": ..., "meta": ... }`; health probes use
  `{ "status": ... }`.
- Errors use `{ "error": { "code", "message", "details"? }, "requestId" }`.
- Pagination uses one-based `page`, defaults `pageSize` to 25, and caps it at 100.
- Request IDs are returned in `x-request-id`. Logs are structured JSON with
  credentials, tokens, cookies, and authorization headers redacted.
- Money uses integer GHS minor units and explicit tax basis points/amounts. Quote
  request bodies cannot supply amounts, tax, currency, customer IDs, or zone IDs.
- UTC instants are rendered for operations as `Africa/Accra` business time.
  Recurring services carry schedule and per-occurrence-upfront policy snapshots;
  M03 intentionally creates no recurring billing engine.
- Booking creation and job assignment require `Idempotency-Key`. Booking, job,
  and payment states remain separate, and state/version conflicts return `409`.

See [database setup](docs/database-setup.md), [OpenAPI](openapi/openapi.yaml), and
[architecture decisions](docs/architecture/ADR-001-runtime-and-data-access.md) and
[authentication ADR](docs/architecture/ADR-002-authentication-and-session-security.md).

