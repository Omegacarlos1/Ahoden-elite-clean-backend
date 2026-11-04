import { Router, type RequestHandler } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';

import type { Environment } from '../../config/environment.js';
import { parsePagination } from '../../config/pagination.js';
import { AppError } from '../../http/errors.js';
import { createAuthenticator, type Authenticator } from '../../security/authentication.js';
import { BookingsService } from './bookings.service.js';

const uuid = z.string().uuid();
const dateTime = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const reason = z.string().trim().min(3).max(255);

const createBookingSchema = z.object({ quoteId: uuid }).strict();
const cancellationSchema = z.object({ reason }).strict();
const rescheduleSchema = z.object({ quoteId: uuid, reason }).strict();
const availabilitySchema = z
  .object({
    startsAt: dateTime,
    endsAt: dateTime,
    status: z.enum(['available', 'unavailable']),
    reason
  })
  .strict();
const assignmentSchema = z
  .object({
    cleanerIds: z.array(uuid).min(1).max(20),
    expectedVersion: z.number().int().min(0).optional(),
    reason: reason.optional()
  })
  .strict()
  .refine((value) => new Set(value.cleanerIds).size === value.cleanerIds.length, {
    message: 'Cleaner IDs must be unique.',
    path: ['cleanerIds']
  });
const transitionSchema = z
  .object({
    state: z.enum(['assigned', 'en_route', 'started', 'completed', 'delayed', 'exception']),
    expectedVersion: z.number().int().min(0),
    reason: reason.optional()
  })
  .strict();

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function idempotencyKey(value: string | undefined): string {
  if (value === undefined) {
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key header is required.');
  }
  return z.string().min(8).max(200).regex(/^[A-Za-z0-9._:-]+$/).parse(value);
}

export interface BookingsRouterDependencies {
  authenticator?: Authenticator;
  service?: BookingsService;
}

export function createBookingsRouter(
  database: Knex,
  environment: Environment,
  dependencies: BookingsRouterDependencies = {}
): Router {
  const router = Router();
  const authenticator = dependencies.authenticator ?? createAuthenticator(database, environment);
  const service = dependencies.service ?? new BookingsService(database, environment);

  router.post(
    '/bookings',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireCustomer(request);
      const body = createBookingSchema.parse(request.body);
      const result = await service.createBooking(
        request,
        actor,
        idempotencyKey(request.header('idempotency-key')),
        body.quoteId
      );
      if (result.replayed) response.setHeader('Idempotency-Replayed', 'true');
      response.status(201).json({ data: result.data });
    })
  );

  router.get(
    '/bookings',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireCustomer(request);
      const result = await service.listBookings(actor, parsePagination(request.query));
      response.json(result);
    })
  );

  router.get(
    '/bookings/:bookingId',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireCustomer(request);
      response.json({
        data: await service.getBooking(actor, uuid.parse(request.params.bookingId))
      });
    })
  );

  router.post(
    '/bookings/:bookingId/cancel',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireCustomer(request);
      const body = cancellationSchema.parse(request.body);
      response.json({
        data: await service.cancelBooking(
          request,
          actor,
          uuid.parse(request.params.bookingId),
          body.reason
        )
      });
    })
  );

  router.post(
    '/bookings/:bookingId/reschedule',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireCustomer(request);
      response.json({
        data: await service.rescheduleBooking(
          request,
          actor,
          uuid.parse(request.params.bookingId),
          rescheduleSchema.parse(request.body)
        )
      });
    })
  );

  router.post(
    '/cleaners/:cleanerId/availability',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireManagerOrOwner(request);
      response.status(201).json({
        data: await service.createCleanerAvailability(
          request,
          actor,
          uuid.parse(request.params.cleanerId),
          availabilitySchema.parse(request.body)
        )
      });
    })
  );

  router.post(
    '/jobs/:jobId/assignments',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireManagerOrOwner(request);
      const result = await service.assignJob(
        request,
        actor,
        idempotencyKey(request.header('idempotency-key')),
        uuid.parse(request.params.jobId),
        assignmentSchema.parse(request.body)
      );
      if (result.replayed) response.setHeader('Idempotency-Replayed', 'true');
      response.status(201).json({ data: result.data });
    })
  );

  router.get(
    '/jobs/:jobId',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireUser(request);
      response.json({ data: await service.getJob(actor, uuid.parse(request.params.jobId)) });
    })
  );

  router.patch(
    '/jobs/:jobId/status',
    asyncRoute(async (request, response) => {
      const actor = await authenticator.requireUser(request);
      response.json({
        data: await service.transitionJob(
          request,
          actor,
          uuid.parse(request.params.jobId),
          transitionSchema.parse(request.body)
        )
      });
    })
  );

  return router;
}
