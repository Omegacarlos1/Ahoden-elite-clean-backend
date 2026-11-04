import { expect } from 'chai';
import type { Knex } from 'knex';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { loadEnvironment } from '../../src/config/environment.js';
import { createDatabase, createDatabaseProbe } from '../../src/database/connection.js';
import { M03_POSTMAN_SERVICE_ID } from '../../src/database/fixtures/m03-postman-fixtures.js';
import { createLogger } from '../../src/logging/logger.js';
import { createBookingsRouter } from '../../src/modules/bookings/bookings.routes.js';
import {
  BookingsService,
  type BookingClock
} from '../../src/modules/bookings/bookings.service.js';
import { signToken } from '../../src/security/auth-crypto.js';

describe('bookings, scheduling, and job assignment integration', () => {
  const environment = loadEnvironment();
  const fixtureOwnerId = '40000000-0000-4000-8000-000000000001';
  const priceVersionId = '40000000-0000-4000-8000-000000000011';
  const customerIds = [
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000005'
  ];
  const managerId = '71000000-0000-4000-8000-000000000010';
  const cleanerIds = [
    '71000000-0000-4000-8000-000000000011',
    '71000000-0000-4000-8000-000000000012',
    '71000000-0000-4000-8000-000000000013'
  ];
  const addressIds = new Map<string, string>();
  const customerTokens = new Map<string, string>();
  let database: Knex;
  let app: ReturnType<typeof createApp>;
  let now = new Date('2098-01-01T00:00:00.000Z');
  let sequence = 100;
  let managerToken = '';
  const cleanerTokens = new Map<string, string>();
  let firstBookingId = '';
  let firstJobId = '';

  const clock: BookingClock = { now: () => new Date(now) };
  const nextId = (): string =>
    `72000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`;

  function token(userId: string, role: 'customer' | 'cleaner' | 'manager'): string {
    return signToken(
      { sub: userId, role, purpose: 'access' },
      environment.accessTokenSecret,
      3600
    );
  }

  async function addSlot(startsAt: string, capacityTotal = 1): Promise<string> {
    const id = nextId();
    const start = new Date(startsAt);
    await database('capacity_slots').insert({
      id,
      service_id: M03_POSTMAN_SERVICE_ID,
      starts_at: start,
      ends_at: new Date(start.getTime() + 120 * 60_000),
      capacity_total: capacityTotal,
      capacity_reserved: 0,
      status: 'active',
      development_only: true,
      created_by: fixtureOwnerId
    });
    return id;
  }

  async function addQuote(
    customerId: string,
    slotId: string,
    expiresAt = '2098-01-02T00:00:00.000Z'
  ): Promise<string> {
    const slot = await database<{ id: string; starts_at: Date }>('capacity_slots')
      .where({ id: slotId })
      .first();
    const quoteId = nextId();
    const addressId = addressIds.get(customerId)!;
    await database('quotes').insert({
      id: quoteId,
      customer_user_id: customerId,
      service_id: M03_POSTMAN_SERVICE_ID,
      address_id: addressId,
      price_version_id: priceVersionId,
      starts_at: slot!.starts_at,
      expires_at: new Date(expiresAt),
      currency: 'GHS',
      subtotal_minor: 55_000,
      tax_basis_points: 0,
      tax_minor: 0,
      total_minor: 55_000,
      inputs_snapshot: JSON.stringify({ bedrooms: 2 }),
      service_snapshot: JSON.stringify({
        id: M03_POSTMAN_SERVICE_ID,
        name: 'DEVELOPMENT M04 Home Clean',
        durationMinutes: 120,
        recurrence: { mode: 'one_time', automaticBilling: false }
      }),
      address_snapshot: JSON.stringify({
        id: addressId,
        label: 'M04 Home',
        addressLine1: '1 Development Street',
        locality: 'Oyarifa',
        region: 'Greater Accra'
      }),
      pricing_snapshot: JSON.stringify({ priceVersionId, currency: 'GHS' }),
      policy_snapshot: JSON.stringify({
        cancellation: { id: nextId(), rules: { noticeHours: 0, refundBasisPoints: 10_000, feeMinor: 0 } },
        rescheduling: { id: nextId(), rules: { noticeHours: 0, maximumChanges: 1 } },
        reclean: { id: nextId(), rules: { claimWindowHours: 24, exclusions: [] } }
      })
    });
    return quoteId;
  }

  async function createBooking(
    customerId: string,
    quoteId: string,
    key: string
  ) {
    return request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customerTokens.get(customerId)}`)
      .set('Idempotency-Key', key)
      .send({ quoteId });
  }

  async function addPaidJob(customerId: string, startsAt: string) {
    const slotId = await addSlot(startsAt);
    const quoteId = await addQuote(customerId, slotId);
    const bookingId = nextId();
    const reservationId = nextId();
    const jobId = nextId();
    const start = new Date(startsAt);
    const end = new Date(start.getTime() + 120 * 60_000);
    await database.transaction(async (transaction) => {
      await transaction('bookings').insert({
        id: bookingId,
        customer_user_id: customerId,
        initial_quote_id: quoteId,
        current_quote_id: quoteId,
        capacity_slot_id: slotId,
        booking_status: 'confirmed',
        payment_status: 'paid',
        reservation_expires_at: null,
        starts_at: start
      });
      await transaction('booking_quote_uses').insert({
        booking_id: bookingId,
        quote_id: quoteId,
        use_type: 'initial'
      });
      await transaction('capacity_reservations').insert({
        id: reservationId,
        booking_id: bookingId,
        capacity_slot_id: slotId,
        state: 'confirmed',
        expires_at: null
      });
      await transaction('capacity_slots').where({ id: slotId }).update({ capacity_reserved: 1 });
      await transaction('jobs').insert({
        id: jobId,
        booking_id: bookingId,
        job_state: 'unassigned',
        starts_at: start,
        ends_at: end
      });
    });
    return { bookingId, jobId };
  }

  before(async () => {
    database = createDatabase(environment.databaseUrl);
    await database('users').insert([
      ...customerIds.map((id, index) => ({
        id,
        email: `m04-customer-${index + 1}@example.test`,
        display_name: `M04 Customer ${index + 1}`,
        password_hash: 'not-used-in-this-suite',
        role: 'customer',
        status: 'active'
      })),
      {
        id: managerId,
        email: 'm04-manager@example.test',
        display_name: 'M04 Manager',
        password_hash: 'not-used-in-this-suite',
        role: 'manager',
        status: 'active'
      },
      ...cleanerIds.map((id, index) => ({
        id,
        email: `m04-cleaner-${index + 1}@example.test`,
        display_name: `M04 Cleaner ${index + 1}`,
        password_hash: 'not-used-in-this-suite',
        role: 'cleaner',
        status: 'active'
      }))
    ]);
    for (const [index, customerId] of customerIds.entries()) {
      const addressId = nextId();
      addressIds.set(customerId, addressId);
      customerTokens.set(customerId, token(customerId, 'customer'));
      await database('customer_addresses').insert({
        id: addressId,
        customer_user_id: customerId,
        label: 'M04 Home',
        address_line1: `${index + 1} Development Street`,
        locality: 'Oyarifa',
        locality_normalized: 'oyarifa',
        region: 'Greater Accra',
        region_normalized: 'greater accra'
      });
    }
    managerToken = token(managerId, 'manager');
    for (const cleanerId of cleanerIds) cleanerTokens.set(cleanerId, token(cleanerId, 'cleaner'));
    const service = new BookingsService(database, environment, undefined, clock);
    app = createApp({
      environment,
      logger: createLogger('silent'),
      databaseProbe: createDatabaseProbe(database),
      apiRouter: createBookingsRouter(database, environment, { service })
    });
  });

  after(async () => database.destroy());

  it('converts a quote once, preserves idempotency, and keeps prepaid state pending', async () => {
    const slotId = await addSlot('2099-01-10T09:00:00.000Z', 2);
    const quoteId = await addQuote(customerIds[0]!, slotId);
    const otherQuoteId = await addQuote(customerIds[0]!, slotId);
    const key = 'm04-create-booking-001';

    const created = await createBooking(customerIds[0]!, quoteId, key);
    expect(created.status).to.equal(201);
    expect(created.body.data.status).to.equal('pending_payment');
    expect(created.body.data.paymentStatus).to.equal('pending');
    expect(created.body.data.job.state).to.equal('awaiting_payment');
    firstBookingId = created.body.data.id;
    firstJobId = created.body.data.job.id;

    const replay = await createBooking(customerIds[0]!, quoteId, key);
    expect(replay.status).to.equal(201);
    expect(replay.headers['idempotency-replayed']).to.equal('true');
    expect(replay.body.data.id).to.equal(firstBookingId);
    const reused = await createBooking(customerIds[0]!, otherQuoteId, key);
    expect(reused.status).to.equal(409);
    expect(reused.body.error.code).to.equal('IDEMPOTENCY_KEY_REUSED');
    const count = await database('bookings').where({ initial_quote_id: quoteId }).count<{ count: number }[]>({ count: '*' });
    expect(Number(count[0]?.count)).to.equal(1);
  });

  it('returns customer history and conceals cross-customer bookings', async () => {
    const history = await request(app)
      .get('/api/v1/bookings?page=1&pageSize=10')
      .set('Authorization', `Bearer ${customerTokens.get(customerIds[0]!)}`);
    expect(history.status).to.equal(200);
    const historyBody = history.body as {
      data: Array<{ id: string }>;
      meta: { total: number };
    };
    expect(historyBody.data.some((booking) => booking.id === firstBookingId)).to.equal(true);
    expect(historyBody.meta.total).to.be.greaterThan(0);

    const concealed = await request(app)
      .get(`/api/v1/bookings/${firstBookingId}`)
      .set('Authorization', `Bearer ${customerTokens.get(customerIds[1]!)}`);
    expect(concealed.status).to.equal(404);
  });

  it('replays concurrent duplicate keys without creating two bookings', async () => {
    const slotId = await addSlot('2099-01-10T15:00:00.000Z');
    const quoteId = await addQuote(customerIds[4]!, slotId);
    const key = 'm04-concurrent-idempotency-001';
    const responses = await Promise.all([
      createBooking(customerIds[4]!, quoteId, key),
      createBooking(customerIds[4]!, quoteId, key)
    ]);
    expect(responses.map((response) => response.status)).to.deep.equal([201, 201]);
    expect(responses[0].body.data.id).to.equal(responses[1].body.data.id);
    expect(responses.some((response) => response.headers['idempotency-replayed'] === 'true')).to.equal(
      true
    );
    const count = await database('bookings')
      .where({ initial_quote_id: quoteId })
      .count<{ count: number }[]>({ count: '*' });
    expect(Number(count[0]?.count)).to.equal(1);
  });

  it('rejects an expired quote with 409', async () => {
    const slotId = await addSlot('2099-01-10T12:00:00.000Z');
    const quoteId = await addQuote(customerIds[1]!, slotId, '2097-12-31T23:59:59.000Z');
    const response = await createBooking(customerIds[1]!, quoteId, 'm04-expired-quote-001');
    expect(response.status).to.equal(409);
    expect(response.body.error.code).to.equal('QUOTE_EXPIRED');
  });

  it('serializes concurrent bookings so capacity cannot be exceeded', async () => {
    const slotId = await addSlot('2099-01-11T09:00:00.000Z');
    const quoteA = await addQuote(customerIds[1]!, slotId);
    const quoteB = await addQuote(customerIds[2]!, slotId);
    const responses = await Promise.all([
      createBooking(customerIds[1]!, quoteA, 'm04-capacity-a-001'),
      createBooking(customerIds[2]!, quoteB, 'm04-capacity-b-001')
    ]);
    expect(responses.map((response) => response.status).sort()).to.deep.equal([201, 409]);
    const slot = await database<{ id: string; capacity_reserved: number }>('capacity_slots')
      .where({ id: slotId })
      .first();
    expect(slot?.capacity_reserved).to.equal(1);
  });

  it('expires unpaid reservations and releases capacity transactionally', async () => {
    const slotId = await addSlot('2099-01-12T09:00:00.000Z');
    const quoteA = await addQuote(customerIds[3]!, slotId, '2098-01-03T00:00:00.000Z');
    const quoteB = await addQuote(customerIds[4]!, slotId, '2098-01-03T00:00:00.000Z');
    const held = await createBooking(customerIds[3]!, quoteA, 'm04-expiry-a-001');
    expect(held.status).to.equal(201);
    now = new Date('2098-01-01T00:16:00.000Z');
    const replacement = await createBooking(customerIds[4]!, quoteB, 'm04-expiry-b-001');
    expect(replacement.status).to.equal(201);
    const heldBookingId = String((held.body as { data: { id: string } }).data.id);
    const expired = await database<{ id: string; booking_status: string }>('bookings')
      .where({ id: heldBookingId })
      .first();
    expect(expired?.booking_status).to.equal('expired');
    const slot = await database<{ id: string; capacity_reserved: number }>('capacity_slots')
      .where({ id: slotId })
      .first();
    expect(slot?.capacity_reserved).to.equal(1);
    now = new Date('2098-01-01T00:00:00.000Z');
  });

  it('applies snapshotted cancellation rules, releases capacity, and audits cancellation', async () => {
    const slotId = await addSlot('2099-01-13T09:00:00.000Z');
    const quoteId = await addQuote(customerIds[0]!, slotId);
    const created = await createBooking(customerIds[0]!, quoteId, 'm04-cancel-create-001');
    const cancelled = await request(app)
      .post(`/api/v1/bookings/${created.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${customerTokens.get(customerIds[0]!)}`)
      .send({ reason: 'Customer schedule changed' });
    expect(cancelled.status).to.equal(200);
    expect(cancelled.body.data.status).to.equal('cancelled');
    const slot = await database<{ id: string; capacity_reserved: number }>('capacity_slots')
      .where({ id: slotId })
      .first();
    expect(slot?.capacity_reserved).to.equal(0);
  });

  it('reschedules atomically, enforces the policy limit, and protects concurrent target capacity', async () => {
    const sourceSlot = await addSlot('2099-01-14T09:00:00.000Z');
    const targetSlot = await addSlot('2099-01-15T09:00:00.000Z');
    const sourceQuote = await addQuote(customerIds[0]!, sourceSlot);
    const targetQuote = await addQuote(customerIds[0]!, targetSlot);
    const booking = await createBooking(customerIds[0]!, sourceQuote, 'm04-reschedule-create-001');
    const moved = await request(app)
      .post(`/api/v1/bookings/${booking.body.data.id}/reschedule`)
      .set('Authorization', `Bearer ${customerTokens.get(customerIds[0]!)}`)
      .send({ quoteId: targetQuote, reason: 'Customer selected a new day' });
    expect(moved.status).to.equal(200);
    expect(moved.body.data.quoteId).to.equal(targetQuote);
    expect(moved.body.data.rescheduleCount).to.equal(1);

    const thirdSlot = await addSlot('2099-01-16T09:00:00.000Z');
    const thirdQuote = await addQuote(customerIds[0]!, thirdSlot);
    const limited = await request(app)
      .post(`/api/v1/bookings/${booking.body.data.id}/reschedule`)
      .set('Authorization', `Bearer ${customerTokens.get(customerIds[0]!)}`)
      .send({ quoteId: thirdQuote, reason: 'Second change must be rejected' });
    expect(limited.status).to.equal(409);
    expect(limited.body.error.code).to.equal('RESCHEDULE_LIMIT_REACHED');

    const sourceA = await addSlot('2099-01-17T09:00:00.000Z');
    const sourceB = await addSlot('2099-01-18T09:00:00.000Z');
    const sharedTarget = await addSlot('2099-01-19T09:00:00.000Z');
    const bookingA = await createBooking(
      customerIds[1]!,
      await addQuote(customerIds[1]!, sourceA),
      'm04-concurrent-reschedule-a-create'
    );
    const bookingB = await createBooking(
      customerIds[2]!,
      await addQuote(customerIds[2]!, sourceB),
      'm04-concurrent-reschedule-b-create'
    );
    const targetA = await addQuote(customerIds[1]!, sharedTarget);
    const targetB = await addQuote(customerIds[2]!, sharedTarget);
    const responses = await Promise.all([
      request(app)
        .post(`/api/v1/bookings/${bookingA.body.data.id}/reschedule`)
        .set('Authorization', `Bearer ${customerTokens.get(customerIds[1]!)}`)
        .send({ quoteId: targetA, reason: 'Concurrent target A' }),
      request(app)
        .post(`/api/v1/bookings/${bookingB.body.data.id}/reschedule`)
        .set('Authorization', `Bearer ${customerTokens.get(customerIds[2]!)}`)
        .send({ quoteId: targetB, reason: 'Concurrent target B' })
    ]);
    expect(responses.map((response) => response.status).sort()).to.deep.equal([200, 409]);
  });

  it('blocks assignment and dispatch while prepaid payment remains pending', async () => {
    const response = await request(app)
      .post(`/api/v1/jobs/${firstJobId}/assignments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .set('Idempotency-Key', 'm04-unpaid-assignment-001')
      .send({ cleanerIds: [cleanerIds[0]] });
    expect(response.status).to.equal(409);
    expect(response.body.error.code).to.equal('PAYMENT_REQUIRED');
  });

  it('enforces cleaner availability, assignment ownership, reassignment versioning, and audits changes', async () => {
    for (const [index, cleanerId] of cleanerIds.entries()) {
      const availability = await request(app)
        .post(`/api/v1/cleaners/${cleanerId}/availability`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          startsAt: '2099-03-01T00:00:00.000Z',
          endsAt: '2099-03-02T00:00:00.000Z',
          status: 'available',
          reason: `M04 cleaner ${index + 1} test availability`
        });
      expect(availability.status).to.equal(201);
    }
    const paid = await addPaidJob(customerIds[0]!, '2099-03-01T09:00:00.000Z');
    const assigned = await request(app)
      .post(`/api/v1/jobs/${paid.jobId}/assignments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .set('Idempotency-Key', 'm04-paid-assignment-001')
      .send({ cleanerIds: [cleanerIds[0]] });
    expect(assigned.status).to.equal(201);
    expect(assigned.body.data.state).to.equal('assigned');
    expect(assigned.body.data.version).to.equal(1);

    const replay = await request(app)
      .post(`/api/v1/jobs/${paid.jobId}/assignments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .set('Idempotency-Key', 'm04-paid-assignment-001')
      .send({ cleanerIds: [cleanerIds[0]] });
    expect(replay.status).to.equal(201);
    expect(replay.headers['idempotency-replayed']).to.equal('true');

    const missingVersion = await request(app)
      .post(`/api/v1/jobs/${paid.jobId}/assignments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .set('Idempotency-Key', 'm04-reassignment-missing-version')
      .send({ cleanerIds: [cleanerIds[2]], reason: 'Operational reassignment' });
    expect(missingVersion.status).to.equal(409);
    expect(missingVersion.body.error.code).to.equal('ASSIGNMENT_VERSION_REQUIRED');

    const reassigned = await request(app)
      .post(`/api/v1/jobs/${paid.jobId}/assignments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .set('Idempotency-Key', 'm04-reassignment-001')
      .send({
        cleanerIds: [cleanerIds[2]],
        expectedVersion: 1,
        reason: 'Operational reassignment'
      });
    expect(reassigned.status).to.equal(201);
    expect(reassigned.body.data.version).to.equal(2);

    const concealed = await request(app)
      .get(`/api/v1/jobs/${paid.jobId}`)
      .set('Authorization', `Bearer ${cleanerTokens.get(cleanerIds[0]!)}`);
    expect(concealed.status).to.equal(404);
    const owned = await request(app)
      .get(`/api/v1/jobs/${paid.jobId}`)
      .set('Authorization', `Bearer ${cleanerTokens.get(cleanerIds[2]!)}`);
    expect(owned.status).to.equal(200);
  });

  it('serializes overlapping cleaner assignment and rejects invalid or stale job transitions', async () => {
    const paidA = await addPaidJob(customerIds[1]!, '2099-03-01T10:00:00.000Z');
    const paidB = await addPaidJob(customerIds[2]!, '2099-03-01T10:30:00.000Z');
    const assignments = await Promise.all([
      request(app)
        .post(`/api/v1/jobs/${paidA.jobId}/assignments`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('Idempotency-Key', 'm04-concurrent-assignment-a')
        .send({ cleanerIds: [cleanerIds[1]] }),
      request(app)
        .post(`/api/v1/jobs/${paidB.jobId}/assignments`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('Idempotency-Key', 'm04-concurrent-assignment-b')
        .send({ cleanerIds: [cleanerIds[1]] })
    ]);
    expect(assignments.map((response) => response.status).sort()).to.deep.equal([201, 409]);

    const paid = await addPaidJob(customerIds[3]!, '2099-03-01T14:00:00.000Z');
    const assigned = await request(app)
      .post(`/api/v1/jobs/${paid.jobId}/assignments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .set('Idempotency-Key', 'm04-transition-assignment')
      .send({ cleanerIds: [cleanerIds[0]] });
    expect(assigned.status).to.equal(201);
    const cleanerToken = cleanerTokens.get(cleanerIds[0]!)!;
    const invalid = await request(app)
      .patch(`/api/v1/jobs/${paid.jobId}/status`)
      .set('Authorization', `Bearer ${cleanerToken}`)
      .send({ state: 'started', expectedVersion: 1 });
    expect(invalid.status).to.equal(409);
    expect(invalid.body.error.code).to.equal('INVALID_JOB_TRANSITION');

    const enRoute = await request(app)
      .patch(`/api/v1/jobs/${paid.jobId}/status`)
      .set('Authorization', `Bearer ${cleanerToken}`)
      .send({ state: 'en_route', expectedVersion: 1 });
    expect(enRoute.status).to.equal(200);
    const concurrent = await Promise.all([
      request(app)
        .patch(`/api/v1/jobs/${paid.jobId}/status`)
        .set('Authorization', `Bearer ${cleanerToken}`)
        .send({ state: 'started', expectedVersion: 2 }),
      request(app)
        .patch(`/api/v1/jobs/${paid.jobId}/status`)
        .set('Authorization', `Bearer ${cleanerToken}`)
        .send({ state: 'started', expectedVersion: 2 })
    ]);
    expect(concurrent.map((response) => response.status).sort()).to.deep.equal([200, 409]);
    expect(concurrent.find((response) => response.status === 409)?.body.error.code).to.equal(
      'JOB_VERSION_CONFLICT'
    );
    const completed = await request(app)
      .patch(`/api/v1/jobs/${paid.jobId}/status`)
      .set('Authorization', `Bearer ${cleanerToken}`)
      .send({ state: 'completed', expectedVersion: 3 });
    expect(completed.status).to.equal(200);
    expect(completed.body.data.state).to.equal('completed');
  });

  it('records cancellation and reassignment in the protected audit log', async () => {
    const actions = await database('audit_events')
      .whereIn('action', ['booking.cancelled', 'job.reassigned'])
      .select('action');
    expect(actions.map((row: { action: string }) => row.action)).to.include.members([
      'booking.cancelled',
      'job.reassigned'
    ]);
  });
});
