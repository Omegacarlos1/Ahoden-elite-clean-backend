import type { Knex } from 'knex';

export type DatabaseExecutor = Knex | Knex.Transaction;

export interface ServiceRow {
  id: string;
  code: string;
  name: string;
  description: string;
  duration_minutes: number;
  status: 'draft' | 'active' | 'inactive';
  development_only: number | boolean;
  recurrence_mode: 'one_time' | 'recurring';
  recurrence_unit: 'week' | 'month' | null;
  recurrence_interval: number | null;
  approval_reference: string | null;
}

export interface PriceVersionRow {
  id: string;
  service_id: string;
  version: number;
  currency: 'GHS';
  base_amount_minor: string | number;
  included_bedrooms: number;
  bedroom_surcharge_minor: string | number;
  tax_basis_points: number;
  effective_from: Date;
  effective_to: Date | null;
  development_only: number | boolean;
  approval_reference: string | null;
}

export interface AddressRow {
  id: string;
  customer_user_id: string;
  label: string;
  address_line1: string;
  address_line2: string | null;
  locality: string;
  locality_normalized: string;
  region: string;
  region_normalized: string;
  postal_code: string | null;
}

export interface CapacitySlotRow {
  id: string;
  service_id: string;
  starts_at: Date;
  ends_at: Date;
  capacity_total: number;
  capacity_reserved: number;
  status: 'active' | 'inactive';
  development_only: number | boolean;
}

export interface BusinessHourRow {
  id: string;
  day_of_week: number;
  opens_minute: number;
  closes_minute: number;
  development_only: number | boolean;
}

export interface PolicyVersionRow {
  id: string;
  policy_type: 'cancellation' | 'rescheduling' | 'reclean' | 'recurring';
  version: number;
  title: string;
  rules_json: unknown;
  effective_from: Date;
  effective_to: Date | null;
  development_only: number | boolean;
  approval_reference: string | null;
}

export interface QuoteRow {
  id: string;
  customer_user_id: string;
  service_id: string;
  address_id: string;
  price_version_id: string;
  starts_at: Date;
  expires_at: Date;
  currency: 'GHS';
  subtotal_minor: string | number;
  tax_basis_points: number;
  tax_minor: string | number;
  total_minor: string | number;
  inputs_snapshot: unknown;
  service_snapshot: unknown;
  address_snapshot: unknown;
  pricing_snapshot: unknown;
  policy_snapshot: unknown;
  created_at: Date;
}

function applyProductionFilter<T extends Knex.QueryBuilder>(query: T, production: boolean): T {
  if (production) query.where('development_only', false);
  return query;
}

export class CatalogueRepository {
  public constructor(private readonly database: Knex) {}

  public transaction<T>(callback: (transaction: Knex.Transaction) => Promise<T>): Promise<T> {
    return this.database.transaction(callback);
  }

  public listActiveServices(production: boolean): Promise<ServiceRow[]> {
    return applyProductionFilter(
      this.database<ServiceRow>('services').where({ status: 'active' }).orderBy('name'),
      production
    );
  }

  public serviceById(executor: DatabaseExecutor, id: string, lock = false) {
    let query = executor<ServiceRow>('services').where({ id });
    if (lock) query = query.forUpdate();
    return query.first();
  }

  public activePrice(
    executor: DatabaseExecutor,
    serviceId: string,
    at: Date,
    production: boolean,
    lock = false
  ) {
    let query = executor<PriceVersionRow>('service_price_versions')
      .where({ service_id: serviceId, currency: 'GHS' })
      .where('effective_from', '<=', at)
      .where((builder) => {
        builder.whereNull('effective_to').orWhere('effective_to', '>', at);
      })
      .orderBy('version', 'desc');
    if (production) query = query.where({ development_only: false });
    if (lock) query = query.forUpdate();
    return query.first();
  }

  public addressById(executor: DatabaseExecutor, id: string, customerId: string) {
    return executor<AddressRow>('customer_addresses')
      .where({ id, customer_user_id: customerId })
      .first();
  }

  public listAddresses(customerId: string): Promise<AddressRow[]> {
    return this.database<AddressRow>('customer_addresses')
      .where({ customer_user_id: customerId })
      .orderBy('created_at', 'desc');
  }

  public async addressIsInServiceZone(
    executor: DatabaseExecutor,
    serviceId: string,
    address: AddressRow,
    production: boolean
  ): Promise<boolean> {
    let query = executor('service_zone_assignments as assignment')
      .join('service_zones as zone', 'zone.id', 'assignment.zone_id')
      .join('service_zone_localities as locality', 'locality.zone_id', 'zone.id')
      .where('assignment.service_id', serviceId)
      .where('zone.status', 'active')
      .where('zone.region_normalized', address.region_normalized)
      .where('locality.locality_normalized', address.locality_normalized);
    if (production) query = query.where('zone.development_only', false);
    return (await query.first('zone.id')) !== undefined;
  }

  public businessHours(
    executor: DatabaseExecutor,
    dayOfWeek: number,
    localDate: string,
    production: boolean
  ): Promise<BusinessHourRow[]> {
    let query = executor<BusinessHourRow>('business_hours')
      .where({ day_of_week: dayOfWeek })
      .where('effective_from', '<=', localDate)
      .where((builder) => {
        builder.whereNull('effective_to').orWhere('effective_to', '>=', localDate);
      })
      .orderBy('opens_minute');
    if (production) query = query.where({ development_only: false });
    return query;
  }

  public capacitySlot(
    executor: DatabaseExecutor,
    serviceId: string,
    startsAt: Date,
    production: boolean,
    lock = false
  ) {
    let query = executor<CapacitySlotRow>('capacity_slots').where({
      service_id: serviceId,
      starts_at: startsAt,
      status: 'active'
    });
    if (production) query = query.where({ development_only: false });
    if (lock) query = query.forUpdate();
    return query.first();
  }

  public policies(
    executor: DatabaseExecutor,
    at: Date,
    production: boolean,
    lock = false
  ): Promise<PolicyVersionRow[]> {
    let query = executor<PolicyVersionRow>('policy_versions')
      .where('effective_from', '<=', at)
      .where((builder) => {
        builder.whereNull('effective_to').orWhere('effective_to', '>', at);
      })
      .orderBy([{ column: 'policy_type', order: 'asc' }, { column: 'version', order: 'desc' }]);
    if (production) query = query.where({ development_only: false });
    if (lock) query = query.forUpdate();
    return query;
  }

  public quoteById(id: string, customerId: string) {
    return this.database<QuoteRow>('quotes').where({ id, customer_user_id: customerId }).first();
  }
}

export function parseJsonValue<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}
