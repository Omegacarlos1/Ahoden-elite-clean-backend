import { createHash, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { Knex } from 'knex';

import type { Environment } from '../../config/environment.js';
import { paginationMeta, type Pagination } from '../../config/pagination.js';
import { appendAuditEvent } from '../../database/audit.js';
import { AppError } from '../../http/errors.js';
import type { AuthenticatedUser } from '../../security/authentication.js';
import { accraBusinessParts } from '../catalogue/catalogue.service.js';
import { parseJsonValue, type QuoteRow } from '../catalogue/catalogue.repository.js';
import {
  BookingsRepository,
  type BookingRow,
  type BookingStatus,
  type CapacitySlotRow,
  type JobRow,
  type JobState,
  type ReservationRow
} from './bookings.repository.js';

export interface BookingClock {
  now(): Date;
}

export interface IdempotentResult<T> {
  data: T;
  replayed: boolean;
}

export interface RescheduleBookingInput {
  quoteId: string;
  reason: string;
}

export interface AssignmentInput {
  cleanerIds: string[];
  expectedVersion?: number | undefined;
  reason?: string | undefined;
}

export interface JobTransitionInput {
  state: Exclude<JobState, 'awaiting_payment' | 'unassigned' | 'cancelled'>;
  expectedVersion: number;
  reason?: string | undefined;
}

const systemClock: BookingClock = { now: () => new Date() };
const CREATE_BOOKING_OPERATION = 'booking.create';
const ASSIGN_JOB_OPERATION = 'job.assign';

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(`${value.replace(' ', 'T')}Z`);
}

function numberValue(value: string | number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new AppError(500, 'INVALID_STORED_AMOUNT', 'A stored amount is outside the supported range.');
  }
  return result;
}

function payloadHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isDuplicateEntry(error: unknown): boolean {
  return (error as { code?: string }).code === 'ER_DUP_ENTRY';
}

function cancellationRules(quote: QuoteRow): { noticeHours: number } {
  const policies = parseJsonValue<{
    cancellation?: { rules?: { noticeHours?: unknown } };
  }>(quote.policy_snapshot);
  const noticeHours = Number(policies.cancellation?.rules?.noticeHours);
  if (!Number.isInteger(noticeHours) || noticeHours < 0) {
    throw new AppError(500, 'INVALID_POLICY_SNAPSHOT', 'The booking policy snapshot is invalid.');
  }
  return { noticeHours };
}

function reschedulingRules(quote: QuoteRow): { noticeHours: number; maximumChanges: number } {
  const policies = parseJsonValue<{
    rescheduling?: { rules?: { noticeHours?: unknown; maximumChanges?: unknown } };
  }>(quote.policy_snapshot);
  const noticeHours = Number(policies.rescheduling?.rules?.noticeHours);
  const maximumChanges = Number(policies.rescheduling?.rules?.maximumChanges);
  if (
    !Number.isInteger(noticeHours) ||
    noticeHours < 0 ||
    !Number.isInteger(maximumChanges) ||
    maximumChanges < 0
  ) {
    throw new AppError(500, 'INVALID_POLICY_SNAPSHOT', 'The booking policy snapshot is invalid.');
  }
  return { noticeHours, maximumChanges };
}

function assertNoticeWindow(startsAt: Date, now: Date, noticeHours: number, code: string): void {
  if (startsAt.getTime() - now.getTime() < noticeHours * 3_600_000) {
    throw new AppError(409, code, 'The approved policy notice window has closed.');
  }
}

export class BookingsService {
  public constructor(
    private readonly database: Knex,
    private readonly environment: Environment,
    private readonly repository = new BookingsRepository(database),
    private readonly clock: BookingClock = systemClock
  ) {}

