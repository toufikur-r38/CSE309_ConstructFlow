/* Rendering and event integration checks. Browser layout checks are separate. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ConstructFlow = require('./app-store.js');
const source = fs.readFileSync('app.js', 'utf8');

function memoryStorage() {
  const values = new Map();
  return {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value)};
}

function boot(route, storage = memoryStorage(), protocol = 'http:') {
  const listeners = {};
  const elements = new Map();
  let address = new URL(protocol === 'file:' ? 'file:///D:/ConstructFlow/' + route : 'http://localhost/' + route);
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
    documentElement: {dataset: {}},
    getElementById: element, querySelector: () => null,
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); }
  };
  const context = vm.createContext({
    document, location, URL, URLSearchParams, Date, ConstructFlow,
    sessionStorage: memoryStorage(), localStorage: storage,
    window: {addEventListener() {}}, console,
    FormData: class {
      constructor(form) {this.values = form.values;}
      [Symbol.iterator]() {return Object.entries(this.values)[Symbol.iterator]();}
    }
  });
  new vm.Script(source, {filename: 'app.js'}).runInContext(context);
  listeners.DOMContentLoaded[0]();
  return {
    html: () => element('content').innerHTML,
    header: () => element('header').innerHTML,
    href: () => location.href,
    message: () => element('message').textContent,
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

const storage = memoryStorage();
const store = () => ConstructFlow.createStore(storage);
const today = ConstructFlow.dhakaDay();
const clean = (html, route) => {
  assert.doesNotMatch(html, /undefined|NaN|\[object Object\]|Project records unavailable/, route);
  return html;
};

for (const route of [
  'index.html', 'view_projects.html', 'add_project.html', 'edit_project.html?project=sample-lakeview',
  'sales.html', 'sales.html?project=sample-lakeview&status=Booked', 'collections.html', 'collections.html?project=sample-seabreeze',
  'customers.html', 'buyer.html', 'reports.html', 'reports.html?type=inventory&project=sample-lakeview',
  'reports.html?type=pnl&project=sample-lakeview', 'reports.html?type=collection', 'procurement.html', 'approvals.html',
  'view_costs.html', 'view_costs.html?project=sample-lakeview', 'add_cost.html?project=sample-lakeview', 'select_cost_project.html',
  'register.html', 'edit_user.html?user=user-admin', 'dropdown_options.html', 'audit_log.html', 'all_edited_costs.html',
  'all_removed_costs.html', 'profile.html', 'login.html', 'error.html'
]) {
  const app = boot(route, storage);
  assert.ok(clean(app.html(), route).length > 100, route + ' should render');
  assert.match(app.header(), /Dashboard/);
}
const sample = store().snapshot();
const signed = sample.sales.find(sale => sale.projectId === 'sample-lakeview' && sale.status === 'Agreement signed');
for (const route of ['sales.html?sale=' + signed.id, 'reports.html?type=statement&sale=' + signed.id, 'reports.html?type=receipt&receipt=' + sample.receipts[0].id,
  'customers.html?customer=' + sample.customers[0].id, 'buyer.html?customer=' + signed.customerId]) {
  clean(boot(route, storage).html(), route);
}

for (const id of ['sample-lakeview', 'sample-seabreeze', 'sample-shapla', 'sample-greenhaven', 'sample-purbachal']) {
  for (const tab of ['overview', 'land', 'permits', 'units', 'sales', 'construction', 'procurement', 'costs', 'handover']) {
    const route = 'workspace.html?project=' + id + '#' + tab;
    clean(boot(route, storage).html(), route);
  }
}
const lakeUnits = boot('workspace.html?project=sample-lakeview#units', storage).html();
assert.match(lakeUnits, /unit-landowner/);
assert.match(lakeUnits, /unit-sold/);
assert.match(boot('workspace.html?project=sample-greenhaven#sales', storage).html(), /Sales blocked/);
assert.match(boot('workspace.html?project=sample-seabreeze#handover', storage).html(), /Open defect/);
assert.match(boot('workspace.html?project=sample-shapla#handover', storage).html(), /Final summary/);
assert.match(boot('workspace.html?project=sample-lakeview#construction', storage).html(), /Gas riser|gas riser/);
const dashboard = boot('index.html', storage).html();
assert.match(dashboard, /Overdue buyers/);
assert.match(dashboard, /৳ [\d.]+ crore/);
assert.match(boot('collections.html', storage).html(), /Farzana Akter|Shafiqul Islam/);
assert.match(boot('approvals.html', storage).html(), /Gas riser relocation/);
assert.match(boot('procurement.html', storage).html(), /Meghna Cement Dealer/);
assert.match(boot('register.html', storage).html(), /Sadia Islam/);

// A new project travels from land to a signed sale through the pages.
const add = boot('add_project.html', storage);
add.submit('add-project', {name: 'Connected Tower', location: 'Road 1, Gulshan', authority: 'RAJUK', start: ConstructFlow.addDays(today, -30), end: ConstructFlow.addDays(today, 700), costBudget: '30000000'});
const createdId = new URL(add.href()).searchParams.get('project');
assert.ok(createdId, 'Create should navigate to the new project');
assert.match(add.href(), /#land$/);
assert.match(boot('view_projects.html', storage).html(), /Connected Tower/);
const land = boot('workspace.html?project=' + createdId + '#land', storage);
land.submit('landowner', {name: 'Plot Owner', nid: '1980123456', phone: '01722000000'}, createdId);
land.submit('jv', {mouza: 'Gulshan', dagNo: 'RS 9', khatianNo: '10', areaKatha: '4', developerShare: '50', signingMoney: '2000000', monthlyRent: '20000', agreementDate: today, deedNo: 'JV-77'}, createdId);
const overview = boot('workspace.html?project=' + createdId, storage);
overview.action('advance', createdId, '');
overview.action('confirm-advance', createdId, '');
assert.equal(store().project(createdId).status, 'Approval');

const permits = boot('workspace.html?project=' + createdId + '#permits', storage);
for (const type of ConstructFlow.requiredPermits) permits.submit('permit', {type, refNo: 'R-' + type.length, submittedAt: today, fee: '1000'}, createdId);
for (const permit of store().project(createdId).permits) permits.submit('permit-decision', {decision: 'Approved', date: today}, createdId, permit.id);
assert.ok(store().project(createdId).permits.every(permit => permit.status === 'Approved'));

const units = boot('workspace.html?project=' + createdId + '#units', storage);
units.submit('building', {storeys: '2', basements: '0', parkingSlots: '4', code0: 'A', size0: '1200', beds0: '3', code1: 'B', size1: '1200', beds1: '3', code2: '', size2: '', beds2: ''}, createdId);
const labels = Object.fromEntries(store().project(createdId).units.map(item => [item.label, item.id]));
assert.deepEqual(Object.keys(labels), ['1A', '1B', '2A', '2B']);
units.submit('allocate', {['unit_' + labels['1A']]: 'on', ['unit_' + labels['1B']]: 'on'}, createdId);
units.submit('pricing', {ratePerSft: '12000', parkingPrice: '700000', utilityCharge: '150000'}, createdId);
assert.match(boot('workspace.html?project=' + createdId + '&unit=' + labels['2A'] + '#units', storage).html(), /Book this flat/);
boot('workspace.html?project=' + createdId + '#construction', storage).submit('package', {name: 'Structure', quantity: '2', unit: 'slabs', start: today, end: ConstructFlow.addDays(today, 200)}, createdId);

const people = boot('customers.html', storage);
people.submit('customer', {name: 'New Buyer', phone: '01733000000', nid: '1990111222', email: '', address: 'Gulshan'});
const buyerId = new URL(people.href()).searchParams.get('customer');
assert.ok(buyerId, 'Adding a customer opens the profile');
const salesTab = boot('workspace.html?project=' + createdId + '#sales', storage);
salesTab.submit('booking', {unitId: labels['2A'], customerId: buyerId, date: today, rate: '12000', parking: '1', bookingMoney: '200000', downPayment: '1000000', discount: '0', planType: 'milestone', installments: '', firstDue: ''}, createdId);
const saleId = new URL(salesTab.href()).searchParams.get('sale');
assert.ok(saleId, 'Booking opens the sale');
const saleView = boot('sales.html?sale=' + saleId, storage);
assert.match(clean(saleView.html(), 'sale'), /On completion: Structure/);
saleView.submit('receipt', {amount: '1200000', date: today, method: 'Cheque', ref: 'Cheque 55'}, createdId, saleId);
assert.match(saleView.message(), /MR-\d{4}/);
saleView.submit('agreement', {date: today}, createdId, saleId);
assert.equal(store().snapshot().sales.find(item => item.id === saleId).status, 'Agreement signed');
assert.match(boot('collections.html?project=' + createdId, storage).html(), /New Buyer/);
assert.match(boot('buyer.html?customer=' + buyerId, storage).html(), /Welcome, New Buyer/);
assert.match(boot('index.html', storage).html(), /Connected Tower/);

// Local-file links keep all sections on index.html, sharing the same storage.
const fileApp = boot('index.html', storage, 'file:');
assert.match(fileApp.header(), /index\.html\?role=admin&amp;page=view_projects|index\.html\?role=admin&page=view_projects/);
assert.match(boot('index.html?page=sales&sale=' + saleId, storage, 'file:').html(), /New Buyer/);
assert.match(boot('workspace.html?project=' + createdId, storage, 'file:').href(), /index\.html\?project=.*page=workspace/);

// Roles see the same pages but can only change their own records.
const viewer = boot('workspace.html?project=' + createdId + '&role=viewer#costs', storage);
viewer.submit('change', {title: 'Blocked', reason: 'Not allowed', amount: '1'}, createdId);
assert.match(viewer.message(), /role cannot/);
assert.doesNotMatch(boot('view_projects.html?role=viewer', storage).html(), />Start a project</);
const salesRole = boot('sales.html?role=sales&sale=' + saleId, storage);
salesRole.submit('receipt', {amount: '1', date: today, method: 'Cash', ref: ''}, createdId, saleId);
assert.match(salesRole.message(), /role cannot/);
assert.match(boot('index.html?role=accounts', storage).html(), /Receive payment/);
assert.match(boot('register.html?role=pm', storage).html(), /Only the Managing Director/);

console.log('PASS: every page and project tab renders cleanly; project → JV → permits → flats → booking → receipt → agreement flows through the pages; file-mode navigation and role restrictions pass.');
