import type { Environment } from '../../src/config/environment.js';

export function testEnvironment(overrides: Partial<Environment> = {}): Environment {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 3001,
    logLevel: 'silent',
    databaseUrl: 'mysql://test_app:local-only@127.0.0.1:3306/ahoden_elite_clean_test',
    migrationDatabaseUrl:
      'mysql://test_migrator:local-only@127.0.0.1:3306/ahoden_elite_clean_test',
    corsOrigins: ['http://localhost:5173'],
    trustProxy: false,
    bodyLimit: '100kb',
    allowTestDatabaseReset: true,
    testDatabaseAllowedHosts: ['127.0.0.1', 'localhost', 'mysql'],
    ...overrides
  };
}

