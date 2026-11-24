/* Track A storage: every business record lives in one JSON row, app_state (id = 1).
   A write locks that row, runs the SAME store rules the browser used to run, saves, and commits,
   all in one transaction. Two writes can never overwrite each other, and a failed rule saves nothing. */
const {createStore, STORAGE_KEY} = require('../core/store.js');
const db = require('./db');
const {httpError} = require('./middleware/errors');

const NOT_SEEDED = 'There are no records yet. Run npm run seed to load the sample projects.';

// memoryStorage(): the localStorage-like object createStore expects, holding one records object.
function memoryStorage(data) {
  let saved = JSON.stringify(data);
  let changed = false;
  return {
    getItem: key => key === STORAGE_KEY ? saved : null,
    setItem: (key, value) => {
      if (key !== STORAGE_KEY) return;
      saved = value;
      changed = true;
    },
    get changed() { return changed; },
    get saved() { return saved; }
  };
}

/* runOn(): runs fn(store, data) against a copy of the records, acting as actor (the signed-in user).
   Returns the result and, when the store saved something, the new records as JSON text.
   No database here, so the access tests can use it directly. */
function runOn(data, actor, fn) {
  const storage = memoryStorage(data);
  const store = createStore(storage, actor);
  const result = fn(store, JSON.parse(storage.saved));
  return {result, saved: storage.changed ? storage.saved : null};
}

// readState(): the current records, unfiltered. The caller filters them per user (scope.js).
async function readState() {
  const {rows} = await db.query('select data from app_state where id = 1');
  if (!rows[0]) throw httpError(503, NOT_SEEDED);
  return rows[0].data;
}

// withState(): lock the row, run fn through runOn, save if anything changed, commit.
async function withState(actor, fn) {
  return db.tx(async client => {
    const {rows} = await client.query('select data from app_state where id = 1 for update');
    if (!rows[0]) throw httpError(503, NOT_SEEDED);
    const {result, saved} = runOn(rows[0].data, actor, fn);
    if (saved) await client.query('update app_state set data = $1::jsonb, updated_at = now() where id = 1', [saved]);
    return result;
  });
}

// saveState(): replaces every record (used by the seed script only).
async function saveState(client, data) {
  await client.query(`insert into app_state (id, data) values (1, $1::jsonb)
    on conflict (id) do update set data = excluded.data, updated_at = now()`, [JSON.stringify(data)]);
}

module.exports = {readState, withState, saveState, runOn, memoryStorage, NOT_SEEDED};
