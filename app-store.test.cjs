/* Run from this directory: node app-store.test.cjs */
const assert = require('node:assert/strict');
const {createStore, STORAGE_KEY} = require('./app-store.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
}

const storage = memoryStorage();
const admin = createStore(storage);
const newProject = (name, stage = 'awarded') => admin.addProject({
  name, stage, client: 'Client Ltd.', location: 'Dhaka', sector: 'Commercial',
  start: '2026-11-01', end: '2027-04-30', budget: 1000000
});
const current = project => admin.project(project.id);
const last = items => items[items.length - 1];

assert.equal(admin.summary(admin.project('demo-1')).spending, 149000);
assert.equal(admin.summary(admin.project('demo-2')).spending, 296000);

// Example projects cover each screen with linked, consistent records.
const examples = admin.snapshot();
assert.equal(examples.projects.filter(item => item.id.startsWith('sample-')).length, 5);
assert.ok(examples.audit.length > 0);
assert.ok(examples.users.some(user => user.role === 'operator'));
assert.ok(examples.users.some(user => user.role === 'viewer'));
const renovation = admin.project('sample-dhanmondi');
assert.equal(admin.summary(renovation).budget, 1845000);
assert.equal(admin.summary(renovation).spending, 77500);
assert.equal(admin.summary(renovation).pending, 1);
assert.ok(renovation.rfis.some(rfi => !rfi.response));
assert.equal(admin.summary(admin.project('sample-sylhet')).progress, 100);
assert.ok(admin.handoverChecks(admin.project('sample-sylhet')).every(check => check.done));
assert.ok(!admin.handoverChecks(admin.project('sample-chattogram')).every(check => check.done));
for (const sample of examples.projects.filter(item => item.id.startsWith('sample-'))) {
  for (const entry of sample.logs) assert.ok(sample.packages.some(item => item.id === entry.packageId));
  for (const rfi of sample.rfis) assert.ok(sample.logs.some(entry => entry.id === rfi.logId));
  for (const order of sample.orders) {
    const request = sample.requests.find(item => item.id === order.requestId);
    assert.ok(request);
    if (order.receivedAt) assert.ok(request.at <= order.receivedAt);
  }
  for (const cost of examples.costs.filter(item => item.projectId === sample.id && item.orderId)) {
    assert.ok(sample.orders.some(order => order.id === cost.orderId));
  }
}

// Existing installations receive examples once, without replacing user records.
const oldStorage = memoryStorage();
const legacy = JSON.parse(JSON.stringify(examples));
delete legacy.sampleDataVersion;
legacy.projects = legacy.projects.filter(item => !item.id.startsWith('sample-'));
legacy.projects[0].name = 'My existing project';
legacy.costs = legacy.costs.filter(item => !item.id.startsWith('sample-'));
legacy.audit = [];
legacy.users = legacy.users.filter(item => !item.id.startsWith('sample-'));
oldStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
const upgraded = createStore(oldStorage);
assert.equal(upgraded.project('demo-1').name, 'My existing project');
assert.equal(upgraded.summary(upgraded.project('demo-1')).spending, 149000);
const migrated = JSON.stringify(upgraded.snapshot());
assert.equal(JSON.stringify(createStore(oldStorage).snapshot()), migrated, 'Reloading must not duplicate or reset examples.');
upgraded.decideChange('sample-dhanmondi', 'dhan-change-2', 'Approved');
assert.equal(createStore(oldStorage).project('sample-dhanmondi').changes[1].status, 'Approved');

// A new project is a separate record, visible after opening another page/store.
const project = newProject('North Tower');
const second = newProject('South Tower');
assert.equal(createStore(storage).project(project.id).name, 'North Tower');
assert.equal(current(project).packages.length, 0);
assert.equal(admin.summary(current(project)).spending, 0);
assert.throws(() => admin.signOff(project.id, 'Client'), /handover checks/);

