import path from 'path';
import { fileURLToPath } from 'url';
import knexLib from 'knex';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isPostgres = !!process.env.DATABASE_URL;
const sqliteFile = process.env.SQLITE_FILE || path.join(__dirname, '..', 'payments.db');

const knexConfig = isPostgres
  ? {
      client: 'pg',
      connection: process.env.DATABASE_URL,
      pool: { min: 1, max: 5 }
    }
  : {
      client: 'sqlite3',
      connection: { filename: sqliteFile },
      useNullAsDefault: true,
      pool: { min: 1, max: 1 }
    };

const knex = knexLib(knexConfig);

export async function migrate() {
  await knex.migrate.latest({ directory: path.join(__dirname, 'migrations') });
}

function normalizeRow(row) {
  if (!row) return null;
  const out = { ...row };
  // knex/sqlite returns metadata as text; try parse
  if (out.metadata && typeof out.metadata === 'string') {
    try {
      out.metadata = JSON.parse(out.metadata);
    } catch (e) {
      // leave as-is
    }
  }
  return out;
}

export async function createPayment({ payment_id, amount, currency = 'INR', vpa, payee_name, purpose, metadata = {}, webhook_url = null }) {
  const now = new Date().toISOString();
  const record = {
    payment_id,
    amount,
    currency,
    vpa,
    payee_name,
    purpose,
    metadata: isPostgres ? JSON.stringify(metadata) : JSON.stringify(metadata),
    status: 'PENDING',
    txn_id: null,
    created_at: now,
    updated_at: now,
    webhook_url
  };

  await knex('payments').insert(record);
  const saved = await knex('payments').where({ payment_id }).first();
  return normalizeRow(saved);
}

export async function getPaymentById(payment_id) {
  const row = await knex('payments').where({ payment_id }).first();
  return normalizeRow(row);
}

export async function completePayment(payment_id, status, txn_id = null) {
  // idempotency: don't change if already final
  const p = await knex('payments').where({ payment_id }).first();
  if (!p) return null;
  if (p.status === 'SUCCESS' || p.status === 'FAILURE') {
    return normalizeRow(p);
  }
  const updated_at = new Date().toISOString();
  const update = {
    status,
    txn_id: txn_id || `TXN-${Math.random().toString(36).slice(2, 10)}`,
    updated_at
  };
  await knex('payments').where({ payment_id }).update(update);
  const row = await knex('payments').where({ payment_id }).first();
  return normalizeRow(row);
}

export async function listPayments() {
  const rows = await knex('payments').select('*').orderBy('created_at', 'desc');
  return rows.map(normalizeRow);
}

export default knex;
