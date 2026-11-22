/* Server and error page checks. No real database needed: the address below refuses connections,
   which is exactly what the health check must report. Run: node --test tests/server.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = 'postgresql://user:password@127.0.0.1:1/none';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_CA_FILE;

const ROOT = path.join(__dirname, '..');
const {createApp} = require('../server/app');
const db = require('../server/db');
const errorPage = require('../core/error.js');

let server;
let base;
test.before(async () => {
  server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  await db.pool.end();
});

const get = (route, options) => fetch(base + route, {redirect: 'manual', ...options});

test('serves the app pages and their files', async () => {
  for (const [route, marker] of [['/', 'data-page="dashboard"'], ['/index.html', 'data-page="dashboard"'], ['/sales/index.html', 'data-page="sales"'], ['/projects/workspace.html', 'data-page="project"']]) {
    const response = await get(route);
    assert.equal(response.status, 200, route);
    assert.match(await response.text(), new RegExp(marker), route);
  }
  for (const file of ['/core/app.css', '/core/store.js', '/core/error.js', '/assets/constructflow-logo.png']) {
    assert.equal((await get(file)).status, 200, file);
  }
});

test('never serves server code, secrets, tests, docs or packages', async () => {
  for (const route of ['/.env', '/.env.example', '/.gitignore', '/package.json', '/package-lock.json', '/server/app.js', '/server/config.js',
    '/tests/server.test.cjs', '/docs/BACKEND-PLAN.md', '/node_modules/express/package.json', '/core/../server/app.js', '/core/%2e%2e/server/app.js', '/assets/.hidden']) {
    const response = await get(route);
    assert.equal(response.status, 404, route);
    assert.doesNotMatch(await response.text(), /require\(|DATABASE_URL|"dependencies"/, route);
  }
});

test('unknown pages get the error page with a real 404 status', async () => {
  const response = await get('/no/such/page.html');
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  assert.match(html, /data-code="404"/);
  assert.match(html, /id="error-title"/);
});

test('the API answers in JSON, with plain messages only', async () => {
  const missing = await get('/api/no-such-thing');
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), {error: 'Not found.'});

  const badJson = await get('/api/no-such-thing', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{not json'});
  assert.equal(badJson.status, 400);
  const body = await badJson.json();
  assert.match(body.error, /could not be processed/);
  assert.doesNotMatch(body.error, /Unexpected token|JSON\.parse|at /);

  const tooBig = await get('/api/no-such-thing', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({x: 'a'.repeat(200 * 1024)})});
  assert.equal(tooBig.status, 413);
  assert.equal(tooBig.headers.get('cache-control'), 'no-store');
});

test('health check reports an unreachable database as 503', async () => {
  const response = await get('/api/health');
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {ok: false, database: 'unreachable'});
});

test('sends strict security headers', async () => {
  const response = await get('/');
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|upgrade-insecure-requests/);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('error page: every problem has a title, a reason, steps and buttons', () => {
  for (const code of ['400', '401', '403', '404', '429', '500', '503', 'offline', 'other']) {
    const message = errorPage.pick(code);
    assert.ok(message.title && message.reason, code);
    assert.ok(message.steps.length >= 1 && message.actions.length >= 1, code);
  }
  assert.equal(errorPage.pick('418'), errorPage.MESSAGES.other);
  assert.equal(errorPage.pick(''), errorPage.MESSAGES.other);
  assert.equal(errorPage.pick(404).title, 'Page not found');
  assert.equal(errorPage.pick('OFFLINE'), errorPage.MESSAGES[503]);
});

test('error page: only returns to pages on this site', () => {
  const origin = 'http://localhost:3000';
  assert.equal(errorPage.safeFrom('/sales/index.html?sale=1#x', origin), '/sales/index.html?sale=1#x');
  for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example/', 'javascript:alert(1)', 'sales/index.html', '/error.html?code=404', '', null]) {
    assert.equal(errorPage.safeFrom(bad, origin), '', String(bad));
  }
  const signIn = errorPage.buttons(errorPage.pick(401), '/sales/index.html?sale=1');
  assert.equal(signIn[0].href, '/auth/login.html?from=%2Fsales%2Findex.html%3Fsale%3D1');
  assert.equal(errorPage.buttons(errorPage.pick(500), '')[0].href, '/');
});

test('error page links only to files that exist', () => {
  const html = fs.readFileSync(path.join(ROOT, 'error.html'), 'utf8');
  assert.match(html, /<body[^>]*data-code=""/, 'the server fills in data-code=""');
  for (const asset of [...html.matchAll(/(?:src|href)="\/([^"#?]+)"/g)].map(match => match[1])) {
    assert.ok(fs.existsSync(path.join(ROOT, asset)), 'error.html links to missing ' + asset);
  }
});