admin.addPackage(project.id, {name: 'Foundation', quantity: 100, unit: 'm³', start: '2026-11-01', end: '2026-12-01'});
const pkg = current(project).packages[0];
admin.addDrawing(project.id, {packageId: pkg.id, reference: 'F-01', revision: 'A', title: 'Foundation', url: ''});
const revisionA = current(project).drawings[0];
admin.approveDrawing(project.id, revisionA.id);
admin.addDrawing(project.id, {packageId: pkg.id, reference: 'F-01', revision: 'B', title: 'Foundation update', url: 'https://example.com/foundation.pdf'});
const revisionB = current(project).drawings[1];
admin.approveDrawing(project.id, revisionB.id);
assert.equal(current(project).drawings[0].superseded, true);
assert.equal(current(project).drawings.filter(item => item.approved).length, 1);
assert.throws(() => admin.addLog(project.id, {packageId: pkg.id, quantity: 10, date: '2026-11-15', notes: 'Work', drawingId: revisionA.id}), /approved drawing/);

admin.addLog(project.id, {packageId: pkg.id, quantity: 30, date: '2026-11-15', notes: 'Excavation', blocker: 'Existing pipe', drawingId: revisionB.id});
assert.equal(admin.summary(current(project)).progress, 30);
assert.equal(admin.summary(current(second)).progress, 0);
const log = current(project).logs[0];
admin.raiseRfi(project.id, log.id);
const rfi = current(project).rfis[0];
assert.equal(rfi.logId, log.id);
assert.equal(rfi.packageId, pkg.id);
assert.equal(rfi.drawingReference, 'F-01 · Rev B');
assert.equal(rfi.question, 'Existing pipe');
assert.throws(() => admin.raiseRfi(project.id, log.id), /already exists/);
assert.throws(() => admin.addChange(project.id, {title: 'Diversion', reason: 'Pipe', amount: 75000, rfiId: rfi.id}), /Answer the RFI/);
admin.respondRfi(project.id, rfi.id, 'Divert the pipe around the footing.');
admin.addChange(project.id, {title: 'Pipe diversion', reason: 'Design response', amount: 75000, rfiId: rfi.id});
const change = current(project).changes[0];
assert.equal(admin.summary(current(project)).budget, 1000000);
admin.decideChange(project.id, change.id, 'Approved');
assert.throws(() => admin.decideChange(project.id, change.id, 'Approved'), /already been decided/);
assert.equal(admin.summary(current(project)).budget, 1075000);
assert.equal(admin.summary(current(project)).spending, 0);

// Requests, orders, and delivery update procurement; actual spending needs an expense.
admin.requestMaterials(project.id, {packageId: pkg.id, item: 'Cement', quantity: 10, unit: 'bags'});
const request = current(project).requests[0];
admin.createOrder(project.id, {requestId: request.id, supplier: 'Supplier Ltd.', rate: 550, expected: '2026-11-16'});
const order = current(project).orders[0];
assert.throws(() => admin.createOrder(project.id, {requestId: request.id, supplier: 'Duplicate', rate: 550, expected: '2026-11-16'}), /already processed/);
assert.equal(admin.summary(current(project)).spending, 0);
admin.receiveOrder(project.id, order.id);
assert.equal(current(project).requests[0].status, 'Fulfilled');
assert.equal(admin.summary(current(project)).spending, 0);
admin.saveCost({projectId: project.id, date: '2026-11-16', category: 'Materials', description: 'Cement invoice', quantity: 10, rate: 550, orderId: order.id});
const cost = last(admin.snapshot().costs);
assert.equal(admin.summary(current(project)).spending, 5500);
assert.equal(admin.summary(current(second)).spending, 0);
admin.saveCost({projectId: project.id, date: '2026-11-16', category: 'Materials', description: 'Corrected invoice', quantity: 10, rate: 600, orderId: order.id}, cost.id);
assert.equal(admin.summary(current(project)).spending, 6000);
admin.voidCost(cost.id);
assert.equal(admin.summary(current(project)).spending, 0);
assert.ok(admin.snapshot().costs.find(item => item.id === cost.id).voidedAt);

