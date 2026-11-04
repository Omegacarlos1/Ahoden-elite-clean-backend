import { createDatabase } from '../../src/database/connection.js';
import {
  M03_POSTMAN_SERVICE_ID,
  M03_POSTMAN_STARTS_AT,
  seedM03PostmanFixtures
} from '../../src/database/fixtures/m03-postman-fixtures.js';
import { assertSafeDevelopmentDatabase } from '../../src/database/safety.js';
import { loadDatabaseScriptEnvironment } from './shared.js';

const environment = loadDatabaseScriptEnvironment();
assertSafeDevelopmentDatabase(environment, environment.databaseUrl);
const database = createDatabase(environment.databaseUrl);

try {
  await database.transaction(seedM03PostmanFixtures);
  process.stdout.write(
    `Development-only M03 Postman fixtures seeded.\n` +
      `m03ServiceId=${M03_POSTMAN_SERVICE_ID}\n` +
      `m03StartsAt=${M03_POSTMAN_STARTS_AT}\n`
  );
} finally {
  await database.destroy();
}
