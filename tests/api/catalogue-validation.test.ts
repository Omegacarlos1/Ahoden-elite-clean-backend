import { expect } from 'chai';
import type { Knex } from 'knex';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { AppError } from '../../src/http/errors.js';
import { createLogger } from '../../src/logging/logger.js';
import { createCatalogueRouter } from '../../src/modules/catalogue/catalogue.routes.js';
import type { CatalogueService } from '../../src/modules/catalogue/catalogue.service.js';
import type { Authenticator } from '../../src/security/authentication.js';
import { testEnvironment } from '../helpers/environment.js';

describe('catalogue API contract', () => {
  const actor = {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'customer@example.test',
    role: 'customer' as const,
    status: 'active' as const
  };
  const authenticator: Authenticator = {
    async requireUser() { return actor; },
    async requireCustomer() { return actor; },
    async requireOwner() {
      throw new AppError(403, 'FORBIDDEN', 'This action is not permitted.');
    },
    async requireManagerOrOwner() {
      throw new AppError(403, 'FORBIDDEN', 'This action is not permitted.');
    }
  };
  let quoteCalls = 0;
  const fakeService = {
    async listServices() {
      return [{ id: '20000000-0000-4000-8000-000000000001', currency: 'GHS' }];
    },
    async createQuote() {
      quoteCalls += 1;
      return {};
    }
  } as unknown as CatalogueService;
  const router = createCatalogueRouter({} as Knex, testEnvironment(), {
    authenticator,
    service: fakeService
  });
  const app = createApp({
    environment: testEnvironment(),
    logger: createLogger('silent'),
    databaseProbe: { check: async () => undefined },
    apiRouter: router
  });

  it('lists active services without authentication', async () => {
    const response = await request(app).get('/api/v1/services');

    expect(response.status).to.equal(200);
    expect(response.body.data[0].currency).to.equal('GHS');
  });

  it('rejects client-supplied quote amounts instead of trusting them', async () => {
    const response = await request(app)
      .post('/api/v1/quotes')
      .send({
        serviceId: '20000000-0000-4000-8000-000000000001',
        addressId: '30000000-0000-4000-8000-000000000001',
        startsAt: '2099-01-02T09:00:00.000Z',
        inputs: { bedrooms: 2 },
        totalMinor: 1
      });

    expect(response.status).to.equal(400);
    expect(response.body.error.code).to.equal('VALIDATION_ERROR');
    expect(quoteCalls).to.equal(0);
  });

  it('denies a non-owner before accepting a price version', async () => {
    const response = await request(app)
      .post('/api/v1/services/20000000-0000-4000-8000-000000000001/price-versions')
      .send({});

    expect(response.status).to.equal(403);
    expect(response.body.error.code).to.equal('FORBIDDEN');
  });
});
