import { createDatabase } from '../../src/database/connection.js';
import { describeMigrationResult, getMigrationUrl } from './shared.js';

const database = createDatabase(getMigrationUrl());

try {
  const result: unknown = await database.migrate.latest();
  const { batch, count } = describeMigrationResult(result);
  process.stdout.write(`Migration batch ${batch}; applied ${count} migration(s).\n`);
} finally {
  await database.destroy();
}

