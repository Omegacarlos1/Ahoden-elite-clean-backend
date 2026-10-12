# Ahoden Elite Clean backend

Modular Node.js/Express API for Ahoden Elite Clean. M01 supplies the TypeScript,
database, observability, API-contract, and verification foundation. Business APIs
start in later milestones.

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

See [database setup](docs/database-setup.md), [OpenAPI](openapi/openapi.yaml), and
[architecture decisions](docs/architecture/ADR-001-runtime-and-data-access.md).

