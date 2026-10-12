import { expect } from 'chai';
import request from 'supertest';

import { createTestApp } from '../helpers/app.js';

describe('system API', () => {
  it('returns health without depending on the database', async () => {
    const response = await request(createTestApp({ check: async () => undefined })).get('/health');

    expect(response.status).to.equal(200);
    expect(response.body).to.deep.equal({ status: 'ok' });
    expect(response.headers['x-request-id']).to.be.a('string');
  });

  it('returns readiness when the database probe succeeds', async () => {
    const response = await request(createTestApp({ check: async () => undefined })).get('/ready');

    expect(response.status).to.equal(200);
    expect(response.body).to.deep.equal({ status: 'ready' });
  });

  it('returns a safe 503 when the database probe fails', async () => {
    const response = await request(
      createTestApp({
        check: async () => {
          throw new Error('mysql://user:password@private-host/database');
        }
      })
    ).get('/ready');

    expect(response.status).to.equal(503);
    expect(response.body.status).to.equal('unavailable');
    expect(response.body.error).to.deep.equal({
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database is unavailable.'
    });
    expect(JSON.stringify(response.body)).not.to.contain('password');
  });

  it('returns a safe 400 for malformed JSON', async () => {
    const response = await request(createTestApp({ check: async () => undefined }))
      .post('/api/v1/not-yet-implemented')
      .set('content-type', 'application/json')
      .send('{"broken":');

    expect(response.status).to.equal(400);
    expect(response.body.error).to.deep.equal({
      code: 'MALFORMED_JSON',
      message: 'Request body contains malformed JSON.'
    });
    expect(response.body.requestId).to.equal(response.headers['x-request-id']);
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const response = await request(createTestApp({ check: async () => undefined })).get(
      '/api/v1/not-yet-implemented'
    );

    expect(response.status).to.equal(404);
    expect(response.body.error.code).to.equal('NOT_FOUND');
    expect(response.body.requestId).to.equal(response.headers['x-request-id']);
  });
});

