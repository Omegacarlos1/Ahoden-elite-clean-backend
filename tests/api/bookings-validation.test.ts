import { expect } from 'chai';
import type { Knex } from 'knex';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { AppError } from '../../src/http/errors.js';
import { createLogger } from '../../src/logging/logger.js';
import { createBookingsRouter } from '../../src/modules/bookings/bookings.routes.js';
import type { BookingsService } from '../../src/modules/bookings/bookings.service.js';
import type { Authenticator } from '../../src/security/authentication.js';
import { testEnvironment } from '../helpers/environment.js';

describe('bookings and jobs API contract', () => {
  const customer = {
    id: '61000000-0000-4000-8000-000000000001',
    email: 'm04-api-customer@example.test',
    role: 'customer' as const,
    status: 'active' as const
  };
  const authenticator: Authenticator = {
    async requireUser() {
      return customer;
    },
    async requireCustomer() {
      return customer;
    },
    async requireOwner() {
      throw new AppError(403, 'FORBIDDEN', 'This action is not permitted.');
    },
    async requireManagerOrOwner() {
      throw new AppError(403, 'FORBIDDEN', 'This action is not permitted.');
    }
  };
  let bookingCalls = 0;
  const fakeService = {
    async createBooking() {
      bookingCalls += 1;
      return { data: { id: '62000000-0000-4000-8000-000000000001' }, replayed: true };
    }
  } as unknown as BookingsService;
  const app = createApp({
    environment: testEnvironment(),
    logger: createLogger('silent'),
    databaseProbe: { check: async () => undefined },
    apiRouter: createBookingsRouter({} as Knex, testEnvironment(), {
      authenticator,
      service: fakeService
    })
  });

  it('requires an idempotency key before creating a booking', async () => {
    const response = await request(app)
      .post('/api/v1/bookings')
      .send({ quoteId: '63000000-0000-4000-8000-000000000001' });

    expect(response.status).to.equal(400);
    expect(response.body.error.code).to.equal('IDEMPOTENCY_KEY_REQUIRED');
    expect(bookingCalls).to.equal(0);
  });

  it('rejects client-controlled booking and payment states', async () => {
    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', 'm04-api-state-injection')
      .send({
        quoteId: '63000000-0000-4000-8000-000000000001',
        bookingStatus: 'confirmed',
        paymentStatus: 'paid'
      });

    expect(response.status).to.equal(400);
    expect(response.body.error.code).to.equal('VALIDATION_ERROR');
    expect(bookingCalls).to.equal(0);
  });

  it('returns 201 and marks a persisted idempotent replay', async () => {
    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', 'm04-api-valid-booking')
      .send({ quoteId: '63000000-0000-4000-8000-000000000001' });

    expect(response.status).to.equal(201);
    expect(response.headers['idempotency-replayed']).to.equal('true');
    expect(response.body.data.id).to.equal('62000000-0000-4000-8000-000000000001');
    expect(bookingCalls).to.equal(1);
  });

  it('enforces manager or owner authorization before job assignment validation', async () => {
    const response = await request(app)
      .post('/api/v1/jobs/64000000-0000-4000-8000-000000000001/assignments')
      .set('Idempotency-Key', 'm04-api-assignment')
      .send({ cleanerIds: ['65000000-0000-4000-8000-000000000001'] });

    expect(response.status).to.equal(403);
    expect(response.body.error.code).to.equal('FORBIDDEN');
  });
});
