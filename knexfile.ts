import type { Knex } from 'knex';

import {
  loadDotenvFiles,
  loadEnvironment,
  requireMigrationDatabaseUrl
} from './src/config/environment.js';
import { buildKnexConfig } from './src/database/config.js';

loadDotenvFiles();
const environment = loadEnvironment();
const migrationDatabaseUrl = requireMigrationDatabaseUrl(environment);

const config: Record<string, Knex.Config> = {
  development: buildKnexConfig(migrationDatabaseUrl),
  test: buildKnexConfig(migrationDatabaseUrl),
  production: buildKnexConfig(migrationDatabaseUrl)
};

export default config;
