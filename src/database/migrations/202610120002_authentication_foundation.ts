import type { Knex } from 'knex';

export async function up(database: Knex): Promise<void> {
  await database.schema.createTable('users', (table) => {
    table.uuid('id').primary();
    table.string('email', 254).notNullable().unique();
    table.string('display_name', 120).notNullable();
    table.text('password_hash').notNullable();
    table.enum('role', ['customer', 'cleaner', 'manager', 'admin', 'owner']).notNullable();
    table.enum('status', ['active', 'disabled', 'mfa_pending']).notNullable().defaultTo('active');
    table.text('mfa_secret_encrypted').nullable();
    table.timestamp('mfa_verified_at', { useTz: false }).nullable();
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.timestamp('updated_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
  });

  await database.schema.createTable('auth_sessions', (table) => {
    table.uuid('id').primary();
    table.uuid('family_id').notNullable().index();
    table.uuid('user_id').notNullable().references('id').inTable('users');
    table.string('refresh_token_hash', 64).notNullable().unique();
    table.string('csrf_token_hash', 64).notNullable();
    table.timestamp('expires_at', { useTz: false }).notNullable();
    table.timestamp('used_at', { useTz: false }).nullable();
    table.timestamp('revoked_at', { useTz: false }).nullable();
    table.uuid('replaced_by_id').nullable();
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
  });

  await database.schema.createTable('password_reset_tokens', (table) => {
    table.uuid('id').primary();
    table.uuid('user_id').notNullable().references('id').inTable('users');
    table.string('token_hash', 64).notNullable().unique();
    table.timestamp('expires_at', { useTz: false }).notNullable();
    table.timestamp('used_at', { useTz: false }).nullable();
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
  });

  await database.schema.createTable('staff_invitations', (table) => {
    table.uuid('id').primary();
    table.string('email', 254).notNullable();
    table.enum('role', ['cleaner', 'manager', 'admin']).notNullable();
    table.string('token_hash', 64).notNullable().unique();
    table.uuid('invited_by').notNullable().references('id').inTable('users');
    table.timestamp('expires_at', { useTz: false }).notNullable();
    table.timestamp('accepted_at', { useTz: false }).nullable();
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
  });

  await database.schema.createTable('mfa_recovery_codes', (table) => {
    table.uuid('id').primary();
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('code_hash', 64).notNullable();
    table.timestamp('used_at', { useTz: false }).nullable();
    table.unique(['user_id', 'code_hash']);
  });

  await database.schema.createTable('owner_bootstrap', (table) => {
    table.integer('singleton_id').primary();
    table.uuid('owner_user_id').notNullable().references('id').inTable('users');
    table.timestamp('used_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
  });

  await database.schema.createTable('audit_events', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('actor_user_id').nullable();
    table.string('action', 100).notNullable();
    table.string('entity_type', 80).notNullable();
    table.string('entity_id', 64).notNullable();
    table.json('before_state').nullable();
    table.json('after_state').nullable();
    table.string('reason', 255).nullable();
    table.string('request_id', 128).nullable();
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.index(['entity_type', 'entity_id', 'created_at']);
  });

  await database.raw("CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit events are append-only'");
  await database.raw("CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit events are append-only'");
}

export async function down(database: Knex): Promise<void> {
  await database.raw('DROP TRIGGER IF EXISTS audit_events_no_delete');
  await database.raw('DROP TRIGGER IF EXISTS audit_events_no_update');
  for (const table of ['audit_events', 'owner_bootstrap', 'mfa_recovery_codes', 'staff_invitations', 'password_reset_tokens', 'auth_sessions', 'users']) {
    await database.schema.dropTableIfExists(table);
  }
}
