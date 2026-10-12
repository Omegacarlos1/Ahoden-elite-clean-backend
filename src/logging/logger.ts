import pino, { type Logger, type LoggerOptions } from 'pino';

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'token',
  '*.token',
  'accessToken',
  'refreshToken',
  'databaseUrl',
  'migrationDatabaseUrl'
];

export function createLogger(level: LoggerOptions['level'] = 'info'): Logger {
  return pino({
    level,
    redact: {
      paths: REDACTED_PATHS,
      censor: '[REDACTED]'
    },
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime
  });
}

export function safeErrorForLog(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { type: 'unknown' };
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return {
    name: error.name,
    message: redactDatabaseUrls(error.message),
    ...(code === undefined ? {} : { code })
  };
}

export function redactDatabaseUrls(message: string): string {
  return message.replace(/mysql2?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]');
}