admin.addChange(project.id, {title: 'Saving', reason: 'Reduced scope', amount: -10000});
admin.decideChange(project.id, last(current(project).changes).id, 'Rejected');
assert.equal(admin.summary(current(project)).budget, 1075000);

// Completion follows actual work and open records, rather than a forced change scenario.
admin.addLog(project.id, {packageId: pkg.id, quantity: 70, date: '2026-11-17', notes: 'Foundation complete'});
admin.addPunch(project.id, 'Touch up paint');
for (const key of ['drawings', 'certificates', 'manual']) admin.setDocument(project.id, key, true);
assert.throws(() => admin.signOff(project.id, 'Client'), /handover checks/);
admin.resolvePunch(project.id, current(project).punch[0].id);
admin.signOff(project.id, 'Client Representative');
assert.equal(current(project).status, 'Handed over');
assert.throws(() => admin.saveCost({projectId: project.id, date: '2026-11-18', category: 'Labor', description: 'Late cost', quantity: 1, rate: 10}), /active, awarded/);
assert.throws(() => admin.addPackage(project.id, {name: 'Late work'}), /active, awarded/);

const simple = newProject('Simple project');
admin.addPackage(simple.id, {name: 'All works', quantity: 1, unit: 'lot', start: '2026-11-01', end: '2027-04-30'});
admin.addLog(simple.id, {packageId: current(simple).packages[0].id, quantity: 1, date: '2026-11-20', notes: 'Completed'});
for (const key of ['drawings', 'certificates', 'manual']) admin.setDocument(simple.id, key, true);
admin.signOff(simple.id, 'Client');
assert.equal(current(simple).status, 'Handed over', 'No invented RFI, change, order, or defect should be necessary.');

const tender = newProject('Tender project', 'tender');
assert.equal(current(tender).originalBudget, 0);
assert.throws(() => admin.addPackage(tender.id, {}), /active, awarded/);
admin.addBoq(tender.id, {name: 'Work', quantity: 10, unit: 'lot', rate: 1000});
admin.award(tender.id, 9999999);
assert.equal(current(tender).originalBudget, 10000, 'The awarded BOQ defines the original budget.');
assert.throws(() => admin.award(tender.id, 10000), /Only a tender/);
assert.throws(() => admin.addBoq(tender.id, {}), /locked/);
const lost = newProject('Unsuccessful tender', 'tender');
admin.loseTender(lost.id);
assert.equal(current(lost).status, 'Lost');

const viewer = createStore(storage, 'viewer');
const operator = createStore(storage, 'operator');
assert.throws(() => viewer.addProject({name: 'Blocked'}), /role cannot/);
assert.throws(() => operator.award(second.id, 1), /role cannot/);
assert.throws(() => operator.signOff(second.id, 'Client'), /role cannot/);

// A stale page must not overwrite records created by another page.
const stale = createStore(storage);
admin.addOption('categories', 'Consultancy');
stale.addOption('sectors', 'Industrial');
const reloaded = createStore(storage);
assert.ok(reloaded.snapshot().settings.categories.includes('Consultancy'));
assert.ok(reloaded.snapshot().settings.sectors.includes('Industrial'));
assert.equal(reloaded.project(project.id).status, 'Handed over');
assert.ok(reloaded.snapshot().audit.some(event => event.projectId === project.id && event.action === 'Project handed over'));

// Failed writes keep existing data and totals intact.
const before = storage.getItem(STORAGE_KEY);
const failingStorage = {getItem: key => storage.getItem(key), setItem: () => {throw new Error('Quota exceeded');}};
const failing = createStore(failingStorage);
assert.throws(() => failing.addOption('sectors', 'Unsaved sector'), /Quota/);
assert.equal(storage.getItem(STORAGE_KEY), before);
assert.ok(!failing.snapshot().settings.sectors.includes('Unsaved sector'));
console.log('PASS: shared records, independent projects, complete workflows, contracts, progress, RFIs, budgets, procurement, expenses, handover, roles, refresh, concurrent writes, and failed persistence.');
