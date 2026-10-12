import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().min(1),
    MIGRATION_DATABASE_URL: z.string().min(1).optional(),
    CORS_ORIGINS: z.string().min(1),
    TRUST_PROXY: z.enum(['true', 'false']).default('false'),
    BODY_LIMIT: z.string().regex(/^\d+(?:b|kb|mb)$/i).default('100kb'),
    ALLOW_TEST_DATABASE_RESET: z.enum(['true', 'false']).optional(),
    TEST_DATABASE_ALLOWED_HOSTS: z.string().optional(),
    PRODUCTION_DATABASE_URL: z.string().optional()
  })
  .superRefine((value, context) => {
    for (const [field, candidate] of [
      ['DATABASE_URL', value.DATABASE_URL],
      ['MIGRATION_DATABASE_URL', value.MIGRATION_DATABASE_URL],
      ['PRODUCTION_DATABASE_URL', value.PRODUCTION_DATABASE_URL]
    ] as const) {
      if (candidate === undefined) {
        continue;
      }

      try {
        const parsed = new URL(candidate);
        if (!['mysql:', 'mysql2:'].includes(parsed.protocol) || parsed.pathname.length <= 1) {
          throw new Error('Unsupported database URL');
        }
      } catch {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'must be a valid MySQL URL containing a database name'
        });
      }
    }

    const origins = value.CORS_ORIGINS.split(',').map((origin) => origin.trim());
    if (value.NODE_ENV === 'production' && origins.includes('*')) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'cannot contain a wildcard in production'
      });
    }
  });

export interface Environment {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  databaseUrl: string;
  migrationDatabaseUrl?: string;
  corsOrigins: string[];
  trustProxy: boolean;
  bodyLimit: string;
  allowTestDatabaseReset: boolean;
  testDatabaseAllowedHosts: string[];
  productionDatabaseUrl?: string;
}

export class ConfigurationError extends Error {
  public readonly fields: string[];

  public constructor(fields: string[]) {
    super(`Invalid environment configuration (${fields.join(', ')})`);
    this.name = 'ConfigurationError';
    this.fields = fields;
  }
}

export function loadDotenvFiles(nodeEnv = process.env.NODE_ENV): void {
  if (nodeEnv === 'test') {
    loadDotenv({ path: '.env.test.local', override: false, quiet: true });
  }

  loadDotenv({ path: '.env.local', override: false, quiet: true });
  loadDotenv({ path: '.env', override: false, quiet: true });
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? 'environment')))];
    throw new ConfigurationError(fields);
  }

  const parsed = result.data;
  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    databaseUrl: parsed.DATABASE_URL,
    ...(parsed.MIGRATION_DATABASE_URL === undefined
      ? {}
      : { migrationDatabaseUrl: parsed.MIGRATION_DATABASE_URL }),
    corsOrigins: parsed.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    trustProxy: parsed.TRUST_PROXY === 'true',
    bodyLimit: parsed.BODY_LIMIT,
    allowTestDatabaseReset: parsed.ALLOW_TEST_DATABASE_RESET === 'true',
    testDatabaseAllowedHosts: (parsed.TEST_DATABASE_ALLOWED_HOSTS ?? '127.0.0.1,localhost')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
    ...(parsed.PRODUCTION_DATABASE_URL === undefined
      ? {}
      : { productionDatabaseUrl: parsed.PRODUCTION_DATABASE_URL })
  };
}

export function requireMigrationDatabaseUrl(environment: Environment): string {
  if (environment.migrationDatabaseUrl === undefined) {
    throw new ConfigurationError(['MIGRATION_DATABASE_URL']);
  }

  return environment.migrationDatabaseUrl;
}

