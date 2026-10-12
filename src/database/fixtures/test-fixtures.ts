import type { Knex } from 'knex';

import type { Environment } from '../../config/environment.js';
import { assertSafeTestDatabase } from '../safety.js';

export const TEST_FIXTURE_NAMESPACE = 'test.fixture';

export async function seedTestFixtures(database: Knex, environment: Environment): Promise<void> {
  assertSafeTestDatabase(environment, environment.databaseUrl);

  await database.transaction(async (transaction) => {
    await transaction('system_metadata').where({ namespace: TEST_FIXTURE_NAMESPACE }).delete();
    await transaction('system_metadata').insert([
      {
        namespace: TEST_FIXTURE_NAMESPACE,
        key_name: 'dataset-version',
        value_json: JSON.stringify({ version: 1, purpose: 'M01 deterministic integration fixture' })
      },
      {
        namespace: TEST_FIXTURE_NAMESPACE,
        key_name: 'clock',
        value_json: JSON.stringify({ utc: '2026-10-12T00:00:00.000Z' })
      }
    ]);
  });
}

