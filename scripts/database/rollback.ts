import { requireMigrationDatabaseUrl } from '../../src/config/environment.js';
import { createDatabase } from '../../src/database/connection.js';
import { assertSafeTestDatabase } from '../../src/database/safety.js';
import { describeMigrationResult, loadDatabaseScriptEnvironment } from './shared.js';

const environment = loadDatabaseScriptEnvironment();
const migrationUrl = requireMigrationDatabaseUrl(environment);

if (environment.nodeEnv === 'production') {
  throw new Error('Automatic rollback is disabled in production; use a reviewed forward-fix.');
}

if (environment.nodeEnv === 'test') {
  assertSafeTestDatabase(environment, migrationUrl);
}

const database = createDatabase(migrationUrl);

try {
  const result: unknown = await database.migrate.rollback();
  const { batch, count } = describeMigrationResult(result);
  process.stdout.write(`Rolled back batch ${batch}; reverted ${count} migration(s).\n`);
} finally {
  await database.destroy();
}

