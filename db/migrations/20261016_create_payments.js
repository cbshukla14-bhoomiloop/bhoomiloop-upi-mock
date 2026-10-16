exports.up = function(knex) {
  return knex.schema.createTable('payments', function(table) {
    table.uuid('payment_id').primary();
    table.decimal('amount', 14, 2).notNullable();
    table.string('currency', 10).defaultTo('INR');
    table.string('vpa');
    table.string('payee_name');
    table.string('purpose');
    table.text('metadata');
    table.string('status');
    table.string('txn_id');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.string('webhook_url');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('payments');
};
