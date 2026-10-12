import { expect } from 'chai';

import { assertSafeTestDatabase, UnsafeTestDatabaseError } from '../../src/database/safety.js';
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

