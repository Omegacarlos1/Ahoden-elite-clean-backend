import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { Knex } from 'knex';

import type { Environment } from '../../config/environment.js';
import { appendAuditEvent } from '../../database/audit.js';
import { AppError } from '../../http/errors.js';
import type { AuthenticatedUser } from '../../security/authentication.js';
import {
  CatalogueRepository,
  parseJsonValue,
  type AddressRow,
  type PolicyVersionRow,
  type PriceVersionRow,
  type QuoteRow,
  type ServiceRow
} from './catalogue.repository.js';

export interface CreateServiceInput {
  code: string;
  name: string;
  description: string;
  durationMinutes: number;
  status: 'draft' | 'active' | 'inactive';
  developmentOnly: boolean;
  approvalReference?: string | undefined;
  recurrence:
    | { mode: 'one_time' }
    | { mode: 'recurring'; unit: 'week' | 'month'; interval: number };
}

export interface CreatePriceVersionInput {
  baseAmountMinor: number;
  includedBedrooms: number;
  bedroomSurchargeMinor: number;
  taxBasisPoints: number;
  effectiveFrom: Date;
  effectiveTo?: Date | undefined;
  developmentOnly: boolean;
  approvalReference?: string | undefined;
  reason: string;
}

export interface CreateZoneInput {
  code: string;
  name: string;
  region: string;
  localities: string[];
  serviceIds: string[];
  status: 'active' | 'inactive';
  developmentOnly: boolean;
  approvalReference?: string | undefined;
}

export interface CreateBusinessHoursInput {
  dayOfWeek: number;
  opensMinute: number;
  closesMinute: number;
  effectiveFrom: string;
  effectiveTo?: string | undefined;
  developmentOnly: boolean;
  approvalReference?: string | undefined;
}

export interface CreateCapacitySlotInput {
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  capacityTotal: number;
  status: 'active' | 'inactive';
  developmentOnly: boolean;
  approvalReference?: string | undefined;
}

export type PolicyType = 'cancellation' | 'rescheduling' | 'reclean' | 'recurring';

export interface CreatePolicyInput {
  policyType: PolicyType;
  title: string;
  rules: Record<string, unknown>;
  effectiveFrom: Date;
  effectiveTo?: Date | undefined;
  developmentOnly: boolean;
  approvalReference?: string | undefined;
}

export interface CreateAddressInput {
  label: string;
  addressLine1: string;
  addressLine2?: string | undefined;
  locality: string;
  region: string;
  postalCode?: string | undefined;
}

export interface QuoteAmounts {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface CatalogueClock {
  now(): Date;
}

const systemClock: CatalogueClock = { now: () => new Date() };
const ACCRA_TIME_ZONE = 'Africa/Accra';
const REQUIRED_POLICY_TYPES: PolicyType[] = ['cancellation', 'rescheduling', 'reclean'];

function normalizeLocation(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GH');
}

function booleanValue(value: number | boolean): boolean {
  return value === true || value === 1;
}

function numberValue(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new AppError(500, 'INVALID_STORED_AMOUNT', 'A stored price is outside the supported range.');
  }
  return parsed;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(`${value.replace(' ', 'T')}Z`);
}

export function calculateQuoteAmounts(
  price: Pick<
    PriceVersionRow,
    | 'base_amount_minor'
    | 'included_bedrooms'
    | 'bedroom_surcharge_minor'
    | 'tax_basis_points'
  >,
  bedrooms: number
): QuoteAmounts {
  const base = BigInt(numberValue(price.base_amount_minor));
  const surcharge = BigInt(numberValue(price.bedroom_surcharge_minor));
  const additionalBedrooms = BigInt(Math.max(0, bedrooms - price.included_bedrooms));
  const subtotal = base + surcharge * additionalBedrooms;
  const tax = (subtotal * BigInt(price.tax_basis_points) + 5_000n) / 10_000n;
  const total = subtotal + tax;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AppError(500, 'INVALID_STORED_AMOUNT', 'A stored price is outside the supported range.');
  }
  return {
    subtotalMinor: Number(subtotal),
    taxMinor: Number(tax),
    totalMinor: Number(total)
  };
}

