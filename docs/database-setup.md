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
Test seeding deletes and recreates only the `test.fixture` namespace inside a
transaction. The XAMPP setup script also creates ignored authentication secrets.

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
- XAMPP is local tooling only. It provides no evidence for managed MySQL TLS,
  backup/restore, monitoring, failover, or production performance.

