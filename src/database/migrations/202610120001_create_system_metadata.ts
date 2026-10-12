import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('system_metadata', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.string('namespace', 64).notNullable();
    table.string('key_name', 100).notNullable();
    table.json('value_json').notNullable();
    table.timestamp('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
    table.timestamp('updated_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
    table.unique(['namespace', 'key_name'], {
      indexName: 'uq_system_metadata_namespace_key'
    });
    table.index(['namespace'], 'ix_system_metadata_namespace');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('system_metadata');
}
