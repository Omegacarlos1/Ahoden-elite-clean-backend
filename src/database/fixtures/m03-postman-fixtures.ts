import type { Knex } from 'knex';

export const M03_POSTMAN_SERVICE_ID = '40000000-0000-4000-8000-000000000010';
export const M03_POSTMAN_STARTS_AT = '2099-01-02T09:00:00.000Z';

export async function seedM03PostmanFixtures(transaction: Knex.Transaction): Promise<void> {
  const fixtureOwnerId = '40000000-0000-4000-8000-000000000001';
  await transaction('users')
    .insert({
      id: fixtureOwnerId,
      email: 'm03-fixture-owner@example.test',
      display_name: 'M03 Disabled Fixture Owner',
      password_hash: 'disabled-test-fixture-no-login',
      role: 'owner',
      status: 'disabled'
    })
    .onConflict('id')
    .ignore();
  await transaction('services')
    .insert({
      id: M03_POSTMAN_SERVICE_ID,
      code: 'development-postman-home-clean',
      name: 'DEVELOPMENT Postman Home Clean',
      description: 'Conspicuously labelled nonproduction Postman smoke-test service.',
      duration_minutes: 120,
      status: 'active',
      development_only: true,
      recurrence_mode: 'one_time',
      created_by: fixtureOwnerId
    })
    .onConflict('id')
    .ignore();
  await transaction('service_price_versions')
    .insert({
      id: '40000000-0000-4000-8000-000000000011',
      service_id: M03_POSTMAN_SERVICE_ID,
      version: 1,
      currency: 'GHS',
      base_amount_minor: 45_000,
      included_bedrooms: 1,
      bedroom_surcharge_minor: 10_000,
      tax_basis_points: 0,
      effective_from: new Date('2026-01-01T00:00:00.000Z'),
      development_only: true,
      approved_by: fixtureOwnerId
    })
    .onConflict('id')
    .ignore();
  await transaction('service_zones')
    .insert({
      id: '40000000-0000-4000-8000-000000000012',
      code: 'development-postman-oyarifa',
      name: 'DEVELOPMENT Postman Oyarifa',
      region: 'Greater Accra',
      region_normalized: 'greater accra',
      status: 'active',
      development_only: true,
      created_by: fixtureOwnerId
    })
    .onConflict('id')
    .ignore();
  await transaction('service_zone_localities')
    .insert({
      zone_id: '40000000-0000-4000-8000-000000000012',
      locality: 'Oyarifa',
      locality_normalized: 'oyarifa'
    })
    .onConflict(['zone_id', 'locality_normalized'])
    .ignore();
  await transaction('service_zone_assignments')
    .insert({
      service_id: M03_POSTMAN_SERVICE_ID,
      zone_id: '40000000-0000-4000-8000-000000000012',
      assigned_by: fixtureOwnerId
    })
    .onConflict(['service_id', 'zone_id'])
    .ignore();
  await transaction('business_hours')
    .insert({
      id: '40000000-0000-4000-8000-000000000013',
      day_of_week: 5,
      opens_minute: 480,
      closes_minute: 1080,
      effective_from: '2098-01-01',
      development_only: true,
      approved_by: fixtureOwnerId
    })
    .onConflict('id')
    .ignore();
  await transaction('capacity_slots')
    .insert({
      id: '40000000-0000-4000-8000-000000000014',
      service_id: M03_POSTMAN_SERVICE_ID,
      starts_at: new Date(M03_POSTMAN_STARTS_AT),
      ends_at: new Date('2099-01-02T11:00:00.000Z'),
      capacity_total: 2,
      status: 'active',
      development_only: true,
      created_by: fixtureOwnerId
    })
    .onConflict('id')
    .ignore();
  await transaction('policy_versions')
    .insert([
      {
        id: '40000000-0000-4000-8000-000000000020',
        policy_type: 'cancellation',
        version: 1,
        title: 'DEVELOPMENT Postman cancellation',
        rules_json: JSON.stringify({ noticeHours: 24, refundBasisPoints: 10_000, feeMinor: 0 }),
        effective_from: new Date('2098-01-01T00:00:00.000Z'),
        development_only: true,
        approved_by: fixtureOwnerId
      },
      {
        id: '40000000-0000-4000-8000-000000000021',
        policy_type: 'rescheduling',
        version: 1,
        title: 'DEVELOPMENT Postman rescheduling',
        rules_json: JSON.stringify({ noticeHours: 12, maximumChanges: 1 }),
        effective_from: new Date('2098-01-01T00:00:00.000Z'),
        development_only: true,
        approved_by: fixtureOwnerId
      },
      {
        id: '40000000-0000-4000-8000-000000000022',
        policy_type: 'reclean',
        version: 1,
        title: 'DEVELOPMENT Postman re-clean',
        rules_json: JSON.stringify({ claimWindowHours: 24, exclusions: [] }),
        effective_from: new Date('2098-01-01T00:00:00.000Z'),
        development_only: true,
        approved_by: fixtureOwnerId
      }
    ])
    .onConflict('id')
    .ignore();
}
