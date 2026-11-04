import type { Knex } from 'knex';

import type { QuoteRow } from '../catalogue/catalogue.repository.js';

export type DatabaseExecutor = Knex | Knex.Transaction;
export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'cancelled'
  | 'expired'
  | 'completed';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type JobState =
  | 'awaiting_payment'
  | 'unassigned'
  | 'assigned'
  | 'en_route'
  | 'started'
  | 'completed'
  | 'delayed'
  | 'exception'
  | 'cancelled';

export interface BookingRow {
  id: string;
  customer_user_id: string;
  initial_quote_id: string;
  current_quote_id: string;
  capacity_slot_id: string;
  booking_status: BookingStatus;
  payment_status: PaymentStatus;
  reservation_expires_at: Date | null;
  starts_at: Date;
  reschedule_count: number;
  cancel_reason: string | null;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CapacitySlotRow {
  id: string;
  service_id: string;
  starts_at: Date;
  ends_at: Date;
  capacity_total: number;
  capacity_reserved: number;
  status: 'active' | 'inactive';
}

export interface ReservationRow {
  id: string;
  booking_id: string;
  capacity_slot_id: string;
  state: 'held' | 'released' | 'confirmed' | 'consumed';
  expires_at: Date | null;
  released_at: Date | null;
  release_reason: string | null;
}

export interface JobRow {
  id: string;
  booking_id: string;
  job_state: JobState;
  starts_at: Date;
  ends_at: Date;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface IdempotencyRow {
  id: string;
  actor_user_id: string;
  operation: string;
  idempotency_key: string;
  request_hash: string;
  resource_type: string | null;
  resource_id: string | null;
  response_status: number | null;
}

export interface StaffRow {
  id: string;
  role: 'customer' | 'cleaner' | 'manager' | 'admin' | 'owner';
  status: 'active' | 'disabled' | 'mfa_pending';
}

export interface AvailabilityRow {
  id: string;
  cleaner_user_id: string;
  starts_at: Date;
  ends_at: Date;
  status: 'available' | 'unavailable';
}

export interface AssignmentRow {
  id: string;
  job_id: string;
  cleaner_user_id: string;
  assigned_by: string;
  assigned_at: Date;
  revoked_at: Date | null;
  revoked_by: string | null;
  reason: string | null;
}

export class BookingsRepository {
  public constructor(private readonly database: Knex) {}

  public transaction<T>(callback: (transaction: Knex.Transaction) => Promise<T>): Promise<T> {
    return this.database.transaction(callback);
  }

  public idempotency(
    executor: DatabaseExecutor,
    actorId: string,
    operation: string,
    key: string,
    lock = false
  ) {
    let query = executor<IdempotencyRow>('api_idempotency_keys').where({
      actor_user_id: actorId,
      operation,
      idempotency_key: key
    });
    if (lock) query = query.forUpdate();
    return query.first();
  }

  public insertIdempotency(
    transaction: Knex.Transaction,
    row: Pick<
      IdempotencyRow,
      'id' | 'actor_user_id' | 'operation' | 'idempotency_key' | 'request_hash'
    >
  ): Promise<number[]> {
    return transaction('api_idempotency_keys').insert(row);
  }

  public async completeIdempotency(
    transaction: Knex.Transaction,
    id: string,
    resourceType: string,
    resourceId: string,
    responseStatus: number
  ): Promise<void> {
    await transaction('api_idempotency_keys').where({ id }).update({
      resource_type: resourceType,
      resource_id: resourceId,
      response_status: responseStatus
    });
  }

  public quoteById(
    executor: DatabaseExecutor,
    id: string,
    customerId: string,
    lock = false
  ) {
    let query = executor<QuoteRow>('quotes').where({ id, customer_user_id: customerId });
    if (lock) query = query.forUpdate();
    return query.first();
  }

  public bookingById(
    executor: DatabaseExecutor,
    id: string,
    customerId?: string,
    lock = false
  ) {
    let query = executor<BookingRow>('bookings').where({ id });
    if (customerId !== undefined) query = query.where({ customer_user_id: customerId });
    if (lock) query = query.forUpdate();
    return query.first();
  }

  public bookingByInitialQuote(executor: DatabaseExecutor, quoteId: string) {
    return executor<BookingRow>('bookings').where({ initial_quote_id: quoteId }).first();
  }