export function accraBusinessParts(value: Date): {
  date: string;
  dayOfWeek: number;
  minuteOfDay: number;
  display: string;
} {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: ACCRA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(value).map((part) => [part.type, part.value])
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    String(parts.weekday)
  );
  const date = `${String(parts.year)}-${String(parts.month)}-${String(parts.day)}`;
  const time = `${String(parts.hour)}:${String(parts.minute)}`;
  return {
    date,
    dayOfWeek: weekday,
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
    display: `${date}T${time}:00[${ACCRA_TIME_ZONE}]`
  };
}

function publicService(service: ServiceRow, price?: PriceVersionRow) {
  return {
    id: service.id,
    code: service.code,
    name: service.name,
    description: service.description,
    durationMinutes: service.duration_minutes,
    developmentOnly: booleanValue(service.development_only),
    recurrence:
      service.recurrence_mode === 'one_time'
        ? { mode: 'one_time' as const, automaticBilling: false }
        : {
            mode: 'recurring' as const,
            unit: service.recurrence_unit,
            interval: service.recurrence_interval,
            automaticBilling: false,
            paymentMode: 'per_occurrence_upfront' as const
          },
    ...(price === undefined
      ? {}
      : {
          indicativePrice: {
            currency: 'GHS',
            baseAmountMinor: numberValue(price.base_amount_minor),
            taxBasisPoints: price.tax_basis_points,
            priceVersion: price.version,
            developmentOnly: booleanValue(price.development_only)
          }
        })
  };
}

function publicAddress(address: AddressRow) {
  return {
    id: address.id,
    label: address.label,
    addressLine1: address.address_line1,
    ...(address.address_line2 === null ? {} : { addressLine2: address.address_line2 }),
    locality: address.locality,
    region: address.region,
    ...(address.postal_code === null ? {} : { postalCode: address.postal_code })
  };
}

function selectedPolicies(rows: PolicyVersionRow[]): Map<PolicyType, PolicyVersionRow> {
  const result = new Map<PolicyType, PolicyVersionRow>();
  for (const row of rows) {
    if (!result.has(row.policy_type)) result.set(row.policy_type, row);
  }
  return result;
}

export class CatalogueService {
  private readonly production: boolean;

  public constructor(
    private readonly database: Knex,
    private readonly environment: Environment,
    private readonly repository = new CatalogueRepository(database),
    private readonly clock: CatalogueClock = systemClock
  ) {
    this.production = environment.nodeEnv === 'production';
  }

  private assertActivationAllowed(developmentOnly: boolean, approvalReference?: string): void {
    if (developmentOnly) return;
    if (!this.environment.catalogueProductionActivationEnabled) {
      throw new AppError(
        409,
        'PRODUCTION_CONFIGURATION_UNAPPROVED',
        'Production catalogue activation is disabled pending business approval.'
      );
    }
    if (approvalReference === undefined) {
      throw new AppError(
        400,
        'APPROVAL_REFERENCE_REQUIRED',
        'An approval reference is required for production catalogue data.'
      );
    }
  }

  public async listServices() {
    const services = await this.repository.listActiveServices(this.production);
    return Promise.all(
      services.map(async (service) =>
        publicService(
          service,
          await this.repository.activePrice(
            this.database,
            service.id,
            this.clock.now(),
            this.production
          )
        )
      )
    );
  }

  public async createService(request: Request, actor: AuthenticatedUser, input: CreateServiceInput) {
    this.assertActivationAllowed(input.developmentOnly, input.approvalReference);
    const id = randomUUID();
    await this.repository.transaction(async (transaction) => {
      await transaction('services').insert({
        id,
        code: input.code,
        name: input.name,
        description: input.description,
        duration_minutes: input.durationMinutes,
        status: input.status,
        development_only: input.developmentOnly,
        recurrence_mode: input.recurrence.mode,
        recurrence_unit: input.recurrence.mode === 'recurring' ? input.recurrence.unit : null,
        recurrence_interval:
          input.recurrence.mode === 'recurring' ? input.recurrence.interval : null,
        approval_reference: input.approvalReference ?? null,
        created_by: actor.id
      });
      await appendAuditEvent(transaction, request, {
        action: 'catalogue.service_created',
        entityType: 'service',
        entityId: id,
        actorUserId: actor.id,
        after: input
      });
    });
    return { id, ...input, automaticRecurringBilling: false };
  }

