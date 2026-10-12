import { expect } from 'chai';

import {
  ConfigurationError,
  loadEnvironment,
  requireMigrationDatabaseUrl
} from '../../src/config/environment.js';

const validEnvironment = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '3001',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'mysql://app:secret@127.0.0.1:3306/ahoden_elite_clean_test',
  MIGRATION_DATABASE_URL: 'mysql://migrator:secret@127.0.0.1:3306/ahoden_elite_clean_test',
  CORS_ORIGINS: 'http://localhost:5173',
  TRUST_PROXY: 'false',
  BODY_LIMIT: '100kb',
  ALLOW_TEST_DATABASE_RESET: 'true'
} satisfies NodeJS.ProcessEnv;

describe('environment configuration', () => {
  it('parses an explicit valid configuration', () => {
    const result = loadEnvironment(validEnvironment);

    expect(result.nodeEnv).to.equal('test');
    expect(result.port).to.equal(3001);
    expect(result.corsOrigins).to.deep.equal(['http://localhost:5173']);
  });

  it('fails safely when required configuration is absent', () => {
    expect(() => loadEnvironment({ NODE_ENV: 'production' })).to.throw(ConfigurationError);

    try {
      loadEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'mysql://user:topsecret@localhost' });
      expect.fail('Expected invalid configuration to throw');
    } catch (error) {
      expect(error).to.be.instanceOf(ConfigurationError);
      expect((error as Error).message).not.to.contain('topsecret');
    }
  });

  it('rejects wildcard production CORS', () => {
    expect(() =>
      loadEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        CORS_ORIGINS: '*'
      })
    ).to.throw(ConfigurationError, 'CORS_ORIGINS');
  });

  it('requires a separate migration URL only for migration tasks', () => {
    const environment = loadEnvironment({ ...validEnvironment, MIGRATION_DATABASE_URL: undefined });
    expect(() => requireMigrationDatabaseUrl(environment)).to.throw(
      ConfigurationError,
      'MIGRATION_DATABASE_URL'
    );
  });
});