  public quoteUse(executor: DatabaseExecutor, quoteId: string) {
    return executor<{ booking_id: string; quote_id: string }>('booking_quote_uses')
      .where({ quote_id: quoteId })
      .first();
  }

  public capacitySlotForQuote(
    executor: DatabaseExecutor,
    serviceId: string,
    startsAt: Date,
    lock = false
  ) {
    let query = executor<CapacitySlotRow>('capacity_slots').where({
      service_id: serviceId,
      starts_at: startsAt,
      status: 'active'
    });
    if (lock) query = query.forUpdate();
    return query.first();
  }

  public capacitySlotsByIds(transaction: Knex.Transaction, ids: string[]) {
    return transaction<CapacitySlotRow>('capacity_slots')
      .whereIn('id', [...new Set(ids)].sort())
      .orderBy('id')
      .forUpdate();
  }

  public expiredReservationsForSlot(
    transaction: Knex.Transaction,
    slotId: string,
    now: Date
  ) {
    return transaction<ReservationRow>('capacity_reservations')
      .where({ capacity_slot_id: slotId, state: 'held' })
      .where('expires_at', '<=', now)
      .orderBy('id')
      .forUpdate();
  }

  public reservationByBooking(
    executor: DatabaseExecutor,
    bookingId: string,
    lock = false
  ) {
    let query = executor<ReservationRow>('capacity_reservations').where({ booking_id: bookingId });
    if (lock) query = query.forUpdate();
    return query.first();
  }

  public jobByBooking(executor: DatabaseExecutor, bookingId: string, lock = false) {
    let query = executor<JobRow>('jobs').where({ booking_id: bookingId });
    if (lock) query = query.forUpdate();
    return query.first();
  }

  public jobById(executor: DatabaseExecutor, jobId: string, lock = false) {
    let query = executor<JobRow>('jobs').where({ id: jobId });
    if (lock) query = query.forUpdate();
    return query.first();
  }

  public async listBookings(
    customerId: string,
    limit: number,
    offset: number
  ): Promise<{ rows: BookingRow[]; total: number }> {
    const [rows, counts] = await Promise.all([
      this.database<BookingRow>('bookings')
        .where({ customer_user_id: customerId })
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset),
      this.database('bookings')
        .where({ customer_user_id: customerId })
        .count<{ count: string | number }[]>({ count: '*' })
    ]);
    return { rows, total: Number(counts[0]?.count ?? 0) };
  }

  public staffByIdsForUpdate(transaction: Knex.Transaction, ids: string[]) {
    return transaction<StaffRow>('users')
      .select('id', 'role', 'status')
      .whereIn('id', [...new Set(ids)].sort())
      .orderBy('id')
      .forUpdate();
  }

  public availabilityForWindow(
    executor: DatabaseExecutor,
    cleanerId: string,
    startsAt: Date,
    endsAt: Date
  ) {
    return executor<AvailabilityRow>('cleaner_availability')
      .where({ cleaner_user_id: cleanerId })
      .where('starts_at', '<', endsAt)
      .where('ends_at', '>', startsAt)
      .orderBy('created_at', 'desc');
  }

  public activeAssignments(executor: DatabaseExecutor, jobId: string) {
    return executor<AssignmentRow>('job_assignments')
      .where({ job_id: jobId })
      .whereNull('revoked_at')
      .orderBy('cleaner_user_id');
  }

  public overlappingAssignment(
    executor: DatabaseExecutor,
    cleanerId: string,
    jobId: string,
    startsAt: Date,
    endsAt: Date
  ) {
    return executor('job_assignments as assignment')
      .join('jobs as job', 'job.id', 'assignment.job_id')
      .where('assignment.cleaner_user_id', cleanerId)
      .whereNull('assignment.revoked_at')
      .whereNot('job.id', jobId)
      .whereNotIn('job.job_state', ['cancelled', 'completed'])
      .where('job.starts_at', '<', endsAt)
      .where('job.ends_at', '>', startsAt)
      .forUpdate()
      .first('assignment.id');
  }

  public cleanerOwnsJob(executor: DatabaseExecutor, cleanerId: string, jobId: string) {
    return executor('job_assignments')
      .where({ cleaner_user_id: cleanerId, job_id: jobId })
      .whereNull('revoked_at')
      .first('id');
  }
}
