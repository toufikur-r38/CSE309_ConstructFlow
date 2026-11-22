/* Run from the project root: node tests/store.test.cjs */
const assert = require('node:assert/strict');
const {createStore, STORAGE_KEY, addDays, dhakaDay} = require('../core/store.js');

function memoryStorage() {
  const values = new Map();
  return {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value)};
}

const storage = memoryStorage();
const admin = createStore(storage);
const day = offset => addDays(dhakaDay(), offset);
const current = id => admin.project(id);
const unit = (id, label) => current(id).units.find(item => item.label === label);

// Sample projects cover every stage and obey the same rules as user records.
const samples = admin.snapshot();
assert.deepEqual(samples.projects.map(project => project.status), ['Construction', 'Handover', 'Closed', 'Approval', 'Land']);
const lake = current('sample-lakeview');
assert.equal(lake.units.length, 18);
assert.equal(lake.units.filter(item => item.owner === 'Landowner').length, 7);
assert.ok(admin.landShare(lake).withinTolerance);
assert.equal(admin.finance(lake).overdueSales, 2);
assert.ok(samples.sales.some(sale => sale.projectId === lake.id && sale.status === 'Cancelled' && sale.refund.deductionPct === 10));
assert.ok(samples.receipts.every((receipt, index) => receipt.no === 'MR-' + String(index + 1).padStart(4, '0')));
assert.throws(() => admin.bookUnit('sample-greenhaven', {}), /building plan is approved/);
assert.throws(() => admin.handoverUnit('sample-seabreeze', unit('sample-seabreeze', '6A').id, {date: day(0), receivedBy: 'Buyer', letterNo: 'X'}), /still owes/);
assert.throws(() => admin.handoverUnit('sample-seabreeze', unit('sample-seabreeze', '5B').id, {date: day(0), receivedBy: 'Buyer', letterNo: 'X'}), /open defects/);
assert.throws(() => admin.addPunch('sample-shapla', {description: 'Late'}), /closed/);
assert.equal(JSON.stringify(createStore(storage).snapshot()), JSON.stringify(admin.snapshot()), 'Reloading must keep the same records.');

// Land stage: a project cannot skip the JV agreement.
const project = admin.addProject({name: 'Test Tower', location: 'Road 3, Banani, Dhaka', authority: 'RAJUK', start: day(-200), end: day(400), costBudget: 40000000});
const pid = project.id;
assert.equal(project.status, 'Land');
assert.throws(() => admin.advance(pid), /JV agreement|joint-venture/i);
assert.throws(() => admin.recordJv(pid, {}), /at least one landowner/);
assert.throws(() => admin.addLandowner(pid, {name: 'Owner', nid: '1234567890', phone: '12345'}), /mobile number/);
assert.throws(() => admin.addLandowner(pid, {name: 'Owner', nid: '123', phone: '01711000000'}), /NID/);
admin.addLandowner(pid, {name: 'Md. Owner', nid: '1234567890', phone: '+880 1711-000000'});
assert.equal(current(pid).land.owners[0].phone, '01711000000');
admin.recordJv(pid, {mouza: 'Banani', dagNo: 'RS 1', khatianNo: '2', areaKatha: 5, developerShare: 50, signingMoney: 5000000, monthlyRent: 40000, agreementDate: day(-200), deedNo: 'JV-1/2026'});
admin.advance(pid);
assert.equal(current(pid).status, 'Approval');
assert.throws(() => admin.recordJv(pid, {}), /not available at the Approval stage/);

// Approval stage: permits, flats, landowner share, pricing, and milestones.
assert.throws(() => admin.advance(pid), /building plan approval approved/);
const permits = Object.fromEntries(['Land use clearance', 'Building plan approval', 'Fire service NOC', 'Environmental clearance'].map(type => [type, admin.addPermit(pid, {type, refNo: 'REF-' + type.length, submittedAt: day(-190), fee: 10000}).id]));
assert.throws(() => admin.addPermit(pid, {type: 'Fire service NOC', refNo: 'DUP', submittedAt: day(-190)}), /already submitted/);
assert.throws(() => admin.decidePermit(pid, permits['Fire service NOC'], {decision: 'Approved', date: day(-195)}), /before submission/);
admin.decidePermit(pid, permits['Fire service NOC'], {decision: 'Rejected', date: day(-185)});
admin.addPermit(pid, {type: 'Fire service NOC', refNo: 'REF-RESUBMIT', submittedAt: day(-184)});
for (const permit of current(pid).permits.filter(item => item.status === 'Submitted')) admin.decidePermit(pid, permit.id, {decision: 'Approved', date: day(-180)});

