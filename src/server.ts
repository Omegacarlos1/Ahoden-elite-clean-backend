import { createServer } from 'node:http';

import { createApp } from './app.js';
import {
  ConfigurationError,
  loadDotenvFiles,
  loadEnvironment
} from './config/environment.js';
import { createDatabase, createDatabaseProbe } from './database/connection.js';
import { createLogger } from './logging/logger.js';

function start(): void {
  loadDotenvFiles();
  const environment = loadEnvironment();
  const logger = createLogger(environment.logLevel);
  const database = createDatabase(environment.databaseUrl, logger);
  const app = createApp({
    environment,
    logger,
    databaseProbe: createDatabaseProbe(database)
  });
  const server = createServer(app);

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'Shutdown requested');
    server.close((serverError) => {
      void database.destroy().then(() => {
        if (serverError !== undefined) {
          logger.error({ err: serverError }, 'HTTP server shutdown failed');
          process.exitCode = 1;
        }
      });
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  server.listen(environment.port, environment.host, () => {
    logger.info(
      {
        host: environment.host,
        port: environment.port,
        environment: environment.nodeEnv
      },
      'HTTP server listening'
    );
  });
}

try {
  start();
} catch (error: unknown) {
  const safeMessage =
    error instanceof ConfigurationError
      ? error.message
      : 'Application startup failed. Review server logs and configuration.';
  process.stderr.write(`${safeMessage}\n`);
  process.exitCode = 1;
}