  public async updateService(
    request: Request,
    actor: AuthenticatedUser,
    serviceId: string,
    input: {
      name?: string | undefined;
      description?: string | undefined;
      status?: ServiceRow['status'] | undefined;
      reason: string;
    }
  ) {
    await this.repository.transaction(async (transaction) => {
      const existing = await this.repository.serviceById(transaction, serviceId, true);
      if (existing === undefined) throw new AppError(404, 'NOT_FOUND', 'Service was not found.');
      const after = {
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        status: input.status ?? existing.status
      };
      await transaction('services').where({ id: serviceId }).update({
        ...after,
        updated_at: transaction.fn.now()
      });
      await appendAuditEvent(transaction, request, {
        action: 'catalogue.service_changed',
        entityType: 'service',
        entityId: serviceId,
        actorUserId: actor.id,
        before: {
          name: existing.name,
          description: existing.description,
          status: existing.status
        },
        after,
        reason: input.reason
      });
    });
  }

  public async createPriceVersion(
    request: Request,
    actor: AuthenticatedUser,
    serviceId: string,
    input: CreatePriceVersionInput
  ) {
    this.assertActivationAllowed(input.developmentOnly, input.approvalReference);
    if (input.effectiveTo !== undefined && input.effectiveTo <= input.effectiveFrom) {
      throw new AppError(400, 'INVALID_EFFECTIVE_RANGE', 'effectiveTo must be after effectiveFrom.');
    }
    const id = randomUUID();
    let version = 0;
    await this.repository.transaction(async (transaction) => {
      const service = await this.repository.serviceById(transaction, serviceId, true);
      if (service === undefined) throw new AppError(404, 'NOT_FOUND', 'Service was not found.');
      let overlap = transaction('service_price_versions')
        .where({ service_id: serviceId })
        .where((builder) => {
          builder.whereNull('effective_to').orWhere('effective_to', '>', input.effectiveFrom);
        });
      if (input.effectiveTo !== undefined) overlap = overlap.where('effective_from', '<', input.effectiveTo);
      if ((await overlap.first('id')) !== undefined) {
        throw new AppError(409, 'PRICE_EFFECTIVE_RANGE_OVERLAP', 'Price effective ranges cannot overlap.');
      }
      const latest = await transaction('service_price_versions')
        .where({ service_id: serviceId })
        .max<{ version: number | null }[]>({ version: 'version' });
      version = Number(latest[0]?.version ?? 0) + 1;
      await transaction('service_price_versions').insert({
        id,
        service_id: serviceId,
        version,
        currency: 'GHS',
        base_amount_minor: input.baseAmountMinor,
        included_bedrooms: input.includedBedrooms,
        bedroom_surcharge_minor: input.bedroomSurchargeMinor,
        tax_basis_points: input.taxBasisPoints,
        effective_from: input.effectiveFrom,
        effective_to: input.effectiveTo ?? null,
        development_only: input.developmentOnly,
        approval_reference: input.approvalReference ?? null,
        approved_by: actor.id
      });
      await appendAuditEvent(transaction, request, {
        action: 'catalogue.price_version_created',
        entityType: 'service_price_version',
        entityId: id,
        actorUserId: actor.id,
        after: { serviceId, version, currency: 'GHS', ...input },
        reason: input.reason
      });
    });
    return { id, serviceId, version, currency: 'GHS' as const, ...input };
  }

  public async createZone(request: Request, actor: AuthenticatedUser, input: CreateZoneInput) {
    this.assertActivationAllowed(input.developmentOnly, input.approvalReference);
    const id = randomUUID();
    await this.repository.transaction(async (transaction) => {
      const found = await transaction('services').whereIn('id', input.serviceIds).count<{ count: number }[]>({ count: '*' });
      if (Number(found[0]?.count) !== new Set(input.serviceIds).size) {
        throw new AppError(400, 'INVALID_SERVICE_IDS', 'One or more service IDs are invalid.');
      }
      await transaction('service_zones').insert({
        id,
        code: input.code,
        name: input.name,
        region: input.region,
        region_normalized: normalizeLocation(input.region),
        status: input.status,
        development_only: input.developmentOnly,
        approval_reference: input.approvalReference ?? null,
        created_by: actor.id
      });
      const localities = [...new Map(input.localities.map((value) => [normalizeLocation(value), value.trim()])).entries()];
      await transaction('service_zone_localities').insert(
        localities.map(([normalized, display]) => ({
          zone_id: id,
          locality: display,
          locality_normalized: normalized
        }))
      );
      await transaction('service_zone_assignments').insert(
        [...new Set(input.serviceIds)].map((serviceId) => ({
          service_id: serviceId,
          zone_id: id,
          assigned_by: actor.id
        }))
      );
      await appendAuditEvent(transaction, request, {
        action: 'catalogue.zone_created',
        entityType: 'service_zone',
        entityId: id,
        actorUserId: actor.id,
        after: input
      });
    });
    return { id, ...input };
  }

