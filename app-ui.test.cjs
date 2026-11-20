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
for (const route of [
  'index.html', 'view_projects.html', 'add_project.html',
  'edit_project.html?project=demo-1', 'procurement.html', 'approvals.html',
  'view_costs.html', 'view_costs.html?project=demo-1', 'add_cost.html?project=demo-1',
  'edit_cost.html?project=demo-1&cost=cost-1', 'select_cost_project.html',
  'register.html', 'edit_user.html?user=user-admin', 'dropdown_options.html',
  'audit_log.html', 'all_edited_costs.html', 'all_removed_costs.html', 'profile.html'
]) {
  const app = boot(route, storage);
  assert.ok(app.html().length > 100, route + ' should render');
  assert.doesNotMatch(app.html(), /Project records unavailable|Faculty|faculty|assignment|Demo -/, route);
  assert.match(app.header(), /Dashboard/);
}

for (const tab of ['overview', 'contract', 'planning', 'site', 'procurement', 'changes', 'handover']) {
  const app = boot('workspace.html?project=demo-1#' + tab, storage);
  assert.match(app.html(), /Uttara Residential Building/);
  assert.doesNotMatch(app.html(), /Project records unavailable/);
  assert.match(app.html(), /project=demo-1/);
}

for (const id of ['sample-banani', 'sample-dhanmondi', 'sample-chattogram', 'sample-sylhet', 'sample-gazipur']) {
  for (const tab of ['overview', 'contract', 'planning', 'site', 'procurement', 'changes', 'handover']) {
    const example = boot('workspace.html?project=' + id + '#' + tab, storage);
    assert.doesNotMatch(example.html(), /Project records unavailable/);
  }
}
assert.match(boot('approvals.html', storage).html(), /Water line diversion/);
assert.match(boot('procurement.html', storage).html(), /City Steel Traders/);
assert.match(boot('all_removed_costs.html', storage).html(), /Duplicate labor invoice/);
assert.match(boot('all_edited_projects.html', storage).html(), /Client contact and completion date/);
assert.match(boot('all_edited_costs.html', storage).html(), /Labor invoice corrected/);
assert.match(boot('register.html', storage).html(), /Arif Hossain/);

const add = boot('add_project.html', storage);
add.submit('add-project', {
  name: 'Connected project', client: 'Client', location: 'Dhaka', sector: 'Residential',
  start: '2026-11-01', end: '2027-04-30', stage: 'awarded', budget: '2500000'
});
const createdId = new URL(add.href()).searchParams.get('project');
assert.ok(createdId, 'Create should navigate to the new project');
assert.match(boot('index.html', storage).html(), /Connected project/);
assert.match(boot('view_projects.html', storage).html(), /Connected project/);
assert.match(boot('workspace.html?project=' + createdId, storage).html(), /Connected project/);
assert.doesNotMatch(boot('workspace.html', storage).html(), /Uttara.*class="project-header"/);

const expense = boot('add_cost.html?project=' + createdId, storage);
expense.submit('cost', {date: '2026-11-15', category: 'Labor', description: 'New linked expense', quantity: '2', rate: '1250', orderId: ''}, createdId);
assert.match(expense.href(), /view_costs\.html/);
assert.match(boot('view_costs.html?project=' + createdId, storage).html(), /New linked expense/);
assert.doesNotMatch(boot('view_costs.html?project=demo-1', storage).html(), /New linked expense/);
assert.match(boot('workspace.html?project=' + createdId, storage).html(), /BDT 2,500\.00/);

const changes = boot('workspace.html?project=' + createdId + '#changes', storage);
changes.submit('change', {title: 'Client requested addition', reason: 'Additional work', amount: '75000', rfiId: ''}, createdId);
assert.match(boot('approvals.html', storage).html(), /Client requested addition/);
assert.match(boot('index.html', storage).html(), /Client requested addition/);
const model = ConstructFlow.createStore(storage);
const changeId = model.project(createdId).changes[0].id;
boot('approvals.html', storage).action('approve-change', createdId, changeId);
assert.equal(ConstructFlow.createStore(storage).summary(ConstructFlow.createStore(storage).project(createdId)).budget, 2575000);
assert.match(boot('workspace.html?project=' + createdId, storage).html(), /BDT 2,575,000\.00/);

// Exercise the remaining project forms and verify global lists reflect them.
boot('workspace.html?project=' + createdId + '#planning', storage).submit('package', {
  name: 'Construction', quantity: '10', unit: 'units', start: '2026-11-01', end: '2027-04-30'
}, createdId);
const packageId = ConstructFlow.createStore(storage).project(createdId).packages[0].id;
boot('workspace.html?project=' + createdId + '#procurement', storage).submit('material-request', {
  packageId, item: 'Steel', quantity: '5', unit: 'tons'
}, createdId);
assert.match(boot('procurement.html', storage).html(), /Steel/);
const requestId = ConstructFlow.createStore(storage).project(createdId).requests[0].id;
boot('workspace.html?project=' + createdId + '#procurement', storage).submit('purchase-order', {
  requestId, supplier: 'Steel supplier', rate: '5000', expected: '2026-11-16'
}, createdId);
const orderId = ConstructFlow.createStore(storage).project(createdId).orders[0].id;
boot('procurement.html', storage).action('receive-order', createdId, orderId);
assert.match(boot('procurement.html', storage).html(), /Received/);
boot('workspace.html?project=' + createdId + '#site', storage).submit('site-log', {
  packageId, date: '2026-11-16', quantity: '10', notes: 'All work completed', blocker: '', drawingId: ''
}, createdId);
assert.match(boot('index.html', storage).html(), /100%/);
const completing = ConstructFlow.createStore(storage);
for (const key of ['drawings', 'certificates', 'manual']) completing.setDocument(createdId, key, true);
boot('workspace.html?project=' + createdId + '#handover', storage).submit('sign-off', {representative: 'Client representative'}, createdId);
assert.match(boot('view_projects.html', storage).html(), /Handed over/);
assert.match(boot('workspace.html?project=' + createdId + '#handover', storage).html(), /Client acceptance recorded/);
assert.equal(ConstructFlow.createStore(storage).summary(ConstructFlow.createStore(storage).project(createdId)).spending, 2500);

// Local-file links keep all sections on index.html, sharing the same storage.
const fileApp = boot('index.html', storage, 'file:');
assert.match(fileApp.header(), /index\.html\?role=admin&amp;page=view_projects|index\.html\?role=admin&page=view_projects/);
const fileExpense = boot('index.html?page=view_costs&project=' + createdId, storage, 'file:');
assert.match(fileExpense.html(), /New linked expense/);
const fileDirect = boot('workspace.html?project=' + createdId, storage, 'file:');
assert.match(fileDirect.href(), /index\.html\?project=.*page=workspace/);

const viewer = boot('workspace.html?project=' + createdId + '&role=viewer#changes', storage);
viewer.submit('change', {title: 'Blocked', reason: 'Not allowed', amount: '1'}, createdId);
assert.match(viewer.message(), /role cannot/);
assert.doesNotMatch(boot('view_projects.html?role=viewer', storage).html(), />Add project</);

console.log('PASS: routes and sections render; create → dashboard → project → expense → ledger → change → approval stays connected; file-mode navigation and role restrictions pass.');
