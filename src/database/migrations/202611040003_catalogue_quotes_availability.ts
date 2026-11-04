import type { Knex } from 'knex';

export async function up(database: Knex): Promise<void> {
  await database.schema.createTable('services', (table) => {
    table.uuid('id').primary();
    table.string('code', 50).notNullable().unique();
    table.string('name', 120).notNullable();
    table.string('description', 1000).notNullable();
    table.smallint('duration_minutes').unsigned().notNullable();
    table.enum('status', ['draft', 'active', 'inactive']).notNullable().defaultTo('draft');
    table.boolean('development_only').notNullable().defaultTo(true);
    table.enum('recurrence_mode', ['one_time', 'recurring']).notNullable().defaultTo('one_time');
    table.enum('recurrence_unit', ['week', 'month']).nullable();
    table.smallint('recurrence_interval').unsigned().nullable();
    table.string('approval_reference', 120).nullable();
    table.uuid('created_by').notNullable().references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.timestamp('updated_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.index(['status', 'development_only']);
  });

  await database.schema.createTable('service_price_versions', (table) => {
    table.uuid('id').primary();
    table.uuid('service_id').notNullable().references('id').inTable('services');
    table.integer('version').unsigned().notNullable();
    table.string('currency', 3).notNullable().defaultTo('GHS');
    table.bigInteger('base_amount_minor').unsigned().notNullable();
    table.smallint('included_bedrooms').unsigned().notNullable().defaultTo(1);
    table.bigInteger('bedroom_surcharge_minor').unsigned().notNullable().defaultTo(0);
    table.smallint('tax_basis_points').unsigned().notNullable().defaultTo(0);
    table.dateTime('effective_from').notNullable();
    table.dateTime('effective_to').nullable();
    table.boolean('development_only').notNullable().defaultTo(true);
    table.string('approval_reference', 120).nullable();
    table.uuid('approved_by').notNullable().references('id').inTable('users');
    table.timestamp('approved_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.unique(['service_id', 'version']);
    table.index(['service_id', 'effective_from', 'effective_to'], 'price_service_effective_idx');
  });

  await database.schema.createTable('service_zones', (table) => {
    table.uuid('id').primary();
    table.string('code', 50).notNullable().unique();
    table.string('name', 120).notNullable();
    table.string('region', 120).notNullable();
    table.string('region_normalized', 120).notNullable();
    table.enum('status', ['active', 'inactive']).notNullable().defaultTo('inactive');
    table.boolean('development_only').notNullable().defaultTo(true);
    table.string('approval_reference', 120).nullable();
    table.uuid('created_by').notNullable().references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.timestamp('updated_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.index(['region_normalized', 'status']);
  });

  await database.schema.createTable('service_zone_localities', (table) => {
    table.uuid('zone_id').notNullable().references('id').inTable('service_zones').onDelete('CASCADE');
    table.string('locality', 120).notNullable();
    table.string('locality_normalized', 120).notNullable();
    table.primary(['zone_id', 'locality_normalized']);
    table.index(['locality_normalized']);
  });

  await database.schema.createTable('service_zone_assignments', (table) => {
    table.uuid('service_id').notNullable().references('id').inTable('services').onDelete('CASCADE');
    table.uuid('zone_id').notNullable().references('id').inTable('service_zones').onDelete('CASCADE');
    table.uuid('assigned_by').notNullable().references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.primary(['service_id', 'zone_id']);
  });

  await database.schema.createTable('business_hours', (table) => {
    table.uuid('id').primary();
    table.tinyint('day_of_week').unsigned().notNullable();
    table.smallint('opens_minute').unsigned().notNullable();
    table.smallint('closes_minute').unsigned().notNullable();
    table.date('effective_from').notNullable();
    table.date('effective_to').nullable();
    table.boolean('development_only').notNullable().defaultTo(true);
    table.string('approval_reference', 120).nullable();
    table.uuid('approved_by').notNullable().references('id').inTable('users');
    table.timestamp('approved_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.index(['day_of_week', 'effective_from', 'effective_to'], 'hours_day_effective_idx');
  });

  await database.schema.createTable('capacity_slots', (table) => {
    table.uuid('id').primary();
    table.uuid('service_id').notNullable().references('id').inTable('services');
    table.dateTime('starts_at').notNullable();
    table.dateTime('ends_at').notNullable();
    table.smallint('capacity_total').unsigned().notNullable();
    table.smallint('capacity_reserved').unsigned().notNullable().defaultTo(0);
    table.enum('status', ['active', 'inactive']).notNullable().defaultTo('active');
    table.boolean('development_only').notNullable().defaultTo(true);
    table.string('approval_reference', 120).nullable();
    table.uuid('created_by').notNullable().references('id').inTable('users');
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.unique(['service_id', 'starts_at']);
    table.index(['service_id', 'starts_at', 'status'], 'capacity_service_start_idx');
  });

  await database.schema.createTable('customer_addresses', (table) => {
    table.uuid('id').primary();
    table.uuid('customer_user_id').notNullable().references('id').inTable('users');
    table.string('label', 80).notNullable();
    table.string('address_line1', 255).notNullable();
    table.string('address_line2', 255).nullable();
    table.string('locality', 120).notNullable();
    table.string('locality_normalized', 120).notNullable();
    table.string('region', 120).notNullable();
    table.string('region_normalized', 120).notNullable();
    table.string('postal_code', 30).nullable();
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.timestamp('updated_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.index(['customer_user_id', 'created_at']);
  });

  await database.schema.createTable('policy_versions', (table) => {
    table.uuid('id').primary();
    table.enum('policy_type', ['cancellation', 'rescheduling', 'reclean', 'recurring']).notNullable();
    table.integer('version').unsigned().notNullable();
    table.string('title', 160).notNullable();
    table.json('rules_json').notNullable();
    table.dateTime('effective_from').notNullable();
    table.dateTime('effective_to').nullable();
    table.boolean('development_only').notNullable().defaultTo(true);
    table.string('approval_reference', 120).nullable();
    table.uuid('approved_by').notNullable().references('id').inTable('users');
    table.timestamp('approved_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.unique(['policy_type', 'version']);
    table.index(['policy_type', 'effective_from', 'effective_to'], 'policy_type_effective_idx');
  });

  await database.schema.createTable('quotes', (table) => {
    table.uuid('id').primary();
    table.uuid('customer_user_id').notNullable().references('id').inTable('users');
    table.uuid('service_id').notNullable().references('id').inTable('services');
    table.uuid('address_id').notNullable().references('id').inTable('customer_addresses');
    table.uuid('price_version_id').notNullable().references('id').inTable('service_price_versions');
    table.dateTime('starts_at').notNullable();
    table.dateTime('expires_at').notNullable();
    table.string('currency', 3).notNullable();
    table.bigInteger('subtotal_minor').unsigned().notNullable();
    table.smallint('tax_basis_points').unsigned().notNullable();
    table.bigInteger('tax_minor').unsigned().notNullable();
    table.bigInteger('total_minor').unsigned().notNullable();
    table.json('inputs_snapshot').notNullable();
    table.json('service_snapshot').notNullable();
    table.json('address_snapshot').notNullable();
    table.json('pricing_snapshot').notNullable();
    table.json('policy_snapshot').notNullable();
    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(database.fn.now());
    table.index(['customer_user_id', 'created_at']);
    table.index(['service_id', 'starts_at']);
  });

  await database.raw("CREATE TRIGGER quotes_no_update BEFORE UPDATE ON quotes FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'quotes are immutable snapshots'");
  await database.raw("CREATE TRIGGER quotes_no_delete BEFORE DELETE ON quotes FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'quotes are immutable snapshots'");
}

export async function down(database: Knex): Promise<void> {
  await database.raw('DROP TRIGGER IF EXISTS quotes_no_delete');
  await database.raw('DROP TRIGGER IF EXISTS quotes_no_update');
  for (const table of [
    'quotes',
    'policy_versions',
    'customer_addresses',
    'capacity_slots',
    'business_hours',
    'service_zone_assignments',
    'service_zone_localities',
    'service_zones',
    'service_price_versions',
    'services'
  ]) {
    await database.schema.dropTableIfExists(table);
  }
}
