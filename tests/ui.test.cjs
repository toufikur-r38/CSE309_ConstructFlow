/* Rendering and event integration checks. Run from the project root: node tests/ui.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..');
const ConstructFlow = require('../core/store.js');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const scriptsOf = html => [...html.matchAll(/<script src="(?:\.\.\/)*([^"]+)" defer><\/script>/g)].map(match => match[1]);
const scripts = scriptsOf(read('index.html')).map(file => new vm.Script(read(file), {filename: file}));

function memoryStorage() {
  const values = new Map();
  return {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value)};
}

function boot(route, storage = memoryStorage()) {
  const listeners = {};
  const elements = new Map();
  const html = read(route.split(/[?#]/)[0]);
  const body = {dataset: {page: html.match(/data-page="([^"]*)"/)[1], root: html.match(/data-root="([^"]*)"/)[1]}};
  let address = new URL('http://localhost/' + route);
  const location = {
    get href() {return address.href;}, set href(value) {address = new URL(value, address.href);},
    get pathname() {return address.pathname;}, get search() {return address.search;},
    get protocol() {return address.protocol;},
    get hash() {return address.hash;}, set hash(value) {address.hash = value;},
    replace(value) {this.href = value;}
  };
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', textContent: '', dataset: {}, focus() {}, close() {}, showModal() {}
    });
    return elements.get(id);
  };
  const document = {
    documentElement: {dataset: {}}, body,
    getElementById: element, querySelector: () => null,
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); }
  };
  const context = vm.createContext({
    document, location, URL, URLSearchParams, Date,
    sessionStorage: memoryStorage(), localStorage: storage,
    window: {addEventListener() {}}, console,
    FormData: class {
      constructor(form) {this.values = form.values;}
      [Symbol.iterator]() {return Object.entries(this.values)[Symbol.iterator]();}
    }
  });
  for (const script of scripts) script.runInContext(context);
  listeners.DOMContentLoaded[0]();
  return {
    html: () => element('content').innerHTML,
    header: () => element('header').innerHTML,
    href: () => location.href,
    message: () => element('message').textContent,
    routes: () => context.CF.ctx.routes,
    submit(name, values, project = '', recordId = '') {
      const target = {dataset: {form: name, project, id: recordId}, values, reportValidity: () => true, closest() {return this;}};
      for (const handler of listeners.submit || []) handler({target, preventDefault() {}});
    },
    action(action, project, recordId) {
      const target = {dataset: {action, project, id: recordId}, closest() {return this;}};
      for (const handler of listeners.click || []) handler({target});
    }
  };
}

// Every app page is a module page: it names a known route and loads the same scripts as index.html.
// Standalone pages (the error page) load no app scripts and are checked in tests/server.test.cjs.
const STANDALONE = ['error.html'];
const routes = boot('index.html').routes();
const htmlFiles = fs.readdirSync(ROOT, {recursive: true}).map(file => file.split(path.sep).join('/'))
  .filter(file => file.endsWith('.html') && !/^(node_modules|\.git)\//.test(file) && !STANDALONE.includes(file));
assert.deepEqual(htmlFiles.slice().sort(), Object.values(routes).sort(), 'Every route has exactly one HTML page');
for (const [route, file] of Object.entries(routes)) {
  const html = read(file);
  assert.equal(html.match(/data-page="([^"]*)"/)[1], route, file);
  assert.equal(html.match(/data-root="([^"]*)"/)[1], file.includes('/') ? '../' : '', file);
  assert.deepEqual(scriptsOf(html), scriptsOf(read('index.html')), file + ' loads the same scripts');
  for (const asset of [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1])) {
    assert.ok(fs.existsSync(path.join(ROOT, path.dirname(file), asset)), file + ' links to missing ' + asset);
  }
}

const storage = memoryStorage();
const store = () => ConstructFlow.createStore(storage);
const today = ConstructFlow.dhakaDay();
const clean = (html, route) => {
  assert.doesNotMatch(html, /undefined|NaN|\[object Object\]|Project records unavailable/, route);
  return html;
};

for (const route of [
  'index.html', 'projects/index.html', 'projects/form.html', 'projects/form.html?project=sample-lakeview',
  'sales/index.html', 'sales/index.html?project=sample-lakeview&status=Booked', 'collections/index.html', 'collections/index.html?project=sample-seabreeze',
  'customers/index.html', 'customers/buyer.html', 'reports/index.html', 'reports/index.html?type=inventory&project=sample-lakeview',
  'reports/index.html?type=pnl&project=sample-lakeview', 'reports/index.html?type=collection', 'procurement/index.html', 'approvals/index.html',
  'expenses/index.html', 'expenses/index.html?project=sample-lakeview', 'expenses/form.html?project=sample-lakeview', 'expenses/form.html',
  'admin/team.html', 'admin/team.html?user=user-admin', 'admin/settings.html', 'admin/activity.html', 'admin/activity.html?filter=costs',
  'expenses/index.html?voided=1', 'admin/profile.html'
]) {
  const app = boot(route, storage);
  assert.ok(clean(app.html(), route).length > 100, route + ' should render');
  assert.match(app.header(), /Dashboard/);
}
const sample = store().snapshot();
const signed = sample.sales.find(sale => sale.projectId === 'sample-lakeview' && sale.status === 'Agreement signed');
for (const route of ['sales/index.html?sale=' + signed.id, 'reports/index.html?type=statement&sale=' + signed.id, 'reports/index.html?type=receipt&receipt=' + sample.receipts[0].id,
  'customers/index.html?customer=' + sample.customers[0].id, 'customers/buyer.html?customer=' + signed.customerId]) {
  clean(boot(route, storage).html(), route);
}

for (const id of ['sample-lakeview', 'sample-seabreeze', 'sample-shapla', 'sample-greenhaven', 'sample-purbachal']) {
  for (const tab of ['overview', 'land', 'permits', 'units', 'sales', 'construction', 'procurement', 'costs', 'handover']) {
    const route = 'projects/workspace.html?project=' + id + '#' + tab;
    clean(boot(route, storage).html(), route);
  }
}
const lakeUnits = boot('projects/workspace.html?project=sample-lakeview#units', storage).html();
assert.match(lakeUnits, /unit-landowner/);
assert.match(lakeUnits, /unit-sold/);
assert.match(boot('projects/workspace.html?project=sample-greenhaven#sales', storage).html(), /Sales blocked/);
assert.match(boot('projects/workspace.html?project=sample-seabreeze#handover', storage).html(), /Open defect/);
assert.match(boot('projects/workspace.html?project=sample-shapla#handover', storage).html(), /Final summary/);
assert.match(boot('projects/workspace.html?project=sample-lakeview#construction', storage).html(), /Gas riser|gas riser/);
const dashboard = boot('index.html', storage).html();
assert.match(dashboard, /Overdue buyers/);
assert.match(dashboard, /৳ [\d.]+ crore/);
assert.match(boot('collections/index.html', storage).html(), /Farzana Akter|Shafiqul Islam/);
assert.match(boot('approvals/index.html', storage).html(), /Gas riser relocation/);
assert.match(boot('procurement/index.html', storage).html(), /Meghna Cement Dealer/);
assert.match(boot('admin/team.html', storage).html(), /Sadia Islam/);

// A new project travels from land to a signed sale through the pages.
const add = boot('projects/form.html', storage);
add.submit('add-project', {name: 'Connected Tower', location: 'Road 1, Gulshan', authority: 'RAJUK', start: ConstructFlow.addDays(today, -30), end: ConstructFlow.addDays(today, 700), costBudget: '30000000'});
const createdId = new URL(add.href()).searchParams.get('project');
assert.ok(createdId, 'Create should navigate to the new project');
assert.match(add.href(), /#land$/);
assert.match(boot('projects/index.html', storage).html(), /Connected Tower/);
const land = boot('projects/workspace.html?project=' + createdId + '#land', storage);
land.submit('landowner', {name: 'Plot Owner', nid: '1980123456', phone: '01722000000'}, createdId);
land.submit('jv', {mouza: 'Gulshan', dagNo: 'RS 9', khatianNo: '10', areaKatha: '4', developerShare: '50', signingMoney: '2000000', monthlyRent: '20000', agreementDate: today, deedNo: 'JV-77'}, createdId);
const overview = boot('projects/workspace.html?project=' + createdId, storage);
overview.action('advance', createdId, '');
overview.action('confirm-advance', createdId, '');
assert.equal(store().project(createdId).status, 'Approval');

const permits = boot('projects/workspace.html?project=' + createdId + '#permits', storage);
for (const type of ConstructFlow.requiredPermits) permits.submit('permit', {type, refNo: 'R-' + type.length, submittedAt: today, fee: '1000'}, createdId);
for (const permit of store().project(createdId).permits) permits.submit('permit-decision', {decision: 'Approved', date: today}, createdId, permit.id);
assert.ok(store().project(createdId).permits.every(permit => permit.status === 'Approved'));

const units = boot('projects/workspace.html?project=' + createdId + '#units', storage);
units.submit('building', {storeys: '2', basements: '0', parkingSlots: '4', code0: 'A', size0: '1200', beds0: '3', code1: 'B', size1: '1200', beds1: '3', code2: '', size2: '', beds2: ''}, createdId);
const labels = Object.fromEntries(store().project(createdId).units.map(item => [item.label, item.id]));
assert.deepEqual(Object.keys(labels), ['1A', '1B', '2A', '2B']);
units.submit('allocate', {['unit_' + labels['1A']]: 'on', ['unit_' + labels['1B']]: 'on'}, createdId);
units.submit('pricing', {ratePerSft: '12000', parkingPrice: '700000', utilityCharge: '150000'}, createdId);
assert.match(boot('projects/workspace.html?project=' + createdId + '&unit=' + labels['2A'] + '#units', storage).html(), /Book this flat/);
boot('projects/workspace.html?project=' + createdId + '#construction', storage).submit('package', {name: 'Structure', quantity: '2', unit: 'slabs', start: today, end: ConstructFlow.addDays(today, 200)}, createdId);

const people = boot('customers/index.html', storage);
people.submit('customer', {name: 'New Buyer', phone: '01733000000', nid: '1990111222', email: '', address: 'Gulshan'});
const buyerId = new URL(people.href()).searchParams.get('customer');
assert.ok(buyerId, 'Adding a customer opens the profile');
const salesTab = boot('projects/workspace.html?project=' + createdId + '#sales', storage);
salesTab.submit('booking', {unitId: labels['2A'], customerId: buyerId, date: today, rate: '12000', parking: '1', bookingMoney: '200000', downPayment: '1000000', discount: '0', planType: 'milestone', installments: '', firstDue: ''}, createdId);
const saleId = new URL(salesTab.href()).searchParams.get('sale');
assert.ok(saleId, 'Booking opens the sale');
const saleView = boot('sales/index.html?sale=' + saleId, storage);
assert.match(clean(saleView.html(), 'sale'), /On completion: Structure/);
saleView.submit('receipt', {amount: '1200000', date: today, method: 'Cheque', ref: 'Cheque 55'}, createdId, saleId);
assert.match(saleView.message(), /MR-\d{4}/);
saleView.submit('agreement', {date: today}, createdId, saleId);
assert.equal(store().snapshot().sales.find(item => item.id === saleId).status, 'Agreement signed');
assert.match(boot('collections/index.html?project=' + createdId, storage).html(), /New Buyer/);
assert.match(boot('customers/buyer.html?customer=' + buyerId, storage).html(), /Welcome, New Buyer/);
assert.match(boot('index.html', storage).html(), /Connected Tower/);

// Links point straight at each module's own page.
assert.match(boot('index.html', storage).header(), /projects\/index\.html\?role=admin/);
assert.match(boot('sales/index.html?sale=' + saleId, storage).html(), /New Buyer/);

// Roles see the same pages but can only change their own records.
const viewer = boot('projects/workspace.html?project=' + createdId + '&role=viewer#costs', storage);
viewer.submit('change', {title: 'Blocked', reason: 'Not allowed', amount: '1'}, createdId);
assert.match(viewer.message(), /role cannot/);
assert.doesNotMatch(boot('projects/index.html?role=viewer', storage).html(), />Start a project</);
const salesRole = boot('sales/index.html?role=sales&sale=' + saleId, storage);
salesRole.submit('receipt', {amount: '1', date: today, method: 'Cash', ref: ''}, createdId, saleId);
assert.match(salesRole.message(), /role cannot/);
assert.match(boot('index.html?role=accounts', storage).html(), /Receive payment/);
assert.match(boot('admin/team.html?role=pm', storage).html(), /Only the Managing Director/);

// Buttons, forms, and navigation follow the role, as the dashboard does.
const tabsOf = (project, role) => ['overview', 'land', 'permits', 'units', 'sales', 'construction', 'procurement', 'costs', 'handover']
  .map(tab => boot('projects/workspace.html?project=' + project + '&role=' + role + '#' + tab, storage).html()).join('\n');
const forms = html => new Set([...html.matchAll(/data-form="([\w-]+)"/g)].map(match => match[1]));
const actions = html => new Set([...html.matchAll(/data-action="([\w-]+)"/g)].map(match => match[1]));
for (const project of ['sample-lakeview', 'sample-seabreeze', 'sample-greenhaven']) {
  const viewerHtml = tabsOf(project, 'viewer');
  assert.deepEqual([...forms(viewerHtml)], [], 'Viewer sees no forms on ' + project);
  assert.deepEqual([...actions(viewerHtml)].filter(name => name !== 'toggle-theme'), [], 'Viewer sees no action buttons on ' + project);
}
const pmForms = forms(tabsOf('sample-lakeview', 'pm'));
assert.ok(pmForms.has('site-log') && pmForms.has('material-request'));
assert.ok(!pmForms.has('booking') && !pmForms.has('receipt') && !pmForms.has('pricing') && !pmForms.has('rfi-response'));
const salesForms = forms(tabsOf('sample-lakeview', 'sales'));
assert.ok(salesForms.has('booking') && salesForms.has('pricing'));
assert.ok(!salesForms.has('site-log') && !salesForms.has('purchase-order') && !salesForms.has('change'));
const lakeSaleId = store().snapshot().sales.find(item => item.status === 'Agreement signed' && item.projectId === 'sample-lakeview').id;
assert.ok(forms(boot('sales/index.html?role=accounts&sale=' + lakeSaleId, storage).html()).has('receipt'));
assert.ok(!forms(boot('sales/index.html?role=sales&sale=' + lakeSaleId, storage).html()).has('receipt'));
assert.ok(!forms(boot('sales/index.html?role=sales&sale=' + lakeSaleId, storage).html()).has('cancel-sale'));
assert.ok(forms(boot('sales/index.html?sale=' + lakeSaleId, storage).html()).has('cancel-sale'));
assert.ok(actions(boot('approvals/index.html', storage).html()).has('approve-change'));
assert.ok(!actions(boot('approvals/index.html?role=pm', storage).html()).has('approve-change'));
const navFor = role => boot('index.html?role=' + role, storage).header();
assert.match(navFor('admin'), />Approvals<[\s\S]*Team/);
assert.doesNotMatch(navFor('pm'), />Sales<|>Customers<|>Collections<|>Approvals<|Team/);
assert.match(navFor('pm'), />Procurement</);
assert.match(navFor('sales'), />Sales<[\s\S]*>Customers</);
assert.doesNotMatch(navFor('sales'), />Approvals<|Settings|Procurement/);
assert.doesNotMatch(navFor('accounts'), />Sales<|>Customers<|>Approvals<|Team/);
assert.match(navFor('accounts'), />Collections<[\s\S]*Expenses/);
assert.doesNotMatch(navFor('viewer'), /Team|Activity log|Settings/);
assert.match(boot('projects/workspace.html?project=sample-lakeview&role=sales', storage).html(), /Viewing as Sales Executive/);

console.log('PASS: every page and project tab renders cleanly; project → JV → permits → flats → booking → receipt → agreement flows through the pages; page links and role restrictions pass.');
