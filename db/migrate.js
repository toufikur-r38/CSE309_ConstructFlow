/* Applies the SQL files in db/migrations in name order: npm run migrate.
   Applied files are recorded in schema_migrations, so each one runs exactly once.
   Each file runs inside its own transaction: it is applied completely or not at all. */
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, 'migrations');

// migrate(): runs every migration not yet recorded; returns the names it applied.
async function migrate(db) {
  await db.query(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  // The bookkeeping table is also hidden from Supabase's public Data API.
  await db.query('alter table schema_migrations enable row level security');
  await db.query('revoke all on schema_migrations from anon, authenticated');

  const done = new Set((await db.query('select name from schema_migrations')).rows.map(row => row.name));
  const files = fs.readdirSync(DIR).filter(file => /^\d{3}_[\w-]+\.sql$/.test(file)).sort();
  const applied = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
    await db.tx(async client => {
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}

// main(): the command-line entry point.
async function main() {
  const db = require('../server/db');
  try {
    const applied = await migrate(db);
    console.log(applied.length ? 'Applied: ' + applied.join(', ') : 'Database is up to date. Nothing to apply.');
  } finally {
    await db.pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Migration failed, nothing from the failing file was applied: ' + error.message);
    process.exit(1);
  });
}

module.exports = {migrate};
