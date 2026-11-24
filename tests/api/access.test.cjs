/* Who may read and change what, checked through real HTTP requests to the real Express app.
   Sign-in and the database are replaced by fakes so this runs offline:
     - the "x-test-role" header picks one of the six demo accounts (same projects as db/seed.js)
     - records live in memory, starting from sampleRecords(), and go through the same runOn()
       the database version uses, so the store rules, permissions and scope are all the real code.
   Run: node --test tests/api/access.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://user:password@127.0.0.1:1/none';
process.env.SUPABASE_URL = 'http://127.0.0.1:1';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable';
process.env.SUPABASE_SECRET_KEY = 'test-secret';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_CA_FILE;

const {createApp} = require('../../server/app');
const db = require('../../server/db');
const {runOn} = require('../../server/state');
const {httpError} = require('../../server/middleware/errors');
const {routes, buildRequest, argsFrom} = require('../../core/routes.js');
const {createStore, sampleRecords, permissions, roles} = require('../../core/store.js');
const {DEMO_ACCOUNTS} = require('../../db/seed.js');

const ORIGIN = 'http://localhost:3000';
const SAMPLE = sampleRecords();
const clone = value => JSON.parse(JSON.stringify(value));

// One user per role, assigned to the same projects as the seeded demo accounts.
const USERS = Object.fromEntries(DEMO_ACCOUNTS.map(account => [account.role, {id: 'user-' + account.role, name: account.name, email: account.email, role: account.role, active: true, projects: account.projects}]));

// fakeAuthenticate(): the x-test-role header stands in for the session cookie. No header → 401.
function fakeAuthenticate(req, res, next) {
  const user = USERS[req.get('x-test-role')];
  if (!user) throw httpError(401);
  req.user = user;
  next();
}

// The in-memory records, reset to the sample before each check.
let data;
const reset = () => { data = clone(SAMPLE); };
const memoryState = {
  readState: async () => data,
  withState: async (actor, fn) => {
    const {result, saved} = runOn(data, actor, fn);
    if (saved) data = JSON.parse(saved);
    return result;
  }
};

let server;
let base;
test.before(async () => {
  server = createApp({api: {authenticate: fakeAuthenticate, state: memoryState}}).listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  await db.pool.end();
});

// as(role).call('bookUnit', 'sample-lakeview', {...}): sends the request the browser will send for that store call.
function as(role) {
  const headers = role ? {'x-test-role': role} : {};
  return {
    async records() {
      const response = await fetch(base + '/api/records', {headers});
      return {status: response.status, body: await response.json()};
    },
    async call(name, ...args) {
      const request = buildRequest(name, args);
      const response = await fetch(base + request.url, {
        method: request.method,
        headers: {...headers, 'content-type': 'application/json', origin: ORIGIN},
        body: JSON.stringify(request.body)
      });
      return {status: response.status, body: await response.json()};
    }
  };
}

const LAKE = 'sample-lakeview';
const lakeSale = SAMPLE.sales.find(sale => sale.projectId === LAKE && sale.status !== 'Cancelled');
const lakeCost = SAMPLE.costs.find(cost => cost.projectId === LAKE);
const seaSale = SAMPLE.sales.find(sale => sale.projectId === 'sample-seabreeze');
const seaCost = SAMPLE.costs.find(cost => cost.projectId === 'sample-seabreeze');

// argsFor(): arguments for each route that point at Lake View (every scoped demo account is on it),
// so the only thing that can refuse the call is the role's permission or a business rule.
function argsFor(name) {
  return routes[name].args.map(arg => {
    if (arg === 'projectId') return LAKE;
    if (arg === 'body') return name === 'addReceipt' ? {saleId: lakeSale.id} : name === 'saveCost' ? {projectId: LAKE} : {};
    if (arg === 'costId') return name === 'voidCost' ? lakeCost.id : '';
    if (arg === 'customerId') return '';
    if (arg === 'kind') return 'categories';
    if (arg.startsWith('body.')) return undefined;
    return 'no-such-id';
  });
}

test('the route table covers every store write, and requests map back to the same arguments', () => {
  const store = createStore({getItem: () => JSON.stringify(SAMPLE), setItem() {}}, 'md');
  const reads = ['role', 'can', 'snapshot', 'project', 'summary', 'finance', 'gateChecks', 'statement', 'packageProgress', 'landShare', 'unitPrice', 'packageCompletedOn'];
  const writes = Object.keys(store).filter(key => !reads.includes(key));
  assert.deepEqual(Object.keys(routes).sort(), writes.sort());

  for (const name of Object.keys(routes)) {
    const args = routes[name].args.map((arg, index) => arg === 'body' ? {n: index} : arg.startsWith('body.') ? 'v' + index : 'id-' + index);
    const request = buildRequest(name, args);
    // The server side: match the URL against the route path to recover the params.
    const pattern = new RegExp('^' + routes[name].path.replace(/\{\/:(\w+)\}/g, '(?:/(?<$1>[^/]+))?').replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
    const match = request.url.match(pattern);
    const params = match && {...match.groups};
    assert.ok(params, name + ' builds a URL its own route matches: ' + request.url);
    assert.deepEqual(argsFrom(name, params, request.body), args, name);
  }
  assert.equal(buildRequest('addCustomer', [{name: 'A'}, '']).url, '/api/customers');
  assert.equal(buildRequest('addCustomer', [{name: 'A'}, 'c 1']).url, '/api/customers/c%201');
});

test('signed out: records and every write answer 401', async () => {
  reset();
  assert.equal((await as(null).records()).status, 401);
  for (const name of Object.keys(routes)) {
    assert.equal((await as(null).call(name, ...argsFor(name))).status, 401, name);
  }
});

test('every role against every route: 403 exactly when the role lacks the permission', async () => {
  for (const role of roles) {
    for (const name of Object.keys(routes)) {
      reset();
      const {status, body} = await as(role).call(name, ...argsFor(name));
      const allowed = permissions[routes[name].need].includes(role);
      if (allowed) {
        assert.ok(status !== 401 && status !== 403 && status < 500, `${role} → ${name} should reach the store rules, got ${status} ${body.error}`);
      } else {
        assert.equal(status, 403, `${role} → ${name} should be refused, got ${status}`);
        assert.equal(body.error, 'You do not have access to this.');
      }
    }
  }
});

test('the Administrator gets 403 on business writes and sees no business data', async () => {
  reset();
  for (const name of Object.keys(routes).filter(key => routes[key].need !== 'settings')) {
    assert.equal((await as('administrator').call(name, ...argsFor(name))).status, 403, name);
  }
  const {status, body} = await as('administrator').records();
  assert.equal(status, 200);
  assert.deepEqual(body.records.projects, SAMPLE.projects.map(project => ({id: project.id, name: project.name})));
  for (const key of ['customers', 'sales', 'receipts', 'costs']) assert.deepEqual(body.records[key], [], key);
  assert.ok(body.records.audit.length > 0, 'the activity log is visible');
  assert.deepEqual(body.records.settings, SAMPLE.settings);
});

test('the MD reads everything', async () => {
  reset();
  const {body} = await as('md').records();
  assert.deepEqual(body.records, SAMPLE);
});

test('a PM reads only assigned projects and is refused on the others', async () => {
  reset();
  const {body} = await as('pm').records();
  const ids = ['sample-lakeview', 'sample-greenhaven'];
  assert.deepEqual(body.records.projects.map(project => project.id).sort(), ids.sort());
  for (const key of ['sales', 'receipts', 'costs', 'audit']) {
    assert.ok(body.records[key].every(row => ids.includes(row.projectId)), key);
  }
  assert.ok(!JSON.stringify(body.records).includes('Sea Breeze Tower'), 'no trace of an unassigned project');

  const refused = await as('pm').call('addPackage', 'sample-seabreeze', {name: 'X', quantity: 1, unit: 'lot', start: '2026-01-01', end: '2026-02-01'});
  assert.equal(refused.status, 403);
  assert.match(refused.body.error, /not assigned to this project/);
  // A project id that does not exist gets the same answer, so ids cannot be probed.
  assert.equal((await as('pm').call('addPackage', 'no-such-project', {})).status, 403);
});

test('writes that name a sale or an expense are checked against that record\'s project', async () => {
  reset();
  // Accounts is on Lake View and Sea Breeze only. Shapla Heights is not theirs.
  const shaplaSale = SAMPLE.sales.find(sale => sale.projectId === 'sample-shapla');
  const receipt = await as('accounts').call('addReceipt', {saleId: shaplaSale.id, amount: 1, method: 'Cash', date: '2026-01-01'});
  assert.equal(receipt.status, 403);
  const expense = await as('accounts').call('saveCost', {projectId: 'sample-shapla', date: '2026-01-01', category: 'Other', description: 'x', quantity: 1, rate: 1});
  assert.equal(expense.status, 403);
  // Editing someone else's expense through your own project is refused by the store rules.
  const moved = await as('accounts').call('saveCost', {projectId: LAKE, date: '2026-01-01', category: 'Other', description: 'x', quantity: 1, rate: 1}, seaCost.id);
  assert.equal(moved.status, 400);
  // A sale or expense that does not exist: 403 for a scoped role, 404 for the MD.
  assert.equal((await as('accounts').call('addReceipt', {saleId: 'no-such-sale'})).status, 403);
  assert.equal((await as('md').call('addReceipt', {saleId: 'no-such-sale'})).status, 404);
  assert.equal((await as('md').call('voidCost', 'no-such-cost')).status, 404);
  void seaSale;
});

test('Accounts sees only customers who bought in their projects; Sales sees all customers', async () => {
  reset();
  const accounts = (await as('accounts').records()).body.records;
  const theirs = new Set(SAMPLE.sales.filter(sale => USERS.accounts.projects.includes(sale.projectId)).map(sale => sale.customerId));
  assert.ok(accounts.customers.length > 0 && accounts.customers.length < SAMPLE.customers.length);
  assert.deepEqual(accounts.customers.map(customer => customer.id).sort(), [...theirs].sort());

  const viewer = (await as('viewer').records()).body.records;
  assert.ok(viewer.customers.every(customer => SAMPLE.sales.some(sale => sale.customerId === customer.id && sale.projectId === LAKE)));

  const sales = (await as('sales').records()).body.records;
  assert.equal(sales.customers.length, SAMPLE.customers.length);
});

test('a write runs the store rules, saves, and records who did it', async () => {
  reset();
  const before = data.receipts.length;
  const statement = createStore({getItem: () => JSON.stringify(data), setItem() {}}, 'md').statement(lakeSale.id);
  const amount = Math.min(1000, statement.balance);
  const response = await as('accounts').call('addReceipt', {saleId: lakeSale.id, date: '2026-11-01', amount, method: 'Cash'});
  assert.equal(response.status, 200, response.body.error);
  assert.equal(response.body.result.amount, amount);
  assert.equal(data.receipts.length, before + 1);
  assert.deepEqual(
    {action: data.audit[0].action, by: data.audit[0].by, role: data.audit[0].role, userId: data.audit[0].userId, projectId: data.audit[0].projectId},
    {action: 'Payment received', by: USERS.accounts.name, role: 'accounts', userId: 'user-accounts', projectId: LAKE}
  );
});

test('business-rule errors come back as 400 with the rule\'s message, and nothing is saved', async () => {
  reset();
  const saved = JSON.stringify(data);
  // Green Haven's building plan is not approved yet, so its flats cannot be sold.
  const unit = SAMPLE.projects.find(project => project.id === 'sample-greenhaven').units[0];
  const response = await as('sales').call('bookUnit', 'sample-greenhaven', {unitId: unit.id, customerId: SAMPLE.customers[0].id, date: '2026-11-01', bookingMoney: 100000, planType: 'monthly', installments: 12, firstDue: '2026-12-01'});
  assert.equal(response.status, 400);
  assert.match(response.body.error, /building plan is approved/);
  assert.equal(JSON.stringify(data), saved);

  // Closed projects are read-only.
  const closed = await as('md').call('addLandowner', 'sample-shapla', {name: 'X', nid: '1234567890', phone: '01711000000'});
  assert.equal(closed.status, 400);
  assert.match(closed.body.error, /closed/);

  // An unknown record inside an allowed project is a 404.
  const missing = await as('md').call('approveDrawing', LAKE, 'no-such-drawing');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'Drawing not found.');
});

test('malformed bodies are a 400, never a crash', async () => {
  reset();
  const send = (path, body) => fetch(base + path, {method: 'PUT', headers: {'x-test-role': 'md', 'content-type': 'application/json', origin: ORIGIN}, body});
  assert.equal((await send('/api/projects/sample-greenhaven/landowner-units', '[1,2]')).status, 400);
  assert.equal((await send('/api/projects/sample-greenhaven/landowner-units', '{"unitIds": "abc"}')).status, 400);
  assert.equal((await send('/api/projects/sample-greenhaven/building', '{"storeys": 3, "types": "A"}')).status, 400);
  const decision = await fetch(base + `/api/projects/${LAKE}/changes/x/decision`, {method: 'POST', headers: {'x-test-role': 'md', 'content-type': 'application/json', origin: ORIGIN}, body: '{"decision": 5}'});
  assert.equal(decision.status, 404);
});

test('unknown API addresses still answer 404, not 401', async () => {
  const response = await fetch(base + '/api/no-such-thing');
  assert.equal(response.status, 404);
});
