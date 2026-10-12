import knex, { type Knex } from 'knex';
import type { Logger } from 'pino';

import { buildKnexConfig } from './config.js';

export interface DatabaseProbe {
  check(): Promise<void>;
}

export function createDatabase(databaseUrl: string, logger?: Logger): Knex {
  return knex(buildKnexConfig(databaseUrl, logger));
}

export function createDatabaseProbe(database: Knex): DatabaseProbe {
  return {
    async check(): Promise<void> {
      await database.raw('SELECT 1 AS ready');
    }
  };
}