admin.defineBuilding(pid, {storeys: 4, basements: 0, parkingSlots: 2, types: [{code: 'a', sizeSft: 1000, beds: 3}, {code: 'B', sizeSft: 800, beds: 2}, {code: '', sizeSft: '', beds: ''}]});
assert.deepEqual(current(pid).units.map(item => item.label), ['1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B']);
assert.equal(admin.landShare(current(pid)).entitledSft, 3600);
const ids = labels => labels.map(label => unit(pid, label).id);
assert.throws(() => admin.allocateLandowner(pid, ids(['1A', '1B', '2A', '2B', '3A'])), /exceeds the landowner's agreed share/);
admin.allocateLandowner(pid, ids(['1A', '1B', '2A', '2B']));
assert.ok(admin.landShare(current(pid)).withinTolerance);
admin.setPricing(pid, {ratePerSft: 10000, parkingPrice: 500000, utilityCharge: 200000});
const structure = admin.addPackage(pid, {name: 'Structure', quantity: 4, unit: 'slabs', start: day(-150), end: day(-20)}).id;
const finishing = admin.addPackage(pid, {name: 'Finishing', quantity: 100, unit: '%', start: day(-20), end: day(300)}).id;
assert.throws(() => admin.addPackage(pid, {name: 'Too late', quantity: 1, unit: 'lot', start: day(0), end: day(900)}), /within the project dates/);

// Sales open after building plan approval; landowner flats cannot be sold.
const buyer = admin.addCustomer({name: 'Rahim Uddin', phone: '01811000000', nid: '1987000000', address: 'Dhaka'});
assert.throws(() => admin.addCustomer({name: 'Copy', phone: '01811000000', nid: '1987000001', address: 'Dhaka'}), /already exists/);
const other = admin.addCustomer({name: 'Karima Begum', phone: '01911000000', nid: '1987000002', address: 'Dhaka'});
assert.throws(() => admin.bookUnit(pid, {unitId: unit(pid, '1A').id, customerId: buyer.id, date: day(-170), bookingMoney: 100000, planType: 'monthly', installments: 2, firstDue: day(-140)}), /Landowner flats/);
const milestoneSale = admin.bookUnit(pid, {unitId: unit(pid, '3A').id, customerId: buyer.id, date: day(-170), parking: 1, bookingMoney: 200000, downPayment: 1000000, planType: 'milestone'});
assert.equal(milestoneSale.price, 1000 * 10000 + 500000 + 200000);
assert.equal(milestoneSale.plan.reduce((total, item) => total + item.amount, 0), milestoneSale.price, 'The plan must add up to the price.');
assert.deepEqual(milestoneSale.plan.map(item => item.kind), ['booking', 'down', 'milestone', 'milestone']);
assert.throws(() => admin.bookUnit(pid, {unitId: unit(pid, '3A').id, customerId: other.id, date: day(-170), bookingMoney: 1, planType: 'milestone'}), /not available/);
assert.throws(() => admin.bookUnit(pid, {unitId: unit(pid, '3B').id, customerId: other.id, date: day(-170), parking: 2, bookingMoney: 1, planType: 'milestone'}), /parking/);
const monthlySale = admin.bookUnit(pid, {unitId: unit(pid, '3B').id, customerId: other.id, date: day(-160), parking: 0, discount: 100000, bookingMoney: 100000, downPayment: 0, planType: 'monthly', installments: 3, firstDue: day(-130)});
assert.equal(monthlySale.price, 800 * 10000 + 200000 - 100000);
assert.equal(monthlySale.plan.length, 4);
assert.equal(unit(pid, '3B').status, 'Booked');

assert.throws(() => admin.signAgreement(pid, milestoneSale.id, {date: day(-160)}), /booking money and down payment/);
assert.throws(() => admin.addReceipt({saleId: milestoneSale.id, date: day(-170), amount: milestoneSale.price + 1, method: 'Cash'}), /exceeds the remaining balance/);
assert.throws(() => admin.addReceipt({saleId: milestoneSale.id, date: day(-170), amount: 200000, method: 'Cheque'}), /reference is required/);
const first = admin.addReceipt({saleId: milestoneSale.id, date: day(-170), amount: 700000, method: 'Cash'});
const second = admin.addReceipt({saleId: milestoneSale.id, date: day(-150), amount: 500000, method: 'Cheque', ref: 'Cheque 1001'});
assert.equal(second.no.slice(3) - first.no.slice(3), 1);
const paidUpfront = admin.statement(milestoneSale.id);
assert.deepEqual(paidUpfront.rows.slice(0, 2).map(row => row.status), ['Paid', 'Paid'], 'Receipts apply to the oldest installment first.');
assert.equal(paidUpfront.rows[2].status, 'Not yet due', 'Milestone installments wait for construction.');
admin.signAgreement(pid, milestoneSale.id, {date: day(-150)});
assert.equal(unit(pid, '3A').status, 'Sold');

// Cancelling a booking refunds the payment less the deduction and frees the flat.
const cancelled = admin.bookUnit(pid, {unitId: unit(pid, '4A').id, customerId: other.id, date: day(-150), parking: 0, bookingMoney: 300000, planType: 'monthly', installments: 1, firstDue: day(-120)});
admin.addReceipt({saleId: cancelled.id, date: day(-150), amount: 300000, method: 'Bank transfer', ref: 'TRX 9'});
assert.throws(() => createStore(storage, 'sales').cancelSale(pid, cancelled.id, {deductionPct: 10, date: day(-140), reason: 'x'}), /role cannot/);
admin.cancelSale(pid, cancelled.id, {deductionPct: 10, date: day(-140), reason: 'Buyer withdrew'});
assert.equal(admin.snapshot().sales.find(sale => sale.id === cancelled.id).refund.amount, 270000);
assert.equal(unit(pid, '4A').status, 'Available');
assert.throws(() => admin.addReceipt({saleId: cancelled.id, date: day(-139), amount: 1, method: 'Cash'}), /cancelled sale/);
assert.equal(admin.finance(current(pid)).forfeited, 30000);

// Construction: milestone completion makes construction-linked installments fall due.
assert.throws(() => admin.addLog(pid, {packageId: structure, quantity: 1, date: day(-100), notes: 'Too early'}), /Approval stage/);
admin.advance(pid);
assert.equal(current(pid).status, 'Construction');
assert.throws(() => admin.addLog(pid, {packageId: structure, quantity: 5, date: day(-60), notes: 'Too much'}), /exceeds/);
admin.addLog(pid, {packageId: structure, quantity: 4, date: day(-60), notes: 'Roof slab cast', labour: 50, weather: 'Sunny'});
const dueNow = admin.statement(milestoneSale.id).rows[2];
assert.equal(dueNow.due, day(-45));
assert.equal(dueNow.status, 'Overdue');
assert.equal(dueNow.daysLate, 45);
assert.equal(admin.statement(monthlySale.id).overdue, admin.statement(monthlySale.id).rows.reduce((total, row) => total + row.amount, 0), 'Every unpaid monthly installment is overdue.');
assert.throws(() => admin.advance(pid), /milestones complete/);
admin.addLog(pid, {packageId: finishing, quantity: 100, date: day(-5), notes: 'Finishing complete'});
const steel = admin.requestMaterials(pid, {packageId: structure, item: 'Rod 500W', quantity: 2, unit: 'ton'});
const order = admin.createOrder(pid, {requestId: steel.id, supplier: 'Steel House', rate: 95000, expected: day(-50)});
assert.throws(() => admin.advance(pid), /purchase orders closed/);
admin.receiveOrder(pid, order.id);
admin.saveCost({projectId: pid, date: day(-49), category: 'Rod & steel', description: 'Rod bill', quantity: 2, rate: 95000, orderId: order.id});
assert.equal(admin.summary(current(pid)).spending, 190000);
admin.addChange(pid, {title: 'Extra pile', reason: 'Soil report', amount: 300000});
assert.throws(() => admin.advance(pid), /budget revisions/);
admin.decideChange(pid, current(pid).changes[0].id, 'Approved');
assert.equal(admin.summary(current(pid)).budget, 40300000);
assert.throws(() => admin.advance(pid), /occupancy certificate/);
admin.recordOccupancy(pid, {certificateNo: 'OC-1', date: day(-2)});
admin.addPunch(pid, {description: 'Loose door handle', unitId: unit(pid, '3A').id});
admin.advance(pid);
assert.equal(current(pid).status, 'Handover');

// Handover: full payment, signed agreement, and fixed defects are required.
const handover = label => admin.handoverUnit(pid, unit(pid, label).id, {date: day(0), receivedBy: 'Receiver', letterNo: 'PL-' + label});
assert.throws(() => handover('3A'), /still owes/);
admin.addReceipt({saleId: milestoneSale.id, date: day(0), amount: admin.statement(milestoneSale.id).balance, method: 'Pay order', ref: 'PO 77'});
assert.throws(() => handover('3A'), /open defects/);
admin.resolvePunch(pid, current(pid).punch[0].id);
handover('3A');
assert.throws(() => handover('3A'), /already been handed over/);
assert.throws(() => handover('4A'), /Unsold flats/);
assert.throws(() => handover('3B'), /Sign the sale agreement/);
admin.addReceipt({saleId: monthlySale.id, date: day(0), amount: admin.statement(monthlySale.id).balance, method: 'Cash'});
admin.signAgreement(pid, monthlySale.id, {date: day(0)});
['3B', '1A', '1B', '2A', '2B'].forEach(handover);
assert.throws(() => admin.advance(pid), /association/);
admin.formAssociation(pid, {name: 'Test Tower Owners', president: 'Rahim Uddin', date: day(0)});
admin.advance(pid);
assert.equal(current(pid).status, 'Closed');
assert.ok(current(pid).closedAt);
assert.throws(() => admin.saveCost({projectId: pid, date: day(0), category: 'Other', description: 'Late', quantity: 1, rate: 1}), /closed/);
assert.equal(admin.finance(current(pid)).receivable, 0);

// Roles: each person can only do their own job.
const roles = Object.fromEntries(['pm', 'sales', 'accounts', 'viewer'].map(role => [role, createStore(storage, role)]));
assert.throws(() => roles.viewer.addCustomer({name: 'x'}), /role cannot/);
assert.throws(() => roles.sales.addReceipt({saleId: samples.sales[0].id}), /role cannot/);
assert.throws(() => roles.accounts.bookUnit('sample-lakeview', {}), /role cannot/);
assert.throws(() => roles.pm.decidePermit('sample-greenhaven', 'x', {}), /role cannot/);
assert.throws(() => roles.pm.advance('sample-lakeview'), /role cannot/);
assert.throws(() => roles.accounts.addLog('sample-lakeview', {}), /role cannot/);
assert.ok(roles.sales.can('sales') && !roles.sales.can('receipts'));
roles.accounts.addReceipt({saleId: samples.sales.find(sale => sale.status === 'Booked' && sale.projectId === 'sample-lakeview').id, date: day(0), amount: 1000, method: 'Cash'});
roles.pm.addPermit('sample-greenhaven', {type: 'WASA water connection', refNo: 'WASA-1', submittedAt: day(0)});

// A stale page must not overwrite records created by another page.
const stale = createStore(storage);
admin.addOption('categories', 'Consultancy');
stale.addOption('units', 'gallon');
const reloaded = createStore(storage).snapshot();
assert.ok(reloaded.settings.categories.includes('Consultancy'));
assert.ok(reloaded.settings.units.includes('gallon'));
assert.ok(reloaded.audit.some(event => event.projectId === pid && event.action === 'Stage advanced'));
assert.ok(reloaded.audit.some(event => event.projectId === pid && event.action === 'Project created'));

// Failed writes keep existing data intact; unsupported data is not overwritten.
const before = storage.getItem(STORAGE_KEY);
const failing = createStore({getItem: key => storage.getItem(key), setItem: () => {throw new Error('Quota exceeded');}});
assert.throws(() => failing.addOption('units', 'Unsaved'), /Quota/);
assert.equal(storage.getItem(STORAGE_KEY), before);
assert.ok(!failing.snapshot().settings.units.includes('Unsaved'));
const legacy = memoryStorage();
legacy.setItem(STORAGE_KEY, JSON.stringify({version: 2, projects: []}));
assert.throws(() => createStore(legacy), /supported format/);

console.log('PASS: samples, land → approvals → construction → handover → closed gates, permits, flats, landowner share, pricing, bookings, payment plans, receipts, cancellations, milestone dues, procurement, budgets, handover blocks, roles, concurrent writes, and failed persistence.');
