import { fileURLToPath } from 'node:url';

import type { Knex } from 'knex';
import type { Logger } from 'pino';

import { redactDatabaseUrls } from '../logging/logger.js';

interface MysqlConnection {
  query(sql: string, callback: (error: Error | null) => void): void;
}

export function buildKnexConfig(databaseUrl: string, logger?: Logger): Knex.Config {
  const migrationExtension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

  return {
    client: 'mysql2',
    connection: databaseUrl,
    acquireConnectionTimeout: 2_000,
    log: {
      debug(message: unknown) {
        logger?.debug({ databaseMessage: safeDatabaseMessage(message) }, 'Database debug message');
      },
      warn(message: unknown) {
        logger?.warn({ databaseMessage: safeDatabaseMessage(message) }, 'Database warning');
      },
      error(message: unknown) {
        logger?.error({ databaseMessage: safeDatabaseMessage(message) }, 'Database error');
      },
      deprecate(message: unknown) {
        logger?.warn({ databaseMessage: safeDatabaseMessage(message) }, 'Database deprecation');
      }
    },
    pool: {
      min: 0,
      max: 10,
      afterCreate(connection: MysqlConnection, done: (error: Error | null, connection: MysqlConnection) => void) {
        connection.query("SET time_zone = '+00:00'", (timezoneError) => {
          if (timezoneError !== null) {
            done(timezoneError, connection);
            return;
          }

          connection.query(
            "SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
            (sqlModeError) => done(sqlModeError, connection)
          );
        });
      }
    },
    migrations: {
      directory: fileURLToPath(new URL('./migrations', import.meta.url)),
      extension: migrationExtension.slice(1),
      loadExtensions: [migrationExtension],
      tableName: 'knex_migrations'
    }
  };
}

function safeDatabaseMessage(message: unknown): string {
  if (message instanceof Error) {
    return redactDatabaseUrls(message.message);
  }

  return redactDatabaseUrls(typeof message === 'string' ? message : 'Non-string database message');
}

