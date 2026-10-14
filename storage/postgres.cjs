const { Pool } = require('pg');

const DEFAULT_SCHEMA = 'project_tracker';
const DEFAULT_TABLE = 'tracker_state';

function safeIdentifier(value, fallback) {
  const candidate = String(value || '').trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate) ? candidate : fallback;
}

function createPostgresStore(options = {}) {
  const connectionString = String(options.connectionString || '').trim();
  if (!connectionString) return null;

  const schema = safeIdentifier(options.schema, DEFAULT_SCHEMA);
  const table = safeIdentifier(options.table, DEFAULT_TABLE);
  const qualifiedTable = `"${schema}"."${table}"`;
  const ssl = String(options.ssl || 'require').toLowerCase() === 'false'
    ? false
    : { rejectUnauthorized: false };
  const pool = new Pool({
    connectionString,
    ssl,
    max: Number(options.maxConnections) || 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  });
  let writeQueue = Promise.resolve();

  async function initialize(localState) {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${qualifiedTable} (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const result = await pool.query(`SELECT payload FROM ${qualifiedTable} WHERE id = $1`, ['default']);
    if (result.rows.length && result.rows[0].payload) return result.rows[0].payload;

    await pool.query(
      `INSERT INTO ${qualifiedTable} (id, payload, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO NOTHING`,
      ['default', JSON.stringify(localState)]
    );
    return localState;
  }

  function save(state) {
    const payload = JSON.stringify(state);
    writeQueue = writeQueue
      .catch(() => undefined)
      .then(() => pool.query(
        `INSERT INTO ${qualifiedTable} (id, payload, updated_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        ['default', payload]
      ));
    return writeQueue;
  }

  async function close() {
    await pool.end();
  }

  return { initialize, save, close, table: `${schema}.${table}` };
}

module.exports = { createPostgresStore };
