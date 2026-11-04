import { expect } from 'chai';
import type { Knex } from 'knex';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { loadEnvironment } from '../../src/config/environment.js';
import { createDatabase, createDatabaseProbe } from '../../src/database/connection.js';
import { createLogger } from '../../src/logging/logger.js';
import { createCatalogueRouter } from '../../src/modules/catalogue/catalogue.routes.js';
import {
  CatalogueService,
  type CatalogueClock
} from '../../src/modules/catalogue/catalogue.service.js';
import { signToken } from '../../src/security/auth-crypto.js';

describe('service catalogue, quotes, and availability integration', () => {
  const environment = loadEnvironment();
  const ownerId = '31000000-0000-4000-8000-000000000001';
  const customerId = '31000000-0000-4000-8000-000000000002';
  const customerBId = '31000000-0000-4000-8000-000000000003';
  const managerId = '31000000-0000-4000-8000-000000000004';
  let now = new Date('2026-11-04T08:00:00.000Z');
  const clock: CatalogueClock = { now: () => new Date(now) };
  let database: Knex;
  let app: ReturnType<typeof createApp>;
  let ownerAccess = '';
  let customerAccess = '';
  let customerBAccess = '';
  let managerAccess = '';
  let serviceId = '';
  let inactiveServiceId = '';
  let addressId = '';
  let outOfZoneAddressId = '';
  let quoteId = '';
  let firstPriceVersionId = '';

  before(async () => {
    database = createDatabase(environment.databaseUrl);
    await database('users').insert([
      {
        id: ownerId,
        email: 'm03-owner@example.test',
        display_name: 'M03 Owner',
        password_hash: 'not-used-in-this-suite',
        role: 'owner',
        status: 'active'
      },
      {
        id: customerId,
        email: 'm03-customer@example.test',
        display_name: 'M03 Customer',
        password_hash: 'not-used-in-this-suite',
        role: 'customer',
        status: 'active'
      },
      {
        id: customerBId,
        email: 'm03-customer-b@example.test',
        display_name: 'M03 Customer B',
        password_hash: 'not-used-in-this-suite',
        role: 'customer',
        status: 'active'
      },
      {
        id: managerId,
        email: 'm03-manager@example.test',
        display_name: 'M03 Manager',
        password_hash: 'not-used-in-this-suite',
        role: 'manager',
        status: 'active'
      }
    ]);
    ownerAccess = signToken(
      { sub: ownerId, role: 'owner', purpose: 'access' },
      environment.accessTokenSecret,
      3600
    );
    customerAccess = signToken(
      { sub: customerId, role: 'customer', purpose: 'access' },
      environment.accessTokenSecret,
      3600
    );
    customerBAccess = signToken(
      { sub: customerBId, role: 'customer', purpose: 'access' },
      environment.accessTokenSecret,
      3600
    );
    managerAccess = signToken(
      { sub: managerId, role: 'manager', purpose: 'access' },
      environment.accessTokenSecret,
      3600
    );
    const service = new CatalogueService(database, environment, undefined, clock);
    app = createApp({
      environment,
      logger: createLogger('silent'),
      databaseProbe: createDatabaseProbe(database),
      apiRouter: createCatalogueRouter(database, environment, { service })
    });
  });

  after(async () => database.destroy());

  it('lets only the owner create labelled catalogue and availability configuration', async () => {
    const blockedProductionService = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({
        code: 'unapproved-production-service',
        name: 'Unapproved Production Service',
        description: 'This must remain blocked until business configuration is approved.',
        durationMinutes: 60,
        status: 'active',
        developmentOnly: false,
        approvalReference: 'unapproved-test-reference',
        recurrence: { mode: 'one_time' }
      });
    expect(blockedProductionService.status).to.equal(409);
    expect(blockedProductionService.body.error.code).to.equal(
      'PRODUCTION_CONFIGURATION_UNAPPROVED'
    );

    const service = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({
        code: 'development-weekly-home-clean',
        name: 'DEVELOPMENT Weekly Home Clean',
        description: 'Conspicuously labelled nonproduction recurring service fixture.',
        durationMinutes: 120,
        status: 'active',
        developmentOnly: true,
        recurrence: { mode: 'recurring', unit: 'week', interval: 1 }
      });
    expect(service.status).to.equal(201);
    serviceId = service.body.data.id;

    const inactive = await request(app)
      .post('/api/v1/services')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({
        code: 'development-inactive-clean',
        name: 'DEVELOPMENT Inactive Clean',
        description: 'Conspicuously labelled inactive nonproduction service fixture.',
        durationMinutes: 60,
        status: 'inactive',
        developmentOnly: true,
        recurrence: { mode: 'one_time' }
      });
    inactiveServiceId = inactive.body.data.id;

    const managerPrice = await request(app)
      .post(`/api/v1/services/${serviceId}/price-versions`)
      .set('Authorization', `Bearer ${managerAccess}`)
      .send({});
    expect(managerPrice.status).to.equal(403);

    const price = await request(app)
      .post(`/api/v1/services/${serviceId}/price-versions`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({
        baseAmountMinor: 45_000,
        includedBedrooms: 1,
        bedroomSurchargeMinor: 10_000,
        taxBasisPoints: 1_250,
        effectiveFrom: '2026-11-01T00:00:00.000Z',
        effectiveTo: '2026-11-06T00:00:00.000Z',
        developmentOnly: true,
        reason: 'M03 development fixture price'
      });
    expect(price.status).to.equal(201);
    expect(price.body.data.currency).to.equal('GHS');
    firstPriceVersionId = price.body.data.id;

    const overlappingPrice = await request(app)
      .post(`/api/v1/services/${serviceId}/price-versions`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({
        baseAmountMinor: 50_000,
        includedBedrooms: 1,
        bedroomSurchargeMinor: 10_000,
        taxBasisPoints: 0,
        effectiveFrom: '2026-11-05T00:00:00.000Z',
        developmentOnly: true,
        reason: 'Must overlap and fail'
      });
    expect(overlappingPrice.status).to.equal(409);
    expect(overlappingPrice.body.error.code).to.equal('PRICE_EFFECTIVE_RANGE_OVERLAP');

    const zone = await request(app)
      .post('/api/v1/service-zones')
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({
        code: 'development-accra-north',
        name: 'DEVELOPMENT Accra North',
        region: 'Greater Accra',
        localities: ['Oyarifa', 'Adenta'],
        serviceIds: [serviceId],
        status: 'active',
        developmentOnly: true
      });
    expect(zone.status).to.equal(201);

    for (const dayOfWeek of [4, 5]) {
      const hours = await request(app)
        .post('/api/v1/business-hours')
        .set('Authorization', `Bearer ${ownerAccess}`)
        .send({
          dayOfWeek,
          opensAt: '08:00',
          closesAt: '18:00',
          effectiveFrom: '2026-11-01',
          effectiveTo: '2027-01-01',
          developmentOnly: true
        });
      expect(hours.status).to.equal(201);
      expect(hours.body.data.timeZone).to.equal('Africa/Accra');
    }

    for (const slot of [
      { startsAt: '2026-11-05T09:00:00.000Z', endsAt: '2026-11-05T11:00:00.000Z' },
      { startsAt: '2026-11-05T17:00:00.000Z', endsAt: '2026-11-05T19:00:00.000Z' },
      { startsAt: '2026-11-06T09:00:00.000Z', endsAt: '2026-11-06T11:00:00.000Z' }
    ]) {
      const capacity = await request(app)
        .post('/api/v1/capacity-slots')
        .set('Authorization', `Bearer ${ownerAccess}`)
        .send({
          serviceId,
          ...slot,
          capacityTotal: 2,
          status: 'active',
          developmentOnly: true
        });
      expect(capacity.status).to.equal(201);
    }

    const policies = [
      {
        policyType: 'cancellation',
        title: 'DEVELOPMENT cancellation policy',
        rules: { noticeHours: 24, refundBasisPoints: 10_000, feeMinor: 0 }
      },
      {
        policyType: 'rescheduling',
        title: 'DEVELOPMENT rescheduling policy',
        rules: { noticeHours: 12, maximumChanges: 1 }
      },
      {
        policyType: 'reclean',
        title: 'DEVELOPMENT re-clean policy',
        rules: { claimWindowHours: 24, exclusions: ['customer-caused damage'] }
      },
      {
        policyType: 'recurring',
        title: 'DEVELOPMENT recurring service policy',
        rules: { paymentMode: 'per_occurrence_upfront', automaticBilling: false }
      }
    ];
    for (const policy of policies) {
      const result = await request(app)
        .post('/api/v1/policies')
        .set('Authorization', `Bearer ${ownerAccess}`)
        .send({
          ...policy,
          effectiveFrom: '2026-11-01T00:00:00.000Z',
          effectiveTo: '2027-01-01T00:00:00.000Z',
          developmentOnly: true
        });
      expect(result.status).to.equal(201);
    }
  });

  it('lists only active services and makes recurring billing semantics explicit', async () => {
    const response = await request(app).get('/api/v1/services');

    expect(response.status).to.equal(200);
    const service = response.body.data.find((item: { id: string }) => item.id === serviceId);
    expect(service).to.be.an('object');
    expect(response.body.data.some((item: { id: string }) => item.id === inactiveServiceId)).to.equal(
      false
    );
    expect(service.developmentOnly).to.equal(true);
    expect(service.recurrence).to.deep.include({
      mode: 'recurring',
      automaticBilling: false,
      paymentMode: 'per_occurrence_upfront'
    });
  });

  it('stores customer-owned addresses and conceals cross-customer access', async () => {
    const inside = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerAccess}`)
      .send({
        label: 'Home',
        addressLine1: '1 Development Street',
        locality: '  OYARIFA ',
        region: 'Greater   Accra'
      });
    expect(inside.status).to.equal(201);
    addressId = inside.body.data.id;

    const outside = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerAccess}`)
      .send({
        label: 'Outside',
        addressLine1: '2 Development Street',
        locality: 'Kumasi',
        region: 'Ashanti'
      });
    outOfZoneAddressId = outside.body.data.id;

    const crossCustomer = await request(app)
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${customerBAccess}`)
      .send({
        serviceId,
        addressId,
        startsAt: '2026-11-05T09:00:00.000Z',
        inputs: { bedrooms: 2 }
      });
    expect(crossCustomer.status).to.equal(404);
  });

  it('rejects inactive services, out-of-zone addresses, slot boundaries, and unavailable capacity', async () => {
    const inactive = await request(app)
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${customerAccess}`)
      .send({
        serviceId: inactiveServiceId,
        addressId,
        startsAt: '2026-11-05T09:00:00.000Z',
        inputs: { bedrooms: 2 }
      });
    expect(inactive.status).to.equal(409);
    expect(inactive.body.error.code).to.equal('SERVICE_UNAVAILABLE');

    const outside = await request(app)
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${customerAccess}`)
      .send({
        serviceId,
        addressId: outOfZoneAddressId,
        startsAt: '2026-11-05T09:00:00.000Z',
        inputs: { bedrooms: 2 }
      });
    expect(outside.status).to.equal(409);
    expect(outside.body.error.code).to.equal('ADDRESS_OUT_OF_ZONE');

    const boundary = await request(app)
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${customerAccess}`)
      .send({
        serviceId,
        addressId,
        startsAt: '2026-11-05T17:00:00.000Z',
        inputs: { bedrooms: 2 }
      });
    expect(boundary.status).to.equal(409);
    expect(boundary.body.error.code).to.equal('OUTSIDE_BUSINESS_HOURS');

    await database('capacity_slots')
      .where({ service_id: serviceId, starts_at: new Date('2026-11-05T09:00:00.000Z') })
      .update({ capacity_reserved: 2 });
    const full = await request(app)
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${customerAccess}`)
      .send({
        serviceId,
        addressId,
        startsAt: '2026-11-05T09:00:00.000Z',
        inputs: { bedrooms: 2 }
      });
    expect(full.status).to.equal(409);
    expect(full.body.error.code).to.equal('CAPACITY_UNAVAILABLE');
    await database('capacity_slots')
      .where({ service_id: serviceId, starts_at: new Date('2026-11-05T09:00:00.000Z') })
      .update({ capacity_reserved: 0 });
  });

  it('creates a server-calculated immutable quote with explicit tax and policy snapshots', async () => {
    const rejectedAmount = await request(app)
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${customerAccess}`)
      .send({
        serviceId,
        addressId,
        startsAt: '2026-11-05T09:00:00.000Z',
        inputs: { bedrooms: 2 },
        totalMinor: 1
      });
    expect(rejectedAmount.status).to.equal(400);

    const response = await request(app)
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${customerAccess}`)
      .send({
        serviceId,
        addressId,
        startsAt: '2026-11-05T09:00:00.000Z',
        inputs: { bedrooms: 2 }
      });
    expect(response.status, JSON.stringify(response.body)).to.equal(201);
    quoteId = response.body.data.id;
    expect(response.body.data).to.deep.include({
      currency: 'GHS',
      subtotalMinor: 55_000,
      totalMinor: 61_875,
      expired: false,
      bookable: true,
      recurringBillingCreated: false
    });
    expect(response.body.data.tax).to.deep.equal({ basisPoints: 1_250, amountMinor: 6_875 });
    expect(response.body.data.startsAtBusinessTime).to.equal(
      '2026-11-05T09:00:00[Africa/Accra]'
    );
    expect(response.body.data.expiresAt).to.equal('2026-11-04T08:15:00.000Z');
    expect(response.body.data.pricing.priceVersionId).to.equal(firstPriceVersionId);
    expect(response.body.data.policies.recurring.rules).to.deep.equal({
      paymentMode: 'per_occurrence_upfront',
      automaticBilling: false
    });

    let mutationRejected = false;
    try {
      await database('quotes').where({ id: quoteId }).update({ total_minor: 1 });
    } catch {
      mutationRejected = true;
    }
    expect(mutationRejected).to.equal(true);
  });

  it('uses later price versions without changing an existing quote snapshot', async () => {
    const nextPrice = await request(app)
      .post(`/api/v1/services/${serviceId}/price-versions`)
      .set('Authorization', `Bearer ${ownerAccess}`)
      .send({
        baseAmountMinor: 60_000,
        includedBedrooms: 1,
        bedroomSurchargeMinor: 10_000,
        taxBasisPoints: 0,
        effectiveFrom: '2026-11-06T00:00:00.000Z',
        developmentOnly: true,
        reason: 'Scheduled development price change'
      });
    expect(nextPrice.status).to.equal(201);
    expect(nextPrice.body.data.version).to.equal(2);

    const newer = await request(app)
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${customerAccess}`)
      .send({
        serviceId,
        addressId,
        startsAt: '2026-11-06T09:00:00.000Z',
        inputs: { bedrooms: 2 }
      });
    expect(newer.status).to.equal(201);
    expect(newer.body.data.totalMinor).to.equal(70_000);
    expect(newer.body.data.pricing.version).to.equal(2);

    const storedFirst = await database('quotes').where({ id: quoteId }).first();
    expect(Number(storedFirst.total_minor)).to.equal(61_875);
    expect(storedFirst.price_version_id).to.equal(firstPriceVersionId);
  });

  it('derives quote expiry from the server clock and audits price edits', async () => {
    now = new Date('2026-11-04T08:16:00.000Z');
    const expired = await request(app)
      .get(`/api/v1/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${customerAccess}`);
    expect(expired.status).to.equal(200);
    expect(expired.body.data.expired).to.equal(true);
    expect(expired.body.data.bookable).to.equal(false);

    const priceAudits = await database('audit_events')
      .where({ action: 'catalogue.price_version_created' })
      .whereIn('entity_id', [firstPriceVersionId]);
    expect(priceAudits).to.have.length(1);
    expect(priceAudits[0].actor_user_id).to.equal(ownerId);
    expect(String(priceAudits[0].reason)).to.equal('M03 development fixture price');
  });
});
