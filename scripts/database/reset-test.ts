import { requireMigrationDatabaseUrl } from '../../src/config/environment.js';
import { createDatabase } from '../../src/database/connection.js';
import { seedTestFixtures } from '../../src/database/fixtures/test-fixtures.js';
import { assertSafeTestDatabase } from '../../src/database/safety.js';
import { describeMigrationResult, loadDatabaseScriptEnvironment } from './shared.js';

const environment = loadDatabaseScriptEnvironment();
const migrationUrl = requireMigrationDatabaseUrl(environment);
assertSafeTestDatabase(environment, environment.databaseUrl);
assertSafeTestDatabase(environment, migrationUrl);

const migrationDatabase = createDatabase(migrationUrl);
try {
  await migrationDatabase.migrate.rollback(undefined, true);
  const result: unknown = await migrationDatabase.migrate.latest();
  const { batch, count } = describeMigrationResult(result);
  process.stdout.write(`Fresh migration batch ${batch}; applied ${count} migration(s).\n`);
} finally {
  await migrationDatabase.destroy();
}

const runtimeDatabase = createDatabase(environment.databaseUrl);
try {
  await seedTestFixtures(runtimeDatabase, environment);
  process.stdout.write('Deterministic test fixtures seeded.\n');
} finally {
  await runtimeDatabase.destroy();
}
