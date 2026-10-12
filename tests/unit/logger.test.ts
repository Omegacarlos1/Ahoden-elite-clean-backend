import { expect } from 'chai';

import { safeErrorForLog } from '../../src/logging/logger.js';

describe('safe structured logging', () => {
  it('redacts database URLs from error messages', () => {
    const safeError = safeErrorForLog(
      new Error('Connection failed for mysql://user:secret@private.example/database')
    );

    expect(safeError.message).to.equal('Connection failed for [REDACTED_DATABASE_URL]');
    expect(JSON.stringify(safeError)).not.to.contain('secret');
  });
});
