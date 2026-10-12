import { createDatabase } from '../../src/database/connection.js';
import { seedTestFixtures } from '../../src/database/fixtures/test-fixtures.js';
import { assertSafeTestDatabase } from '../../src/database/safety.js';
import { loadDatabaseScriptEnvironment } from './shared.js';

const environment = loadDatabaseScriptEnvironment();
assertSafeTestDatabase(environment, environment.databaseUrl);
const database = createDatabase(environment.databaseUrl);

try {
  await seedTestFixtures(database, environment);
  process.stdout.write('Deterministic test fixtures seeded.\n');
} finally {
  await database.destroy();
}