  public async createBooking(
    request: Request,
    actor: AuthenticatedUser,
    idempotencyKey: string,
    quoteId: string
  ): Promise<IdempotentResult<unknown>> {
    const hash = payloadHash({ quoteId });

    try {
      return await this.repository.transaction(async (transaction) => {
        const idempotency = await this.claimIdempotency(
          transaction,
          actor,
          CREATE_BOOKING_OPERATION,
          idempotencyKey,
          hash
        );
        if (idempotency.resource_id !== null) {
          const booking = await this.repository.bookingById(
            transaction,
            idempotency.resource_id,
            actor.id
          );
          if (booking === undefined) {
            throw new AppError(409, 'IDEMPOTENCY_INCOMPLETE', 'The prior request cannot be replayed.');
          }
          return { data: await this.presentBooking(transaction, booking), replayed: true };
        }

        const now = this.clock.now();
        const quote = await this.repository.quoteById(transaction, quoteId, actor.id, true);
        if (quote === undefined) throw new AppError(404, 'NOT_FOUND', 'Quote was not found.');
        if (toDate(quote.expires_at) <= now) {
          throw new AppError(409, 'QUOTE_EXPIRED', 'The quote has expired.');
        }
        if (toDate(quote.starts_at) <= now) {
          throw new AppError(409, 'START_TIME_UNAVAILABLE', 'The quoted start time is unavailable.');
        }
        if ((await this.repository.bookingByInitialQuote(transaction, quote.id)) !== undefined) {
          throw new AppError(409, 'QUOTE_ALREADY_BOOKED', 'The quote has already been booked.');
        }

        const slot = await this.repository.capacitySlotForQuote(
          transaction,
          quote.service_id,
          toDate(quote.starts_at),
          true
        );
        if (slot === undefined) {
          throw new AppError(409, 'CAPACITY_UNAVAILABLE', 'No capacity is available for this time.');
        }
        await this.releaseExpiredForSlot(transaction, request, slot, now);
        const currentSlot = await this.repository.capacitySlotForQuote(
          transaction,
          quote.service_id,
          toDate(quote.starts_at),
          true
        );
        if (
          currentSlot === undefined ||
          currentSlot.capacity_reserved >= currentSlot.capacity_total
        ) {
          throw new AppError(409, 'CAPACITY_UNAVAILABLE', 'No capacity is available for this time.');
        }

        const bookingId = randomUUID();
        const reservationId = randomUUID();
        const jobId = randomUUID();
        const startsAt = toDate(quote.starts_at);
        const service = parseJsonValue<{ durationMinutes?: unknown }>(quote.service_snapshot);
        const durationMinutes = Number(service.durationMinutes);
        if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
          throw new AppError(500, 'INVALID_QUOTE_SNAPSHOT', 'The quote service snapshot is invalid.');
        }
        const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
        if (endsAt > toDate(currentSlot.ends_at)) {
          throw new AppError(409, 'CAPACITY_UNAVAILABLE', 'No capacity is available for this time.');
        }
        const reservationExpiresAt = new Date(
          now.getTime() + this.environment.bookingReservationTtlSeconds * 1000
        );

        await transaction('bookings').insert({
          id: bookingId,
          customer_user_id: actor.id,
          initial_quote_id: quote.id,
          current_quote_id: quote.id,
          capacity_slot_id: currentSlot.id,
          booking_status: 'pending_payment',
          payment_status: 'pending',
          reservation_expires_at: reservationExpiresAt,
          starts_at: startsAt
        });
        await transaction('booking_quote_uses').insert({
          booking_id: bookingId,
          quote_id: quote.id,
          use_type: 'initial'
        });
        await transaction('capacity_reservations').insert({
          id: reservationId,
          booking_id: bookingId,
          capacity_slot_id: currentSlot.id,
          state: 'held',
          expires_at: reservationExpiresAt
        });
        await transaction('capacity_slots')
          .where({ id: currentSlot.id })
          .increment('capacity_reserved', 1);
        await transaction('jobs').insert({
          id: jobId,
          booking_id: bookingId,
          job_state: 'awaiting_payment',
          starts_at: startsAt,
          ends_at: endsAt
        });
        await appendAuditEvent(transaction, request, {
          action: 'booking.created',
          entityType: 'booking',
          entityId: bookingId,
          actorUserId: actor.id,
          after: {
            quoteId: quote.id,
            bookingStatus: 'pending_payment',
            paymentStatus: 'pending',
            reservationExpiresAt,
            capacitySlotId: currentSlot.id
          }
        });
        await this.repository.completeIdempotency(
          transaction,
          idempotency.id,
          'booking',
          bookingId,
          201
        );

        const booking = await this.repository.bookingById(transaction, bookingId, actor.id);
        return { data: await this.presentBooking(transaction, booking!), replayed: false };
      });
    } catch (error: unknown) {
      if (isDuplicateEntry(error)) {
        const replay = await this.replayBooking(actor, idempotencyKey, hash);
        if (replay !== undefined) return replay;
      }
      throw error;
    }
  }

  public async listBookings(actor: AuthenticatedUser, pagination: Pagination) {
    const result = await this.repository.listBookings(actor.id, pagination.pageSize, pagination.offset);
    return {
      data: await Promise.all(result.rows.map((row) => this.presentBooking(this.database, row))),
      meta: paginationMeta(pagination.page, pagination.pageSize, result.total)
    };
  }

  public async getBooking(actor: AuthenticatedUser, bookingId: string) {
    const booking = await this.repository.bookingById(this.database, bookingId, actor.id);
    if (booking === undefined) throw new AppError(404, 'NOT_FOUND', 'Booking was not found.');
    return this.presentBooking(this.database, booking);
  }

  public async cancelBooking(
    request: Request,
    actor: AuthenticatedUser,
    bookingId: string,
    reason: string
  ) {
    return this.repository.transaction(async (transaction) => {
      let booking = await this.repository.bookingById(transaction, bookingId, actor.id, true);
      if (booking === undefined) throw new AppError(404, 'NOT_FOUND', 'Booking was not found.');
      const slot = await transaction<CapacitySlotRow>('capacity_slots')
        .where({ id: booking.capacity_slot_id })
        .forUpdate()
        .first();
      if (slot === undefined) throw new AppError(409, 'CAPACITY_UNAVAILABLE', 'Capacity is unavailable.');
      await this.releaseExpiredForSlot(transaction, request, slot, this.clock.now());
      booking = (await this.repository.bookingById(transaction, bookingId, actor.id, true))!;
      if (booking.booking_status === 'expired') {
        throw new AppError(409, 'BOOKING_EXPIRED', 'The booking reservation has expired.');
      }
      if (!['pending_payment', 'confirmed'].includes(booking.booking_status)) {
        throw new AppError(409, 'INVALID_BOOKING_TRANSITION', 'The booking cannot be cancelled.');
      }
      if (booking.payment_status === 'paid') {
        throw new AppError(
          409,
          'PAYMENT_REFUND_REQUIRED',
          'Paid booking cancellation requires the M05 refund workflow.'
        );
      }
      const quote = await this.repository.quoteById(
        transaction,
        booking.current_quote_id,
        actor.id
      );
      if (quote === undefined) throw new AppError(500, 'BOOKING_QUOTE_MISSING', 'Booking quote is unavailable.');
      const rules = cancellationRules(quote);
      assertNoticeWindow(toDate(booking.starts_at), this.clock.now(), rules.noticeHours, 'CANCELLATION_WINDOW_CLOSED');

      const reservation = await this.repository.reservationByBooking(transaction, booking.id, true);
      if (reservation !== undefined && ['held', 'confirmed'].includes(reservation.state)) {
        await this.releaseReservation(transaction, booking, reservation, slot, 'customer_cancelled');
      }
      await transaction('bookings').where({ id: booking.id }).update({
        booking_status: 'cancelled',
        cancel_reason: reason,
        cancelled_at: this.clock.now(),
        updated_at: transaction.fn.now()
      });
      await transaction('jobs').where({ booking_id: booking.id }).update({
        job_state: 'cancelled',
        version: transaction.raw('version + 1'),
        updated_at: transaction.fn.now()
      });
      await appendAuditEvent(transaction, request, {
        action: 'booking.cancelled',
        entityType: 'booking',
        entityId: booking.id,
        actorUserId: actor.id,
        before: { bookingStatus: booking.booking_status },
        after: { bookingStatus: 'cancelled' },
        reason
      });
      const updated = await this.repository.bookingById(transaction, booking.id, actor.id);
      return this.presentBooking(transaction, updated!);
    });
  }

  public async rescheduleBooking(
    request: Request,
    actor: AuthenticatedUser,
    bookingId: string,
    input: RescheduleBookingInput
  ) {
    return this.repository.transaction(async (transaction) => {
      let booking = await this.repository.bookingById(transaction, bookingId, actor.id, true);
      if (booking === undefined) throw new AppError(404, 'NOT_FOUND', 'Booking was not found.');
      if (!['pending_payment', 'confirmed'].includes(booking.booking_status)) {
        throw new AppError(409, 'INVALID_BOOKING_TRANSITION', 'The booking cannot be rescheduled.');
      }
      if (input.quoteId === booking.current_quote_id) {
        throw new AppError(409, 'RESCHEDULE_NO_CHANGE', 'A different quote is required.');
      }
      const now = this.clock.now();
      const currentQuote = await this.repository.quoteById(
        transaction,
        booking.current_quote_id,
        actor.id,
        true
      );
      const nextQuote = await this.repository.quoteById(transaction, input.quoteId, actor.id, true);
      if (currentQuote === undefined || nextQuote === undefined) {
        throw new AppError(404, 'NOT_FOUND', 'Quote was not found.');
      }
      if (toDate(nextQuote.expires_at) <= now) {
        throw new AppError(409, 'QUOTE_EXPIRED', 'The quote has expired.');
      }
      if (nextQuote.service_id !== currentQuote.service_id) {
        throw new AppError(409, 'RESCHEDULE_SERVICE_MISMATCH', 'Rescheduling must keep the same service.');
      }
      if ((await this.repository.quoteUse(transaction, nextQuote.id)) !== undefined) {
        throw new AppError(409, 'QUOTE_ALREADY_BOOKED', 'The quote has already been booked.');
      }
      const rules = reschedulingRules(currentQuote);
      assertNoticeWindow(toDate(booking.starts_at), now, rules.noticeHours, 'RESCHEDULE_WINDOW_CLOSED');
      if (booking.reschedule_count >= rules.maximumChanges) {
        throw new AppError(409, 'RESCHEDULE_LIMIT_REACHED', 'The rescheduling limit has been reached.');
      }

      const nextSlotCandidate = await this.repository.capacitySlotForQuote(
        transaction,
        nextQuote.service_id,
        toDate(nextQuote.starts_at)
      );
      if (nextSlotCandidate === undefined) {
        throw new AppError(409, 'CAPACITY_UNAVAILABLE', 'No capacity is available for this time.');
      }
      if (nextSlotCandidate.id === booking.capacity_slot_id) {
        throw new AppError(409, 'RESCHEDULE_NO_CHANGE', 'A different capacity slot is required.');
      }
      const lockedSlots = await this.repository.capacitySlotsByIds(transaction, [
        booking.capacity_slot_id,
        nextSlotCandidate.id
      ]);
      const oldSlot = lockedSlots.find((slot) => slot.id === booking!.capacity_slot_id);
      const nextSlot = lockedSlots.find((slot) => slot.id === nextSlotCandidate.id);
      if (oldSlot === undefined || nextSlot === undefined || nextSlot.status !== 'active') {
        throw new AppError(409, 'CAPACITY_UNAVAILABLE', 'No capacity is available for this time.');
      }
      await this.releaseExpiredForSlot(transaction, request, oldSlot, now);
      await this.releaseExpiredForSlot(transaction, request, nextSlot, now);
      booking = (await this.repository.bookingById(transaction, bookingId, actor.id, true))!;
      if (booking.booking_status === 'expired') {
        throw new AppError(409, 'BOOKING_EXPIRED', 'The booking reservation has expired.');
      }
      const refreshedNext = await transaction<CapacitySlotRow>('capacity_slots')
        .where({ id: nextSlot.id })
        .forUpdate()
        .first();
      if (
        refreshedNext === undefined ||
        refreshedNext.capacity_reserved >= refreshedNext.capacity_total
      ) {
        throw new AppError(409, 'CAPACITY_UNAVAILABLE', 'No capacity is available for this time.');
      }

      const reservation = await this.repository.reservationByBooking(transaction, booking.id, true);
      const job = await this.repository.jobByBooking(transaction, booking.id, true);
      if (reservation === undefined || job === undefined) {
        throw new AppError(500, 'BOOKING_STATE_INCOMPLETE', 'Booking scheduling state is incomplete.');
      }
      const service = parseJsonValue<{ durationMinutes?: unknown }>(nextQuote.service_snapshot);
      const durationMinutes = Number(service.durationMinutes);
      if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
        throw new AppError(500, 'INVALID_QUOTE_SNAPSHOT', 'The quote service snapshot is invalid.');
      }
      const nextStartsAt = toDate(nextQuote.starts_at);
      const nextEndsAt = new Date(nextStartsAt.getTime() + durationMinutes * 60_000);
      if (nextEndsAt > toDate(refreshedNext.ends_at)) {
        throw new AppError(409, 'CAPACITY_UNAVAILABLE', 'No capacity is available for this time.');
      }
      const nextExpiry =
        booking.booking_status === 'pending_payment'
          ? new Date(now.getTime() + this.environment.bookingReservationTtlSeconds * 1000)
          : null;

      await transaction('capacity_slots')
        .where({ id: oldSlot.id })
        .where('capacity_reserved', '>', 0)
        .decrement('capacity_reserved', 1);
      await transaction('capacity_slots').where({ id: refreshedNext.id }).increment('capacity_reserved', 1);
      await transaction('capacity_reservations').where({ id: reservation.id }).update({
        capacity_slot_id: refreshedNext.id,
        state: booking.booking_status === 'confirmed' ? 'confirmed' : 'held',
        expires_at: nextExpiry,
        released_at: null,
        release_reason: null,
        updated_at: transaction.fn.now()
      });
      await transaction('bookings').where({ id: booking.id }).update({
        current_quote_id: nextQuote.id,
        capacity_slot_id: refreshedNext.id,
        starts_at: nextStartsAt,
        reservation_expires_at: nextExpiry,
        reschedule_count: booking.reschedule_count + 1,
        updated_at: transaction.fn.now()
      });
      await transaction('jobs').where({ id: job.id }).update({
        starts_at: nextStartsAt,
        ends_at: nextEndsAt,
        version: transaction.raw('version + 1'),
        updated_at: transaction.fn.now()
      });
      await transaction('booking_quote_uses').insert({
        booking_id: booking.id,
        quote_id: nextQuote.id,
        use_type: 'reschedule'
      });
      await transaction('booking_reschedules').insert({
        id: randomUUID(),
        booking_id: booking.id,
        from_quote_id: currentQuote.id,
        to_quote_id: nextQuote.id,
        from_slot_id: oldSlot.id,
        to_slot_id: refreshedNext.id,
        actor_user_id: actor.id,
        reason: input.reason
      });
      await appendAuditEvent(transaction, request, {
        action: 'booking.rescheduled',
        entityType: 'booking',
        entityId: booking.id,
        actorUserId: actor.id,
        before: { quoteId: currentQuote.id, startsAt: booking.starts_at, slotId: oldSlot.id },
        after: { quoteId: nextQuote.id, startsAt: nextStartsAt, slotId: refreshedNext.id },
        reason: input.reason
      });
      const updated = await this.repository.bookingById(transaction, booking.id, actor.id);
      return this.presentBooking(transaction, updated!);
    });
  }

  public async createCleanerAvailability(
    request: Request,
    actor: AuthenticatedUser,
    cleanerId: string,
    input: { startsAt: Date; endsAt: Date; status: 'available' | 'unavailable'; reason: string }
  ) {
    if (input.endsAt <= input.startsAt) {
      throw new AppError(400, 'INVALID_AVAILABILITY_WINDOW', 'Availability end must follow start.');
    }
    return this.repository.transaction(async (transaction) => {
      const staff = await this.repository.staffByIdsForUpdate(transaction, [cleanerId]);
      if (staff[0]?.role !== 'cleaner' || staff[0].status !== 'active') {
        throw new AppError(404, 'NOT_FOUND', 'Cleaner was not found.');
      }
      if (
        (await this.repository.availabilityForWindow(
          transaction,
          cleanerId,
          input.startsAt,
          input.endsAt
        )).length > 0
      ) {
        throw new AppError(409, 'AVAILABILITY_OVERLAP', 'Cleaner availability overlaps an existing window.');
      }
      const id = randomUUID();
      await transaction('cleaner_availability').insert({
        id,
        cleaner_user_id: cleanerId,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        status: input.status,
        created_by: actor.id,
        reason: input.reason
      });
      await appendAuditEvent(transaction, request, {
        action: 'cleaner.availability_created',
        entityType: 'cleaner_availability',
        entityId: id,
        actorUserId: actor.id,
        after: { cleanerId, ...input },
        reason: input.reason
      });
      return { id, cleanerId, ...input };
    });
  }

  public async assignJob(
    request: Request,
    actor: AuthenticatedUser,
    idempotencyKey: string,
    jobId: string,
    input: AssignmentInput
  ): Promise<IdempotentResult<unknown>> {
    const cleanerIds = [...new Set(input.cleanerIds)].sort();
    const hash = payloadHash({
      jobId,
      cleanerIds,
      expectedVersion: input.expectedVersion ?? null,
      reason: input.reason ?? null
    });
    try {
      return await this.repository.transaction(async (transaction) => {
        const idempotency = await this.claimIdempotency(
          transaction,
          actor,
          ASSIGN_JOB_OPERATION,
          idempotencyKey,
          hash
        );
        if (idempotency.resource_id !== null) {
          return {
            data: await this.getJobForActor(transaction, actor, idempotency.resource_id),
            replayed: true
          };
        }
        const job = await this.repository.jobById(transaction, jobId, true);
        if (job === undefined) throw new AppError(404, 'NOT_FOUND', 'Job was not found.');
        const booking = await this.repository.bookingById(transaction, job.booking_id, undefined, true);
        if (booking === undefined) throw new AppError(404, 'NOT_FOUND', 'Job was not found.');
        if (booking.payment_status !== 'paid' || booking.booking_status !== 'confirmed') {
          throw new AppError(
            409,
            'PAYMENT_REQUIRED',
            'A prepaid booking requires verified payment before dispatch.'
          );
        }
        if (!['unassigned', 'assigned'].includes(job.job_state)) {
          throw new AppError(409, 'INVALID_JOB_TRANSITION', 'The job cannot be assigned in its current state.');
        }
        const existing = await this.repository.activeAssignments(transaction, job.id);
        const existingIds = existing.map((assignment) => assignment.cleaner_user_id).sort();
        if (JSON.stringify(existingIds) === JSON.stringify(cleanerIds)) {
          await this.repository.completeIdempotency(transaction, idempotency.id, 'job', job.id, 201);
          return { data: await this.presentJob(transaction, job), replayed: false };
        }
        if (existing.length > 0) {
          if (input.expectedVersion === undefined) {
            throw new AppError(
              409,
              'ASSIGNMENT_VERSION_REQUIRED',
              'Reassignment requires the current job version.'
            );
          }
          if (input.expectedVersion !== job.version) {
            throw new AppError(409, 'JOB_VERSION_CONFLICT', 'The job changed before reassignment.');
          }
          if (input.reason === undefined) {
            throw new AppError(400, 'REASSIGNMENT_REASON_REQUIRED', 'Reassignment requires a reason.');
          }
        }

        const staff = await this.repository.staffByIdsForUpdate(transaction, cleanerIds);
        if (
          staff.length !== cleanerIds.length ||
          staff.some((member) => member.role !== 'cleaner' || member.status !== 'active')
        ) {
          throw new AppError(409, 'CLEANER_UNAVAILABLE', 'One or more cleaners are unavailable.');
        }
        for (const cleanerId of cleanerIds) {
          const windows = await this.repository.availabilityForWindow(
            transaction,
            cleanerId,
            toDate(job.starts_at),
            toDate(job.ends_at)
          );
          const coversJob = windows.some(
            (window) =>
              window.status === 'available' &&
              toDate(window.starts_at) <= toDate(job.starts_at) &&
              toDate(window.ends_at) >= toDate(job.ends_at)
          );
          if (!coversJob || windows.some((window) => window.status === 'unavailable')) {
            throw new AppError(409, 'CLEANER_UNAVAILABLE', 'One or more cleaners are unavailable.');
          }
          if (
            (await this.repository.overlappingAssignment(
              transaction,
              cleanerId,
              job.id,
              toDate(job.starts_at),
              toDate(job.ends_at)
            )) !== undefined
          ) {
            throw new AppError(409, 'CLEANER_ALREADY_ASSIGNED', 'A cleaner has an overlapping job.');
          }
        }

        const now = this.clock.now();
        if (existing.length > 0) {
          await transaction('job_assignments').where({ job_id: job.id }).whereNull('revoked_at').update({
            revoked_at: now,
            revoked_by: actor.id,
            reason: input.reason
          });
        }
        await transaction('job_assignments').insert(
          cleanerIds.map((cleanerId) => ({
            id: randomUUID(),
            job_id: job.id,
            cleaner_user_id: cleanerId,
            assigned_by: actor.id,
            assigned_at: now,
            reason: input.reason ?? null
          }))
        );
        await transaction('jobs').where({ id: job.id }).update({
          job_state: 'assigned',
          version: job.version + 1,
          updated_at: transaction.fn.now()
        });
        await appendAuditEvent(transaction, request, {
          action: existing.length === 0 ? 'job.assigned' : 'job.reassigned',
          entityType: 'job',
          entityId: job.id,
          actorUserId: actor.id,
          before: { cleanerIds: existingIds, version: job.version },
          after: { cleanerIds, version: job.version + 1 },
          ...(input.reason === undefined ? {} : { reason: input.reason })
        });
        await this.repository.completeIdempotency(transaction, idempotency.id, 'job', job.id, 201);
        const updated = await this.repository.jobById(transaction, job.id);
        return { data: await this.presentJob(transaction, updated!), replayed: false };
      });
    } catch (error: unknown) {
      if (isDuplicateEntry(error)) {
        const replay = await this.replayJob(actor, idempotencyKey, hash);
        if (replay !== undefined) return replay;
      }
      throw error;
    }
  }

  public async getJob(actor: AuthenticatedUser, jobId: string) {
    return this.getJobForActor(this.database, actor, jobId);
  }

  public async transitionJob(
    request: Request,
    actor: AuthenticatedUser,
    jobId: string,
    input: JobTransitionInput
  ) {
    return this.repository.transaction(async (transaction) => {
      const job = await this.repository.jobById(transaction, jobId, true);
      if (job === undefined) throw new AppError(404, 'NOT_FOUND', 'Job was not found.');
      const booking = await this.repository.bookingById(transaction, job.booking_id, undefined, true);
      if (booking === undefined) throw new AppError(404, 'NOT_FOUND', 'Job was not found.');
      if (actor.role === 'cleaner') {
        if ((await this.repository.cleanerOwnsJob(transaction, actor.id, job.id)) === undefined) {
          throw new AppError(404, 'NOT_FOUND', 'Job was not found.');
        }
      } else if (!['manager', 'owner'].includes(actor.role)) {
        throw new AppError(403, 'FORBIDDEN', 'This action is not permitted.');
      }
      if (job.version !== input.expectedVersion) {
        throw new AppError(409, 'JOB_VERSION_CONFLICT', 'The job changed before this transition.');
      }
      if (booking.payment_status !== 'paid' || booking.booking_status !== 'confirmed') {
        throw new AppError(
          409,
          'PAYMENT_REQUIRED',
          'A prepaid booking requires verified payment before dispatch.'
        );
      }
      if (!this.transitionAllowed(actor, job.job_state, input.state)) {
        throw new AppError(409, 'INVALID_JOB_TRANSITION', 'The requested job state transition is invalid.');
      }
      if (['delayed', 'exception'].includes(input.state) && input.reason === undefined) {
        throw new AppError(400, 'TRANSITION_REASON_REQUIRED', 'This state transition requires a reason.');
      }

      await transaction('jobs').where({ id: job.id }).update({
        job_state: input.state,
        version: job.version + 1,
        updated_at: transaction.fn.now()
      });
      if (input.state === 'completed') {
        await transaction('bookings').where({ id: booking.id }).update({
          booking_status: 'completed',
          updated_at: transaction.fn.now()
        });
        await transaction('capacity_reservations').where({ booking_id: booking.id }).update({
          state: 'consumed',
          expires_at: null,
          updated_at: transaction.fn.now()
        });
      }
      await appendAuditEvent(transaction, request, {
        action: 'job.state_changed',
        entityType: 'job',
        entityId: job.id,
        actorUserId: actor.id,
        before: { state: job.job_state, version: job.version },
        after: { state: input.state, version: job.version + 1 },
        ...(input.reason === undefined ? {} : { reason: input.reason })
      });
      const updated = await this.repository.jobById(transaction, job.id);
      return this.presentJob(transaction, updated!);
    });
  }

  private async claimIdempotency(
    transaction: Knex.Transaction,
    actor: AuthenticatedUser,
    operation: string,
    key: string,
    hash: string
  ) {
    const row = {
      id: randomUUID(),
      actor_user_id: actor.id,
      operation,
      idempotency_key: key,
      request_hash: hash,
      resource_type: null,
      resource_id: null,
      response_status: null
    };
    try {
      await this.repository.insertIdempotency(transaction, row);
      return row;
    } catch (error: unknown) {
      if (!isDuplicateEntry(error)) throw error;
      const existing = await this.repository.idempotency(
        transaction,
        actor.id,
        operation,
        key,
        true
      );
      if (existing === undefined) throw error;
      if (existing.request_hash !== hash) {
        throw new AppError(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'The idempotency key was already used with a different request.'
        );
      }
      return existing;
    }
  }

  private async replayBooking(actor: AuthenticatedUser, key: string, hash: string) {
    const row = await this.repository.idempotency(
      this.database,
      actor.id,
      CREATE_BOOKING_OPERATION,
      key
    );
    if (row === undefined) return undefined;
    if (row.request_hash !== hash) {
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'The idempotency key was already used with a different request.'
      );
    }
    if (row.resource_id === null) {
      throw new AppError(409, 'IDEMPOTENCY_INCOMPLETE', 'The prior request cannot be replayed.');
    }
    const booking = await this.repository.bookingById(this.database, row.resource_id, actor.id);
    if (booking === undefined) throw new AppError(409, 'IDEMPOTENCY_INCOMPLETE', 'The prior request cannot be replayed.');
    return { data: await this.presentBooking(this.database, booking), replayed: true };
  }

  private async replayJob(actor: AuthenticatedUser, key: string, hash: string) {
    const row = await this.repository.idempotency(
      this.database,
      actor.id,
      ASSIGN_JOB_OPERATION,
      key
    );
    if (row === undefined) return undefined;
    if (row.request_hash !== hash) {
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'The idempotency key was already used with a different request.'
      );
    }
    if (row.resource_id === null) {
      throw new AppError(409, 'IDEMPOTENCY_INCOMPLETE', 'The prior request cannot be replayed.');
    }
    return { data: await this.getJobForActor(this.database, actor, row.resource_id), replayed: true };
  }

  private async releaseExpiredForSlot(
    transaction: Knex.Transaction,
    request: Request,
    slot: CapacitySlotRow,
    now: Date
  ): Promise<void> {
    const expired = await this.repository.expiredReservationsForSlot(transaction, slot.id, now);
    let released = 0;
    for (const reservation of expired) {
      const booking = await this.repository.bookingById(transaction, reservation.booking_id, undefined, true);
      if (booking === undefined || booking.booking_status !== 'pending_payment') continue;
      await transaction('capacity_reservations').where({ id: reservation.id, state: 'held' }).update({
        state: 'released',
        released_at: now,
        release_reason: 'payment_timeout',
        updated_at: transaction.fn.now()
      });
      await transaction('bookings').where({ id: booking.id }).update({
        booking_status: 'expired',
        updated_at: transaction.fn.now()
      });
      await transaction('jobs').where({ booking_id: booking.id }).update({
        job_state: 'cancelled',
        version: transaction.raw('version + 1'),
        updated_at: transaction.fn.now()
      });
      await appendAuditEvent(transaction, request, {
        action: 'booking.reservation_expired',
        entityType: 'booking',
        entityId: booking.id,
        before: { bookingStatus: booking.booking_status, reservationState: 'held' },
        after: { bookingStatus: 'expired', reservationState: 'released' },
        reason: 'payment_timeout'
      });
      released += 1;
    }
    if (released > 0) {
      await transaction('capacity_slots')
        .where({ id: slot.id })
        .where('capacity_reserved', '>=', released)
        .decrement('capacity_reserved', released);
    }
  }

  private async releaseReservation(
    transaction: Knex.Transaction,
    booking: BookingRow,
    reservation: ReservationRow,
    slot: CapacitySlotRow,
    reason: string
  ): Promise<void> {
    await transaction('capacity_reservations').where({ id: reservation.id }).update({
      state: 'released',
      released_at: this.clock.now(),
      release_reason: reason,
      updated_at: transaction.fn.now()
    });
    await transaction('capacity_slots')
      .where({ id: slot.id })
      .where('capacity_reserved', '>', 0)
      .decrement('capacity_reserved', 1);
    void booking;
  }

  private async presentBooking(executor: Knex | Knex.Transaction, booking: BookingRow) {
    const [quote, reservation, job] = await Promise.all([
      executor<QuoteRow>('quotes').where({ id: booking.current_quote_id }).first(),
      this.repository.reservationByBooking(executor, booking.id),
      this.repository.jobByBooking(executor, booking.id)
    ]);
    if (quote === undefined || reservation === undefined || job === undefined) {
      throw new AppError(500, 'BOOKING_STATE_INCOMPLETE', 'Booking scheduling state is incomplete.');
    }
    const startsAt = toDate(booking.starts_at);
    const expiresAt = reservation.expires_at === null ? null : toDate(reservation.expires_at);
    const derivedExpired =
      booking.booking_status === 'pending_payment' &&
      reservation.state === 'held' &&
      expiresAt !== null &&
      expiresAt <= this.clock.now();
    return {
      id: booking.id,
      initialQuoteId: booking.initial_quote_id,
      quoteId: booking.current_quote_id,
      status: derivedExpired ? ('expired' as BookingStatus) : booking.booking_status,
      paymentStatus: booking.payment_status,
      startsAt: startsAt.toISOString(),
      startsAtBusinessTime: accraBusinessParts(startsAt).display,
      rescheduleCount: booking.reschedule_count,
      reservation: {
        state: derivedExpired ? 'released' : reservation.state,
        expiresAt: expiresAt?.toISOString() ?? null
      },
      currency: quote.currency,
      subtotalMinor: numberValue(quote.subtotal_minor),
      tax: {
        basisPoints: quote.tax_basis_points,
        amountMinor: numberValue(quote.tax_minor)
      },
      totalMinor: numberValue(quote.total_minor),
      service: parseJsonValue(quote.service_snapshot),
      address: parseJsonValue(quote.address_snapshot),
      pricing: parseJsonValue(quote.pricing_snapshot),
      policies: parseJsonValue(quote.policy_snapshot),
      job: { id: job.id, state: job.job_state, version: job.version },
      createdAt: toDate(booking.created_at).toISOString(),
      updatedAt: toDate(booking.updated_at).toISOString()
    };
  }

  private async getJobForActor(
    executor: Knex | Knex.Transaction,
    actor: AuthenticatedUser,
    jobId: string
  ) {
    const job = await this.repository.jobById(executor, jobId);
    if (job === undefined) throw new AppError(404, 'NOT_FOUND', 'Job was not found.');
    if (actor.role === 'cleaner') {
      if ((await this.repository.cleanerOwnsJob(executor, actor.id, job.id)) === undefined) {
        throw new AppError(404, 'NOT_FOUND', 'Job was not found.');
      }
    } else if (!['manager', 'owner'].includes(actor.role)) {
      throw new AppError(403, 'FORBIDDEN', 'This action is not permitted.');
    }
    return this.presentJob(executor, job);
  }

  private async presentJob(executor: Knex | Knex.Transaction, job: JobRow) {
    const booking = await this.repository.bookingById(executor, job.booking_id);
    if (booking === undefined) throw new AppError(500, 'BOOKING_STATE_INCOMPLETE', 'Job booking is unavailable.');
    const assignments = await this.repository.activeAssignments(executor, job.id);
    return {
      id: job.id,
      bookingId: booking.id,
      state: job.job_state,
      version: job.version,
      startsAt: toDate(job.starts_at).toISOString(),
      endsAt: toDate(job.ends_at).toISOString(),
      bookingStatus: booking.booking_status,
      paymentStatus: booking.payment_status,
      cleanerIds: assignments.map((assignment) => assignment.cleaner_user_id)
    };
  }

  private transitionAllowed(actor: AuthenticatedUser, from: JobState, to: JobState): boolean {
    const cleanerTransitions: Partial<Record<JobState, JobState[]>> = {
      assigned: ['en_route'],
      en_route: ['started'],
      started: ['completed']
    };
    const managerTransitions: Partial<Record<JobState, JobState[]>> = {
      assigned: ['delayed', 'exception'],
      en_route: ['delayed', 'exception'],
      started: ['delayed', 'exception'],
      delayed: ['assigned', 'exception'],
      exception: ['assigned']
    };
    return (actor.role === 'cleaner' ? cleanerTransitions[from] : managerTransitions[from])?.includes(to) ?? false;
  }
}
