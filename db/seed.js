/* Creates (or resets) one demo account per role: npm run seed.
   Every demo account gets the password in SEED_PASSWORD, so no password is ever stored in the code.
   Running it again is safe: existing demo accounts get their name, role, password and projects reset.
   It also REPLACES every business record in app_state with the five sample projects. */
const DEMO_DOMAIN = 'example.com';
const DEMO_ACCOUNTS = [
  {email: 'administrator', name: 'Farhana Chowdhury', role: 'administrator', projects: []},
  {email: 'md', name: 'Mahmud Rahman', role: 'md', projects: []},
  {email: 'pm', name: 'Arif Hossain', role: 'pm', projects: ['sample-lakeview', 'sample-greenhaven']},
  {email: 'sales', name: 'Sadia Islam', role: 'sales', projects: ['sample-lakeview', 'sample-seabreeze', 'sample-greenhaven', 'sample-purbachal']},
  {email: 'accounts', name: 'Kamrul Hasan', role: 'accounts', projects: ['sample-lakeview', 'sample-seabreeze']},
  {email: 'viewer', name: 'Nusrat Jahan', role: 'viewer', projects: ['sample-lakeview']}
].map(account => ({...account, email: `${account.email}@${DEMO_DOMAIN}`}));

// findAuthUsers(): every Supabase Auth account, keyed by email (a demo project has only a handful).
async function findAuthUsers(adminClient) {
  const byEmail = new Map();
  for (let page = 1; ; page++) {
    const {data, error} = await adminClient.auth.admin.listUsers({page, perPage: 1000});
    if (error) throw new Error('Could not list Supabase accounts: ' + error.message);
    for (const user of data.users) if (user.email) byEmail.set(user.email.toLowerCase(), user);
    if (data.users.length < 1000) return byEmail;
  }
}

// seedAccount(): makes sure one demo account exists with the right password, profile and projects.
async function seedAccount(db, adminClient, existing, account, password) {
  let user = existing.get(account.email);
  if (user) {
    const {error} = await adminClient.auth.admin.updateUserById(user.id, {password, ban_duration: 'none', email_confirm: true});
    if (error) throw new Error(`Could not reset ${account.email}: ${error.message}`);
  } else {
    const {data, error} = await adminClient.auth.admin.createUser({email: account.email, password, email_confirm: true});
    if (error) throw new Error(`Could not create ${account.email}: ${error.message}`);
    user = data.user;
  }
  await db.tx(async client => {
    await client.query(`insert into profiles (id, name, email, role, active) values ($1, $2, $3, $4, true)
      on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role, active = true, updated_at = now()`,
    [user.id, account.name, account.email, account.role]);
    await client.query('delete from project_members where user_id = $1', [user.id]);
    if (account.projects.length) {
      await client.query('insert into project_members (project_id, user_id) select unnest($1::text[]), $2', [account.projects, user.id]);
    }
  });
}

// main(): checks the safety rules, then seeds every demo account.
async function main() {
  // config loads .env first, so NODE_ENV and SEED_PASSWORD below include the values from that file.
  const config = require('../server/config');
  if (config.isProduction && !process.argv.includes('--force')) {
    throw new Error('NODE_ENV is production. Seeding resets the demo accounts and replaces all records, so it needs --force: npm run seed -- --force');
  }
  const seedPassword = process.env.SEED_PASSWORD || '';
  if (seedPassword.length < 8) throw new Error('Set SEED_PASSWORD in .env (at least 8 characters). Every demo account signs in with it.');
  const db = require('../server/db');
  const {adminClient} = require('../server/supabase');
  const {saveState} = require('../server/state');
  const {sampleRecords} = require('../core/store.js');
  try {
    await db.tx(client => saveState(client, sampleRecords()));
    console.log('Records replaced with the five sample projects.');
    const existing = await findAuthUsers(adminClient);
    for (const account of DEMO_ACCOUNTS) {
      await seedAccount(db, adminClient, existing, account, seedPassword);
      console.log(`Ready: ${account.email.padEnd(26)} ${account.role}`);
    }
    console.log('Demo accounts are ready. They all sign in with the password in SEED_PASSWORD.');
  } finally {
    await db.pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Seed failed: ' + error.message);
    process.exit(1);
  });
}

module.exports = {DEMO_ACCOUNTS};