  public async createBusinessHours(
    request: Request,
    actor: AuthenticatedUser,
    input: CreateBusinessHoursInput
  ) {
    this.assertActivationAllowed(input.developmentOnly, input.approvalReference);
    if (input.closesMinute <= input.opensMinute || (input.effectiveTo !== undefined && input.effectiveTo < input.effectiveFrom)) {
      throw new AppError(400, 'INVALID_BUSINESS_HOURS', 'Business-hour ranges are invalid.');
    }
    const id = randomUUID();
    await this.repository.transaction(async (transaction) => {
      let overlap = transaction('business_hours')
        .where({ day_of_week: input.dayOfWeek })
        .where('opens_minute', '<', input.closesMinute)
        .where('closes_minute', '>', input.opensMinute)
        .where((builder) => {
          builder.whereNull('effective_to').orWhere('effective_to', '>=', input.effectiveFrom);
        });
      if (input.effectiveTo !== undefined) overlap = overlap.where('effective_from', '<=', input.effectiveTo);
      if ((await overlap.first('id')) !== undefined) {
        throw new AppError(409, 'BUSINESS_HOURS_OVERLAP', 'Business-hour effective ranges cannot overlap.');
      }
      await transaction('business_hours').insert({
        id,
        day_of_week: input.dayOfWeek,
        opens_minute: input.opensMinute,
        closes_minute: input.closesMinute,
        effective_from: input.effectiveFrom,
        effective_to: input.effectiveTo ?? null,
        development_only: input.developmentOnly,
        approval_reference: input.approvalReference ?? null,
        approved_by: actor.id
      });
      await appendAuditEvent(transaction, request, {
        action: 'catalogue.business_hours_created',
        entityType: 'business_hours',
        entityId: id,
        actorUserId: actor.id,
        after: input
      });
    });
    return { id, ...input, timeZone: ACCRA_TIME_ZONE };
  }

  public async createCapacitySlot(
    request: Request,
    actor: AuthenticatedUser,
    input: CreateCapacitySlotInput
  ) {
    this.assertActivationAllowed(input.developmentOnly, input.approvalReference);
    if (input.endsAt <= input.startsAt) {
      throw new AppError(400, 'INVALID_CAPACITY_SLOT', 'endsAt must be after startsAt.');
    }
    const id = randomUUID();
    await this.repository.transaction(async (transaction) => {
      const service = await this.repository.serviceById(transaction, input.serviceId, true);
      if (service === undefined) throw new AppError(404, 'NOT_FOUND', 'Service was not found.');
      if (input.endsAt.getTime() - input.startsAt.getTime() < service.duration_minutes * 60_000) {
        throw new AppError(400, 'INVALID_CAPACITY_SLOT', 'The slot is shorter than the service duration.');
      }
      await transaction('capacity_slots').insert({
        id,
        service_id: input.serviceId,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        capacity_total: input.capacityTotal,
        status: input.status,
        development_only: input.developmentOnly,
        approval_reference: input.approvalReference ?? null,
        created_by: actor.id
      });
      await appendAuditEvent(transaction, request, {
        action: 'catalogue.capacity_slot_created',
        entityType: 'capacity_slot',
        entityId: id,
        actorUserId: actor.id,
        after: input
      });
    });
    return { id, ...input };
  }

