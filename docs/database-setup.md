# Database setup, migration, and compatibility

## Environment separation

| Environment | Database | Migration account | Runtime account |
| --- | --- | --- | --- |
| Local development | `ahoden_elite_clean_dev` | `ahoden_dev_migrator` | `ahoden_dev_app` |
| Local/CI test | `ahoden_elite_clean_test` | `ahoden_test_migrator` | `ahoden_test_app` |
| Staging | separately provisioned | separate secret | separate secret |
| Production | separately provisioned | separate secret | separate secret |

The XAMPP setup script grants schema privileges only to migration accounts.
Runtime accounts receive `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on their one
database. Production and staging are not provisioned by this repository.

## Migration workflow

- Migrations live in `src/database/migrations` and are append-only after use.
- `npm run db:migrate` applies pending migrations with `MIGRATION_DATABASE_URL`.
- `npm run db:rollback` is disabled in production. Production changes require a
  reviewed backup and forward-fix plan; rollback is only for safe local/test use.
- `npm run db:test:reset` is intentionally guarded and must never be adapted to a
  broad `DROP DATABASE` or unverified `TRUNCATE`.
- Before production migrations: take and validate a restorable backup, review
  lock/table-copy behavior against the exact MySQL version and dataset, and stage
  the same upgrade path.

The first migration creates `system_metadata`. M02 adds users, sessions, reset
tokens, staff invitations, MFA recovery codes, the one-time owner-bootstrap
record, and audit events. The migration installs triggers that reject every
`UPDATE` and `DELETE` against `audit_events`; corrections must be appended.
M03 adds services, append-only price and policy versions, exact zones/localities,
business hours, capacity slots, customer addresses, and immutable quote snapshots.
M03 business instants use UTC `DATETIME` columns rather than implicit `TIMESTAMP`
behavior so MariaDB cannot silently apply `ON UPDATE CURRENT_TIMESTAMP` to slot
boundaries. Quote triggers reject every `UPDATE` and `DELETE`; M04 must reference
quotes instead of mutating their snapshots.

Test seeding deletes and recreates only the `test.fixture` metadata namespace and
idempotently inserts conspicuously labelled M03 Postman records with fixed UUIDs.
The fixture owner is disabled and cannot log in. The XAMPP setup script also creates
ignored authentication secrets.

For manual Postman checks against the development API on port `3000`, run
`npm run db:seed:dev` after migrations. This command idempotently inserts only the
labelled M03 fixture records; it does not delete or reset development data. It is
guarded to `NODE_ENV=development`, an explicitly allowed host, and a database name
ending in `_dev`, and it rejects a target matching `PRODUCTION_DATABASE_URL`.

MySQL servers with binary logging require a database administrator to enable
`log_bin_trust_function_creators` for the reviewed migration account (or to
install the triggers using an appropriately controlled administrative process).
The runtime account is never granted `SUPER`; CI enables the setting only on its
ephemeral MySQL 8.4 service before applying migrations.

## MariaDB local vs production MySQL

Local verification on 12 October 2026 used XAMPP MariaDB 10.4.32. CI targets
MySQL 8.4. These engines share the MySQL protocol but are not interchangeable
proof:

- MariaDB 10.4 implements `JSON` as a validated text alias; MySQL 8.4 uses a
  native binary JSON type. Avoid depending on storage representation or engine-
  specific JSON functions without tests on both engines.
- Default collations differ. Project databases explicitly use
  `utf8mb4_unicode_ci`; indexes and uniqueness must be reviewed for collation-
  sensitive data.
- SQL modes differ. Every pooled connection sets UTC and
  `STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION`.
- DDL, generated columns, check constraints, optimizer behavior, and locking can
  diverge. New migrations and concurrency-sensitive repositories require MySQL
  8.4 verification even when MariaDB passes.
- MySQL-compatible engines cap identifiers at 64 characters. M03 uses explicit
  short names for composite indexes rather than Knex-generated long names.
- XAMPP is local tooling only. It provides no evidence for managed MySQL TLS,
  backup/restore, monitoring, failover, or production performance.

