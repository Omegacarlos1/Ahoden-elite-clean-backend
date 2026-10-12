import { createApp } from '../../src/app.js';
import type { DatabaseProbe } from '../../src/database/connection.js';
import { createLogger } from '../../src/logging/logger.js';
import { testEnvironment } from './environment.js';

export function createTestApp(databaseProbe: DatabaseProbe) {
  return createApp({
    environment: testEnvironment(),
    logger: createLogger('silent'),
    databaseProbe
  });
}