  public async createPolicy(request: Request, actor: AuthenticatedUser, input: CreatePolicyInput) {
    this.assertActivationAllowed(input.developmentOnly, input.approvalReference);
    if (input.effectiveTo !== undefined && input.effectiveTo <= input.effectiveFrom) {
      throw new AppError(400, 'INVALID_EFFECTIVE_RANGE', 'effectiveTo must be after effectiveFrom.');
    }
    const id = randomUUID();
    let version = 0;
    await this.repository.transaction(async (transaction) => {
      let overlap = transaction('policy_versions')
        .where({ policy_type: input.policyType })
        .where((builder) => {
          builder.whereNull('effective_to').orWhere('effective_to', '>', input.effectiveFrom);
        });
      if (input.effectiveTo !== undefined) overlap = overlap.where('effective_from', '<', input.effectiveTo);
      if ((await overlap.first('id')) !== undefined) {
        throw new AppError(409, 'POLICY_EFFECTIVE_RANGE_OVERLAP', 'Policy effective ranges cannot overlap.');
      }
      const latest = await transaction('policy_versions')
        .where({ policy_type: input.policyType })
        .max<{ version: number | null }[]>({ version: 'version' });
      version = Number(latest[0]?.version ?? 0) + 1;
      await transaction('policy_versions').insert({
        id,
        policy_type: input.policyType,
        version,
        title: input.title,
        rules_json: JSON.stringify(input.rules),
        effective_from: input.effectiveFrom,
        effective_to: input.effectiveTo ?? null,
        development_only: input.developmentOnly,
        approval_reference: input.approvalReference ?? null,
        approved_by: actor.id
      });
      await appendAuditEvent(transaction, request, {
        action: 'catalogue.policy_version_created',
        entityType: 'policy_version',
        entityId: id,
        actorUserId: actor.id,
        after: { ...input, version }
      });
    });
    return { id, ...input, version };
  }

  public async createAddress(actor: AuthenticatedUser, input: CreateAddressInput) {
    const id = randomUUID();
    await this.database('customer_addresses').insert({
      id,
      customer_user_id: actor.id,
      label: input.label,
      address_line1: input.addressLine1,
      address_line2: input.addressLine2 ?? null,
      locality: input.locality,
      locality_normalized: normalizeLocation(input.locality),
      region: input.region,
      region_normalized: normalizeLocation(input.region),
      postal_code: input.postalCode ?? null
    });
    return { id, ...input };
  }

  public async listAddresses(actor: AuthenticatedUser) {
    return (await this.repository.listAddresses(actor.id)).map(publicAddress);
  }

