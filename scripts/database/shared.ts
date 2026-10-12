import {
  loadDotenvFiles,
  loadEnvironment,
  requireMigrationDatabaseUrl
} from '../../src/config/environment.js';

export function loadDatabaseScriptEnvironment() {
  loadDotenvFiles();
  return loadEnvironment();
}

export function getMigrationUrl(): string {
  return requireMigrationDatabaseUrl(loadDatabaseScriptEnvironment());
}

export function describeMigrationResult(result: unknown): { batch: number; count: number } {
  if (
    !Array.isArray(result) ||
    typeof result[0] !== 'number' ||
    !Array.isArray(result[1])
  ) {
    throw new Error('Migration runner returned an unexpected result.');
  }

  return { batch: result[0], count: result[1].length };
}

