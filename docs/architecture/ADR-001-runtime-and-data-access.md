# ADR-001: Runtime and data-access baseline

- Status: Accepted for M01
- Date: 2026-10-12
- Scope: PRD sections 5, 7, and 8

## Context

The backend requires a modular Node.js/Express service, strict TypeScript, local
XAMPP MariaDB, production MySQL, reproducible migrations, and real-database tests.
Runtime credentials must not be capable of schema migration. The domain model is
not yet stable enough to justify generated active-record entities.

## Decision

Use Node.js 24 LTS (minimum 24.11.0), npm 11, Express 5, and strict TypeScript.
Use Knex 3 as a thin SQL query builder and migration runner over `mysql2`; do not
adopt a full ORM in M01. Route handlers remain transport-focused, later domain
rules go in services, and persistence goes in repositories.

Use reviewed, append-only migrations. Supply migration and runtime URLs
separately. Set every connection to UTC and a shared strict SQL mode. Test local
compatibility on MariaDB and production compatibility on MySQL 8.4 in CI.

## Consequences

- SQL and transaction boundaries remain explicit and testable.
- There is no generated domain model or implicit lazy loading; repositories must
  map rows deliberately.
- Schema/type drift must be controlled through migrations, repository tests, and
  OpenAPI—not ORM generation.
- MariaDB and MySQL differences require dual-engine evidence. Passing local tests
  alone is insufficient for `VERIFIED`.
- Node 24 is supported through April 2028 per the Node.js release line; schedule a
  runtime review before then.

## Alternatives considered

- Prisma: strong generated client and migrations, but adds schema generation and
  abstraction before domain tables exist and can obscure engine-specific SQL.
- Raw `mysql2` migration scripts: minimal dependency surface but reinvents
  migration ordering/locking/history.
- Sequelize/TypeORM: broader active-record/data-mapper surface than M01 needs.