  public async createQuote(
    request: Request,
    actor: AuthenticatedUser,
    input: { serviceId: string; addressId: string; startsAt: Date; inputs: { bedrooms: number } }
  ) {
    const now = this.clock.now();
    if (input.startsAt <= now) {
      throw new AppError(409, 'START_TIME_UNAVAILABLE', 'The requested start time is unavailable.');
    }
    const quoteId = randomUUID();
    const expiresAt = new Date(now.getTime() + this.environment.quoteTtlSeconds * 1000);

    await this.repository.transaction(async (transaction) => {
      const service = await this.repository.serviceById(transaction, input.serviceId, true);
      if (
        service === undefined ||
        service.status !== 'active' ||
        (this.production && booleanValue(service.development_only))
      ) {
        throw new AppError(409, 'SERVICE_UNAVAILABLE', 'The selected service is unavailable.');
      }

      const address = await this.repository.addressById(transaction, input.addressId, actor.id);
      if (address === undefined) throw new AppError(404, 'NOT_FOUND', 'Address was not found.');
      if (
        !(await this.repository.addressIsInServiceZone(
          transaction,
          service.id,
          address,
          this.production
        ))
      ) {
        throw new AppError(409, 'ADDRESS_OUT_OF_ZONE', 'The address is outside this service area.');
      }

      const price = await this.repository.activePrice(
        transaction,
        service.id,
        input.startsAt,
        this.production,
        true
      );
      if (price === undefined) {
        throw new AppError(409, 'PRICE_UNAVAILABLE', 'No approved price is available for this time.');
      }

      const startParts = accraBusinessParts(input.startsAt);
      const serviceEnd = new Date(input.startsAt.getTime() + service.duration_minutes * 60_000);
      const endParts = accraBusinessParts(serviceEnd);
      const hours = await this.repository.businessHours(
        transaction,
        startParts.dayOfWeek,
        startParts.date,
        this.production
      );
      if (
        endParts.date !== startParts.date ||
        !hours.some(
          (window) =>
            window.opens_minute <= startParts.minuteOfDay &&
            window.closes_minute >= endParts.minuteOfDay
        )
      ) {
        throw new AppError(409, 'OUTSIDE_BUSINESS_HOURS', 'The requested time is outside business hours.');
      }

      const slot = await this.repository.capacitySlot(
        transaction,
        service.id,
        input.startsAt,
        this.production,
        true
      );
      if (
        slot === undefined ||
        slot.capacity_reserved >= slot.capacity_total ||
        toDate(slot.ends_at) < serviceEnd
      ) {
        throw new AppError(409, 'CAPACITY_UNAVAILABLE', 'No capacity is available for this time.');
      }

      const policyMap = selectedPolicies(
        await this.repository.policies(transaction, input.startsAt, this.production, true)
      );
      const required = [
        ...REQUIRED_POLICY_TYPES,
        ...(service.recurrence_mode === 'recurring' ? (['recurring'] as const) : [])
      ];
      if (required.some((type) => !policyMap.has(type))) {
        throw new AppError(409, 'POLICY_UNAVAILABLE', 'Required booking policies are unavailable.');
      }

      const amounts = calculateQuoteAmounts(price, input.inputs.bedrooms);
      const serviceSnapshot = publicService(service);
      const addressSnapshot = publicAddress(address);
      const pricingSnapshot = {
        priceVersionId: price.id,
        version: price.version,
        currency: 'GHS',
        baseAmountMinor: numberValue(price.base_amount_minor),
        includedBedrooms: price.included_bedrooms,
        bedroomSurchargeMinor: numberValue(price.bedroom_surcharge_minor),
        taxBasisPoints: price.tax_basis_points,
        developmentOnly: booleanValue(price.development_only),
        approvalReference: price.approval_reference
      };
      const policySnapshot = Object.fromEntries(
        required.map((type) => {
          const policy = policyMap.get(type)!;
          return [
            type,
            {
              id: policy.id,
              version: policy.version,
              title: policy.title,
              rules: parseJsonValue(policy.rules_json),
              developmentOnly: booleanValue(policy.development_only),
              approvalReference: policy.approval_reference
            }
          ];
        })
      );

      await transaction('quotes').insert({
        id: quoteId,
        customer_user_id: actor.id,
        service_id: service.id,
        address_id: address.id,
        price_version_id: price.id,
        starts_at: input.startsAt,
        expires_at: expiresAt,
        currency: 'GHS',
        subtotal_minor: amounts.subtotalMinor,
        tax_basis_points: price.tax_basis_points,
        tax_minor: amounts.taxMinor,
        total_minor: amounts.totalMinor,
        inputs_snapshot: JSON.stringify(input.inputs),
        service_snapshot: JSON.stringify(serviceSnapshot),
        address_snapshot: JSON.stringify(addressSnapshot),
        pricing_snapshot: JSON.stringify(pricingSnapshot),
        policy_snapshot: JSON.stringify(policySnapshot)
      });
      await appendAuditEvent(transaction, request, {
        action: 'quote.created',
        entityType: 'quote',
        entityId: quoteId,
        actorUserId: actor.id,
        after: {
          serviceId: service.id,
          addressId: address.id,
          priceVersionId: price.id,
          startsAt: input.startsAt,
          expiresAt,
          ...amounts,
          currency: 'GHS'
        }
      });
    });

    return this.getQuote(actor, quoteId);
  }

  public async getQuote(actor: AuthenticatedUser, quoteId: string) {
    const quote = await this.repository.quoteById(quoteId, actor.id);
    if (quote === undefined) throw new AppError(404, 'NOT_FOUND', 'Quote was not found.');
    return this.presentQuote(quote);
  }

  private presentQuote(quote: QuoteRow) {
    const expiresAt = toDate(quote.expires_at);
    const startsAt = toDate(quote.starts_at);
    const expired = expiresAt <= this.clock.now();
    return {
      id: quote.id,
      serviceId: quote.service_id,
      addressId: quote.address_id,
      priceVersionId: quote.price_version_id,
      startsAt: startsAt.toISOString(),
      startsAtBusinessTime: accraBusinessParts(startsAt).display,
      expiresAt: expiresAt.toISOString(),
      expired,
      bookable: !expired,
      currency: 'GHS',
      subtotalMinor: numberValue(quote.subtotal_minor),
      tax: {
        basisPoints: quote.tax_basis_points,
        amountMinor: numberValue(quote.tax_minor)
      },
      totalMinor: numberValue(quote.total_minor),
      inputs: parseJsonValue(quote.inputs_snapshot),
      service: parseJsonValue(quote.service_snapshot),
      address: parseJsonValue(quote.address_snapshot),
      pricing: parseJsonValue(quote.pricing_snapshot),
      policies: parseJsonValue(quote.policy_snapshot),
      recurringBillingCreated: false
    };
  }
}
