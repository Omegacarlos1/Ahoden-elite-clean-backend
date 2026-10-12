import { expect } from 'chai';
import type { Knex } from 'knex';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { loadEnvironment, requireMigrationDatabaseUrl } from '../../src/config/environment.js';
import { createDatabase, createDatabaseProbe } from '../../src/database/connection.js';
import {
  seedTestFixtures,
  TEST_FIXTURE_NAMESPACE
} from '../../src/database/fixtures/test-fixtures.js';
import { assertSafeTestDatabase } from '../../src/database/safety.js';
import { createLogger } from '../../src/logging/logger.js';

describe('MariaDB/MySQL integration', () => {
  const environment = loadEnvironment();
  let runtimeDatabase: Knex;
  let migrationDatabase: Knex;

  before(async () => {
    const migrationUrl = requireMigrationDatabaseUrl(environment);
    assertSafeTestDatabase(environment, environment.databaseUrl);
    assertSafeTestDatabase(environment, migrationUrl);
    runtimeDatabase = createDatabase(environment.databaseUrl);
    migrationDatabase = createDatabase(migrationUrl);
    await migrationDatabase.migrate.latest();
    await seedTestFixtures(runtimeDatabase, environment);
  });

  after(async () => {
    await runtimeDatabase.destroy();
    await migrationDatabase.destroy();
  });

  it('runs the schema on the configured real database engine', async () => {
    const rawResult = (await runtimeDatabase.raw('SELECT VERSION() AS version')) as [
      Array<{ version: string }>,
      unknown
    ];
    expect(rawResult[0][0]?.version).to.match(/(?:MySQL|MariaDB|\d+\.\d+)/i);
    expect(await runtimeDatabase.schema.hasTable('system_metadata')).to.equal(true);
  });

  it('seeds deterministic fixtures idempotently', async () => {
    await seedTestFixtures(runtimeDatabase, environment);
    const fixtures = await runtimeDatabase('system_metadata')
      .select('key_name', 'value_json')
      .where({ namespace: TEST_FIXTURE_NAMESPACE })
      .orderBy('key_name');

    expect(fixtures).to.have.length(2);
    expect(fixtures.map((fixture) => fixture.key_name)).to.deep.equal([
      'clock',
      'dataset-version'
    ]);
  });

  it('rolls back failed transactions', async () => {
    const marker = 'rollback-proof';
    try {
      await runtimeDatabase.transaction(async (transaction) => {
        await transaction('system_metadata').insert({
          namespace: TEST_FIXTURE_NAMESPACE,
          key_name: marker,
          value_json: JSON.stringify({ shouldPersist: false })
        });
        throw new Error('deliberate rollback');
      });
    } catch (error) {
      expect((error as Error).message).to.equal('deliberate rollback');
    }

    const counts = await runtimeDatabase('system_metadata')
      .where({ namespace: TEST_FIXTURE_NAMESPACE, key_name: marker })
      .count<{ count: number }[]>({ count: '*' });
    expect(Number(counts[0]?.count)).to.equal(0);
  });

  it('uses separate principals and denies schema changes to the runtime account', async () => {
    const runtimeIdentity = (await runtimeDatabase.raw('SELECT CURRENT_USER() AS user')) as [
      Array<{ user: string }>,
      unknown
    ];
    const migrationIdentity = (await migrationDatabase.raw('SELECT CURRENT_USER() AS user')) as [
      Array<{ user: string }>,
      unknown
    ];
    expect(runtimeIdentity[0][0]?.user).not.to.equal(migrationIdentity[0][0]?.user);

    const probeTable = 'm01_runtime_ddl_must_fail';
    let runtimeDdlWasDenied = false;
    try {
      await runtimeDatabase.schema.createTable(probeTable, (table) => {
        table.integer('id');
      });
    } catch {
      runtimeDdlWasDenied = true;
    } finally {
      if (await migrationDatabase.schema.hasTable(probeTable)) {
        await migrationDatabase.schema.dropTable(probeTable);
      }
    }
    expect(runtimeDdlWasDenied).to.equal(true);
  });

  it('reports ready through the API using the real database probe', async () => {
    const app = createApp({
      environment,
      logger: createLogger('silent'),
      databaseProbe: createDatabaseProbe(runtimeDatabase)
    });
    const response = await request(app).get('/ready');

    expect(response.status).to.equal(200);
    expect(response.body).to.deep.equal({ status: 'ready' });
  });

  it('reports a safe 503 when a real database connection is unavailable', async () => {
    const unavailableDatabase = createDatabase(
      'mysql://unavailable:unavailable@127.0.0.1:1/ahoden_elite_clean_test'
    );
    try {
      const app = createApp({
        environment,
        logger: createLogger('silent'),
        databaseProbe: createDatabaseProbe(unavailableDatabase)
      });
      const response = await request(app).get('/ready');

      expect(response.status).to.equal(503);
      expect(response.body.error.code).to.equal('DATABASE_UNAVAILABLE');
      expect(JSON.stringify(response.body)).not.to.contain('unavailable@');
    } finally {
      await unavailableDatabase.destroy();
    }
  });
});
