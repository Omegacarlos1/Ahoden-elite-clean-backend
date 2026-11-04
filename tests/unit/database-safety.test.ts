import { expect } from 'chai';

import {
  assertSafeDevelopmentDatabase,
  assertSafeTestDatabase,
  UnsafeDevelopmentDatabaseError,
  UnsafeTestDatabaseError
} from '../../src/database/safety.js';
import { testEnvironment } from '../helpers/environment.js';

describe('test database safety guard', () => {
  it('accepts an explicitly allowed local test database', () => {
    const environment = testEnvironment();
    expect(assertSafeTestDatabase(environment, environment.databaseUrl).pathname).to.equal(
      '/ahoden_elite_clean_test'
    );
  });

  it('rejects non-test environments and production-like names', () => {
    const environment = testEnvironment();
    expect(() =>
      assertSafeTestDatabase({ ...environment, nodeEnv: 'production' }, environment.databaseUrl)
    ).to.throw(UnsafeTestDatabaseError);
    expect(() =>
      assertSafeTestDatabase(environment, 'mysql://app:x@127.0.0.1:3306/ahoden_production_test')
    ).to.throw(UnsafeTestDatabaseError);
  });

  it('rejects unapproved hosts and a matching production target', () => {
    const environment = testEnvironment();
    expect(() =>
      assertSafeTestDatabase(environment, 'mysql://app:x@database.example.com/ahoden_test')
    ).to.throw(UnsafeTestDatabaseError);
    expect(() =>
      assertSafeTestDatabase(
        { ...environment, productionDatabaseUrl: environment.databaseUrl },
        environment.databaseUrl
      )
    ).to.throw(UnsafeTestDatabaseError);
  });
});

describe('development database safety guard', () => {
  const databaseUrl = 'mysql://dev_app:local-only@127.0.0.1:3306/ahoden_elite_clean_dev';

  it('accepts an explicitly allowed local development database', () => {
    const environment = testEnvironment({ nodeEnv: 'development', databaseUrl });
    expect(assertSafeDevelopmentDatabase(environment, databaseUrl).pathname).to.equal(
      '/ahoden_elite_clean_dev'
    );
  });

  it('rejects non-development environments and names without the _dev suffix', () => {
    const environment = testEnvironment({ nodeEnv: 'development', databaseUrl });
    expect(() =>
      assertSafeDevelopmentDatabase({ ...environment, nodeEnv: 'test' }, databaseUrl)
    ).to.throw(UnsafeDevelopmentDatabaseError);
    expect(() =>
      assertSafeDevelopmentDatabase(
        environment,
        'mysql://dev_app:x@127.0.0.1:3306/ahoden_elite_clean_test'
      )
    ).to.throw(UnsafeDevelopmentDatabaseError);
  });

  it('rejects unapproved hosts and a matching production target', () => {
    const environment = testEnvironment({ nodeEnv: 'development', databaseUrl });
    expect(() =>
      assertSafeDevelopmentDatabase(
        environment,
        'mysql://dev_app:x@database.example.com/ahoden_elite_clean_dev'
      )
    ).to.throw(UnsafeDevelopmentDatabaseError);
    expect(() =>
      assertSafeDevelopmentDatabase(
        { ...environment, productionDatabaseUrl: databaseUrl },
        databaseUrl
      )
    ).to.throw(UnsafeDevelopmentDatabaseError);
  });
});

