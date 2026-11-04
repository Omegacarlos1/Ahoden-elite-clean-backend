import type { Knex } from 'knex';

export async function up(database: Knex): Promise<void> {
  await database.schema.createTable('api_idempotency_keys', (table) => {
    table.uuid('id').primary();
    table.uuid('actor_user_id').notNullable().references('id').inTable('users');
    table.string('operation', 80).notNullable();
    table.string('idempotency_key', 200).notNullable();
    table.string('request_hash', 64).notNullable();
    table.string('resource_type', 50).nullable();
    table.uuid('resource_id').nullable();
    table.smallint('response_status').unsigned().nullable();
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.unique(
      ['actor_user_id', 'operation', 'idempotency_key'],
      'idempotency_actor_operation_key_uq'
    );
    table.index(['created_at']);
  });

  await database.schema.createTable('bookings', (table) => {
    table.uuid('id').primary();
    table.uuid('customer_user_id').notNullable().references('id').inTable('users');
    table.uuid('initial_quote_id').notNullable().references('id').inTable('quotes').unique();
    table.uuid('current_quote_id').notNullable().references('id').inTable('quotes');
    table.uuid('capacity_slot_id').notNullable().references('id').inTable('capacity_slots');
    table
      .enum('booking_status', ['pending_payment', 'confirmed', 'cancelled', 'expired', 'completed'])
      .notNullable()
      .defaultTo('pending_payment');
    table
      .enum('payment_status', ['pending', 'paid', 'failed', 'refunded'])
      .notNullable()
      .defaultTo('pending');
    table.dateTime('reservation_expires_at').nullable();
    table.dateTime('starts_at').notNullable();
    table.smallint('reschedule_count').unsigned().notNullable().defaultTo(0);
    table.string('cancel_reason', 255).nullable();
    table.dateTime('cancelled_at').nullable();
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.timestamp('updated_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.index(['customer_user_id', 'created_at'], 'booking_customer_created_idx');
    table.index(['booking_status', 'starts_at'], 'booking_status_start_idx');
  });

  await database.schema.createTable('booking_quote_uses', (table) => {
    table.uuid('booking_id').notNullable().references('id').inTable('bookings');
    table.uuid('quote_id').notNullable().references('id').inTable('quotes').unique();
    table.enum('use_type', ['initial', 'reschedule']).notNullable();
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.primary(['booking_id', 'quote_id']);
  });

  await database.schema.createTable('capacity_reservations', (table) => {
    table.uuid('id').primary();
    table.uuid('booking_id').notNullable().references('id').inTable('bookings').unique();
    table.uuid('capacity_slot_id').notNullable().references('id').inTable('capacity_slots');
    table.enum('state', ['held', 'released', 'confirmed', 'consumed']).notNullable();
    table.dateTime('expires_at').nullable();
    table.dateTime('released_at').nullable();
    table.string('release_reason', 80).nullable();
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.timestamp('updated_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.index(['state', 'expires_at'], 'reservation_state_expiry_idx');
    table.index(['capacity_slot_id', 'state'], 'reservation_slot_state_idx');
  });

  await database.schema.createTable('jobs', (table) => {
    table.uuid('id').primary();
    table.uuid('booking_id').notNullable().references('id').inTable('bookings').unique();
    table
      .enum('job_state', [
        'awaiting_payment',
        'unassigned',
        'assigned',
        'en_route',
        'started',
        'completed',
        'delayed',
        'exception',
        'cancelled'
      ])
      .notNullable()
      .defaultTo('awaiting_payment');
    table.dateTime('starts_at').notNullable();
    table.dateTime('ends_at').notNullable();
    table.integer('version').unsigned().notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.timestamp('updated_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.index(['job_state', 'starts_at'], 'job_state_start_idx');
  });

  await database.schema.createTable('cleaner_availability', (table) => {
    table.uuid('id').primary();
    table.uuid('cleaner_user_id').notNullable().references('id').inTable('users');
    table.dateTime('starts_at').notNullable();
    table.dateTime('ends_at').notNullable();
    table.enum('status', ['available', 'unavailable']).notNullable();
    table.uuid('created_by').notNullable().references('id').inTable('users');
    table.string('reason', 255).notNullable();
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.index(
      ['cleaner_user_id', 'starts_at', 'ends_at'],
      'cleaner_availability_window_idx'
    );
  });

  await database.schema.createTable('job_assignments', (table) => {
    table.uuid('id').primary();
    table.uuid('job_id').notNullable().references('id').inTable('jobs');
    table.uuid('cleaner_user_id').notNullable().references('id').inTable('users');
    table.uuid('assigned_by').notNullable().references('id').inTable('users');
    table.dateTime('assigned_at').notNullable();
    table.dateTime('revoked_at').nullable();
    table.uuid('revoked_by').nullable().references('id').inTable('users');
    table.string('reason', 255).nullable();
    table.index(['job_id', 'revoked_at'], 'assignment_job_active_idx');
    table.index(['cleaner_user_id', 'revoked_at'], 'assignment_cleaner_active_idx');
  });

  await database.schema.createTable('booking_reschedules', (table) => {
    table.uuid('id').primary();
    table.uuid('booking_id').notNullable().references('id').inTable('bookings');
    table.uuid('from_quote_id').notNullable().references('id').inTable('quotes');
    table.uuid('to_quote_id').notNullable().references('id').inTable('quotes');
    table.uuid('from_slot_id').notNullable().references('id').inTable('capacity_slots');
    table.uuid('to_slot_id').notNullable().references('id').inTable('capacity_slots');
    table.uuid('actor_user_id').notNullable().references('id').inTable('users');
    table.string('reason', 255).notNullable();
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.index(['booking_id', 'created_at'], 'reschedule_booking_created_idx');
  });

  for (const [trigger, table] of [
    ['api_idempotency_no_delete', 'api_idempotency_keys'],
    ['bookings_no_delete', 'bookings'],
    ['booking_quote_uses_no_delete', 'booking_quote_uses'],
    ['capacity_reservations_no_delete', 'capacity_reservations'],
    ['jobs_no_delete', 'jobs'],
    ['cleaner_availability_no_delete', 'cleaner_availability'],
    ['job_assignments_no_delete', 'job_assignments'],
    ['booking_reschedules_no_delete', 'booking_reschedules']
  ] as const) {
    await database.raw(
      `CREATE TRIGGER ${trigger} BEFORE DELETE ON ${table} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${table} records cannot be deleted'`
    );
  }
}

export async function down(database: Knex): Promise<void> {
  for (const trigger of [
    'booking_reschedules_no_delete',
    'job_assignments_no_delete',
    'cleaner_availability_no_delete',
    'jobs_no_delete',
    'capacity_reservations_no_delete',
    'booking_quote_uses_no_delete',
    'bookings_no_delete',
    'api_idempotency_no_delete'
  ]) {
    await database.raw(`DROP TRIGGER IF EXISTS ${trigger}`);
  }

  for (const table of [
    'booking_reschedules',
    'job_assignments',
    'cleaner_availability',
    'jobs',
    'capacity_reservations',
    'booking_quote_uses',
    'bookings',
    'api_idempotency_keys'
  ]) {
    await database.schema.dropTableIfExists(table);
  }
}
