import type { Environment } from '../config/environment.js';

const FORBIDDEN_DATABASE_NAME_PARTS = ['prod', 'production', 'staging'];

export class UnsafeTestDatabaseError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'UnsafeTestDatabaseError';
  }
}

export function assertSafeTestDatabase(environment: Environment, databaseUrl: string): URL {
  if (environment.nodeEnv !== 'test') {
    throw new UnsafeTestDatabaseError('Refusing test database operation unless NODE_ENV=test.');
  }

  if (!environment.allowTestDatabaseReset) {
    throw new UnsafeTestDatabaseError(
      'Refusing test database operation unless ALLOW_TEST_DATABASE_RESET=true.'
    );
  }

  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1)).toLowerCase();
  if (!/^[a-z0-9_]+_test$/.test(databaseName)) {
    throw new UnsafeTestDatabaseError('Test database name must end with _test.');
  }

  if (FORBIDDEN_DATABASE_NAME_PARTS.some((part) => databaseName.includes(part))) {
    throw new UnsafeTestDatabaseError('Test database name contains a forbidden environment label.');
  }

  if (!environment.testDatabaseAllowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new UnsafeTestDatabaseError('Test database host is not explicitly allowed.');
  }

  if (
    environment.productionDatabaseUrl !== undefined &&
    normalizeDatabaseTarget(parsed) === normalizeDatabaseTarget(new URL(environment.productionDatabaseUrl))
  ) {
    throw new UnsafeTestDatabaseError('Test database target matches the production database target.');
  }

  return parsed;
}

function normalizeDatabaseTarget(url: URL): string {
  return `${url.hostname.toLowerCase()}:${url.port || '3306'}${url.pathname.toLowerCase()}`;
}

