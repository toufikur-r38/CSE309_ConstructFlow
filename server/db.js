/* The one database connection pool, and a helper for transactions.
   Every query must pass values as parameters ($1, $2 …), never by building SQL strings. */
const fs = require('node:fs');
const {Pool} = require('pg');
const config = require('./config');

// An sslmode in the address would override the ssl settings below, so it is removed and set here instead.
function connectionString(value) {
  try {
    const address = new URL(value);
    address.searchParams.delete('sslmode');
    return address.toString();
  } catch (_) {
    throw new Error('DATABASE_URL is not a valid postgresql:// address. Copy it from Supabase: Connect → Session pooler.');
  }
}

function ssl() {
  // With Supabase's CA certificate the connection is encrypted AND the server's identity is checked.
  if (config.databaseCaFile) return {ca: fs.readFileSync(config.databaseCaFile, 'utf8')};
  // Without it the connection is still encrypted, but the identity is not checked.
  return {rejectUnauthorized: false};
}

const pool = new Pool({
  connectionString: connectionString(config.databaseUrl),
  ssl: ssl(),
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// An idle connection dropped by the database must not crash the server.
pool.on('error', error => console.error('Database connection error:', error.message));

const query = (text, params = []) => pool.query(text, params);

/* Runs fn(client) inside BEGIN … COMMIT. Any error rolls everything back, so nothing is half-saved. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {pool, query, tx};
