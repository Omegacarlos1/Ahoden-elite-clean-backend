import { Router, type RequestHandler } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';

import type { Environment } from '../../config/environment.js';
import { createAuthenticator, type Authenticator } from '../../security/authentication.js';
import { CatalogueService } from './catalogue.service.js';

const uuid = z.string().uuid();
const dateTime = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const effectiveDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const developmentApproval = {
  developmentOnly: z.boolean(),
  approvalReference: z.string().trim().min(3).max(120).optional()
};

const serviceSchema = z
  .object({
    code: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(50),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(10).max(1000),
    durationMinutes: z.number().int().min(30).max(1440),
    status: z.enum(['draft', 'active', 'inactive']),
    ...developmentApproval,
    recurrence: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('one_time') }).strict(),
      z
        .object({
          mode: z.literal('recurring'),
          unit: z.enum(['week', 'month']),
          interval: z.number().int().min(1).max(52)
        })
        .strict()
    ])
  })
  .strict();

const serviceUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().min(10).max(1000).optional(),
    status: z.enum(['draft', 'active', 'inactive']).optional(),
    reason: z.string().trim().min(3).max(255)
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined || value.description !== undefined || value.status !== undefined,
    'At least one service field must change.'
  );

const priceVersionSchema = z
  .object({
    baseAmountMinor: z.number().int().min(0).max(100_000_000),
    includedBedrooms: z.number().int().min(0).max(20),
    bedroomSurchargeMinor: z.number().int().min(0).max(10_000_000),
    taxBasisPoints: z.number().int().min(0).max(10_000),
    effectiveFrom: dateTime,
    effectiveTo: dateTime.optional(),
    ...developmentApproval,
    reason: z.string().trim().min(3).max(255)
  })
  .strict();

const zoneSchema = z
  .object({
    code: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(50),
    name: z.string().trim().min(2).max(120),
    region: z.string().trim().min(2).max(120),
    localities: z.array(z.string().trim().min(2).max(120)).min(1).max(100),
    serviceIds: z.array(uuid).min(1).max(100),
    status: z.enum(['active', 'inactive']),
    ...developmentApproval
  })
  .strict();

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const businessHoursSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    opensAt: time,
    closesAt: time,
    effectiveFrom: effectiveDate,
    effectiveTo: effectiveDate.optional(),
    ...developmentApproval
  })
  .strict();

const capacitySlotSchema = z
  .object({
    serviceId: uuid,
    startsAt: dateTime,
    endsAt: dateTime,
    capacityTotal: z.number().int().min(1).max(10_000),
    status: z.enum(['active', 'inactive']),
    ...developmentApproval
  })
  .strict();

const policyShared = {
  title: z.string().trim().min(3).max(160),
  effectiveFrom: dateTime,
  effectiveTo: dateTime.optional(),
  ...developmentApproval
};
const policySchema = z.discriminatedUnion('policyType', [
  z
    .object({
      policyType: z.literal('cancellation'),
      ...policyShared,
      rules: z
        .object({
          noticeHours: z.number().int().min(0).max(8760),
          refundBasisPoints: z.number().int().min(0).max(10_000),
          feeMinor: z.number().int().min(0).max(100_000_000)
        })
        .strict()
    })
    .strict(),
  z
    .object({
      policyType: z.literal('rescheduling'),
      ...policyShared,
      rules: z
        .object({
          noticeHours: z.number().int().min(0).max(8760),
          maximumChanges: z.number().int().min(0).max(100)
        })
        .strict()
    })
    .strict(),
  z
    .object({
      policyType: z.literal('reclean'),
      ...policyShared,
      rules: z
        .object({
          claimWindowHours: z.number().int().min(1).max(720),
          exclusions: z.array(z.string().trim().min(1).max(160)).max(50)
        })
        .strict()
    })
    .strict(),
  z
    .object({
      policyType: z.literal('recurring'),
      ...policyShared,
      rules: z
        .object({
          paymentMode: z.literal('per_occurrence_upfront'),
          automaticBilling: z.literal(false)
        })
        .strict()
    })
    .strict()
]);

const addressSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    addressLine1: z.string().trim().min(5).max(255),
    addressLine2: z.string().trim().min(1).max(255).optional(),
    locality: z.string().trim().min(2).max(120),
    region: z.string().trim().min(2).max(120),
    postalCode: z.string().trim().min(2).max(30).optional()
  })
  .strict();

const quoteSchema = z
  .object({
    serviceId: uuid,
    addressId: uuid,
    startsAt: dateTime,
    inputs: z.object({ bedrooms: z.number().int().min(0).max(20) }).strict()
  })
  .strict();

function minuteOfDay(value: string): number {
  const [hour = '0', minute = '0'] = value.split(':');
  return Number(hour) * 60 + Number(minute);
}

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export interface CatalogueRouterDependencies {
  authenticator?: Authenticator;
  service?: CatalogueService;
}

export function createCatalogueRouter(
  database: Knex,
  environment: Environment,
  dependencies: CatalogueRouterDependencies = {}
): Router {
  const router = Router();
  const authenticator = dependencies.authenticator ?? createAuthenticator(database, environment);
  const service = dependencies.service ?? new CatalogueService(database, environment);

  router.get(
    '/services',
    asyncRoute(async (_request, response) => {
      response.json({ data: await service.listServices() });
    })
  );

  router.post(
    '/services',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireOwner(request);
      const created = await service.createService(request, actor, serviceSchema.parse(request.body));
      response.status(201).json({ data: created });
    })
  );

  router.patch(
    '/services/:serviceId',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireOwner(request);
      const serviceId = uuid.parse(request.params.serviceId);
      await service.updateService(request, actor, serviceId, serviceUpdateSchema.parse(request.body));
      response.status(204).send();
    })
  );

  router.post(
    '/services/:serviceId/price-versions',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireOwner(request);
      const serviceId = uuid.parse(request.params.serviceId);
      const created = await service.createPriceVersion(
        request,
        actor,
        serviceId,
        priceVersionSchema.parse(request.body)
      );
      response.status(201).json({ data: created });
    })
  );

  router.post(
    '/service-zones',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireOwner(request);
      const created = await service.createZone(request, actor, zoneSchema.parse(request.body));
      response.status(201).json({ data: created });
    })
  );

  router.post(
    '/business-hours',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireOwner(request);
      const input = businessHoursSchema.parse(request.body);
      const created = await service.createBusinessHours(request, actor, {
        dayOfWeek: input.dayOfWeek,
        opensMinute: minuteOfDay(input.opensAt),
        closesMinute: minuteOfDay(input.closesAt),
        effectiveFrom: input.effectiveFrom,
        ...(input.effectiveTo === undefined ? {} : { effectiveTo: input.effectiveTo }),
        developmentOnly: input.developmentOnly,
        ...(input.approvalReference === undefined
          ? {}
          : { approvalReference: input.approvalReference })
      });
      response.status(201).json({ data: created });
    })
  );

  router.post(
    '/capacity-slots',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireOwner(request);
      const created = await service.createCapacitySlot(
        request,
        actor,
        capacitySlotSchema.parse(request.body)
      );
      response.status(201).json({ data: created });
    })
  );

  router.post(
    '/policies',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireOwner(request);
      const input = policySchema.parse(request.body);
      const created = await service.createPolicy(request, actor, {
        ...input,
        rules: input.rules
      });
      response.status(201).json({ data: created });
    })
  );

  router.get(
    '/addresses',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireCustomer(request);
      response.json({ data: await service.listAddresses(actor) });
    })
  );

  router.post(
    '/addresses',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireCustomer(request);
      response.status(201).json({
        data: await service.createAddress(actor, addressSchema.parse(request.body))
      });
    })
  );

  router.post(
    '/quotes',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireCustomer(request);
      response.status(201).json({
        data: await service.createQuote(request, actor, quoteSchema.parse(request.body))
      });
    })
  );

  router.get(
    '/quotes/:quoteId',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireCustomer(request);
      response.json({ data: await service.getQuote(actor, uuid.parse(request.params.quoteId)) });
    })
  );

  return router;
}
