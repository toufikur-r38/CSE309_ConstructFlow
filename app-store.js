/* Shared project records and business rules. No UI code belongs in this file. */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'constructflow.records.v2';
  const roles = ['admin', 'operator', 'viewer'];
  const requiredDocuments = ['drawings', 'certificates', 'manual'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const timestamp = () => new Date().toISOString();
  const id = prefix => prefix + '-' + (root.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));

  function text(value, label, required = true) {
    const result = String(value ?? '').trim();
    if (required && !result) throw new Error(label + ' is required.');
    if (result.length > 2000) throw new Error(label + ' is too long.');
    return result;
  }

  function number(value, label, minimum = 0) {
    const result = Number(value);
    if (!Number.isFinite(result) || result < minimum || result > 1000000000000) {
      throw new Error(label + ' must be a valid number of at least ' + minimum + '.');
    }
    return result;
  }

  function date(value, label) {
    const result = text(value, label);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || new Date(result + 'T00:00:00Z').toISOString().slice(0, 10) !== result) {
      throw new Error(label + ' must be a valid date.');
    }
    return result;
  }

  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const total = rows => round(rows.reduce((sum, row) => sum + row.quantity * row.rate, 0));

  function projectRecord(input) {
    const start = date(input.start, 'Start date');
    const end = date(input.end, 'Completion date');
    if (end < start) throw new Error('Completion date cannot be before the start date.');
    return {
      id: id('project'), name: text(input.name, 'Project name'), client: text(input.client, 'Client'),
      location: text(input.location, 'Location'), sector: text(input.sector, 'Sector'),
      start, end, estimate: number(input.budget, 'Budget', 0.01),
      status: input.stage === 'tender' ? 'Tender' : 'Active',
      originalBudget: input.stage === 'tender' ? 0 : round(number(input.budget, 'Contract budget', 0.01)),
      awardedAt: input.stage === 'tender' ? null : timestamp(),
      createdAt: timestamp(), signedAt: null, signedBy: '',
      boq: [], packages: [], drawings: [], logs: [], rfis: [], changes: [],
      requests: [], orders: [], punch: [], documents: {drawings: false, certificates: false, manual: false}
    };
  }

  function initialRecords() {
    const uttara = projectRecord({name: 'Uttara Residential Building', client: 'Uttara Property Ltd.', location: 'Uttara, Dhaka', sector: 'Residential', start: '2026-11-01', end: '2027-04-30', budget: 5000000});
    uttara.id = 'demo-1'; // Preserve existing project bookmarks.
    uttara.awardedAt = '2026-11-01T00:00:00Z';
    uttara.boq = [
      {id: 'boq-1', name: 'Foundation & earthworks', quantity: 200, unit: 'm³', rate: 5000},
      {id: 'boq-2', name: 'Reinforced concrete structure', quantity: 300, unit: 'm³', rate: 10000},
      {id: 'boq-3', name: 'Finishing & services', quantity: 200, unit: 'm²', rate: 5000}
    ];
    uttara.packages = [
      {id: 'pkg-foundation', name: 'Foundation', quantity: 200, unit: 'm³', start: '2026-11-01', end: '2026-11-30'},
      {id: 'pkg-structure', name: 'Structure', quantity: 300, unit: 'm³', start: '2026-12-01', end: '2027-02-28'},
      {id: 'pkg-finishing', name: 'Finishing', quantity: 200, unit: 'm²', start: '2027-03-01', end: '2027-04-30'}
    ];
    uttara.drawings = [
      {id: 'drawing-1', packageId: 'pkg-foundation', reference: 'STR-F01', revision: 'A', title: 'Foundation layout', url: '', approved: false, superseded: true},
      {id: 'drawing-2', packageId: 'pkg-foundation', reference: 'STR-F01', revision: 'B', title: 'Foundation layout', url: '', approved: true}
    ];
    const mirpur = projectRecord({name: 'Mirpur Road Improvement', client: 'Dhaka Infrastructure Ltd.', location: 'Mirpur, Dhaka', sector: 'Infrastructure', start: '2026-11-01', end: '2027-03-31', budget: 3000000});
    mirpur.id = 'demo-2';
    mirpur.awardedAt = '2026-11-01T00:00:00Z';
    const costs = [
      ['demo-1', '2026-11-10', 'Materials', 'Cement', 200, 550],
      ['demo-1', '2026-11-11', 'Labor', 'Foundation labor', 20, 1200],
      ['demo-1', '2026-11-12', 'Equipment', 'Concrete mixer rental', 3, 5000],
      ['demo-2', '2026-11-10', 'Materials', 'Crushed stone', 100, 2500],
      ['demo-2', '2026-11-11', 'Labor', 'Road paving crew', 30, 1000],
      ['demo-2', '2026-11-12', 'Equipment', 'Road roller rental', 2, 8000]
    ].map(([projectId, day, category, description, quantity, rate], index) => ({id: 'cost-' + (index + 1), projectId, date: day, category, description, quantity, rate, orderId: '', voidedAt: null}));
    return addSampleRecords({
      version: 2, projects: [uttara, mirpur], costs, audit: [],
      settings: {sectors: ['Residential', 'Commercial', 'Infrastructure'], categories: ['Materials', 'Labor', 'Equipment', 'Services']},
      users: [{id: 'user-admin', name: 'Administrator', email: '', role: 'admin'}]
    });
  }

  /* Separate example projects populate each part of the workflow without
     changing existing projects or replacing records entered by the user. */
  function sampleRecords() {
    const currentDay = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    function day(offset) {
      const value = new Date(currentDay + 'T12:00:00Z');
      value.setUTCDate(value.getUTCDate() + offset);
      return value.toISOString().slice(0, 10);
    }
    const at = offset => day(offset) + 'T08:00:00Z';
    function project(key, name, client, location, sector, budget, start, end, stage = 'awarded') {
      return {
        ...projectRecord({name, client, location, sector, budget, start: day(start), end: day(end), stage}),
        id: 'sample-' + key, createdAt: at(start), awardedAt: stage === 'tender' ? null : at(start)
      };
    }
    const workPackage = (id, name, quantity, unit, start, end) => ({id, name, quantity, unit, start: day(start), end: day(end)});
    function log(id, packageId, quantity, offset, notes, blocker = '', drawingReference = '') {
      return {id, packageId, quantity, date: day(offset), notes, blocker, drawingId: '', drawingReference, at: at(offset)};
    }
    function request(id, packageId, item, quantity, unit, status, offset = -10) {
      return {id, packageId, item, quantity, unit, status, at: at(offset)};
    }
    function order(id, requestId, item, quantity, unit, supplier, rate, status, offset) {
      return {id, requestId, item, quantity, unit, supplier, rate, status, expected: day(offset), receivedAt: status === 'Received' ? at(offset) : null};
    }
    function drawing(id, packageId, reference, revision, approved, superseded = false) {
      return {id, packageId, reference, revision, title: 'Foundation and service layout',
        url: 'assets/reference-foundation.svg', approved, superseded};
    }

    const tender = project('banani', 'Banani Office Extension', 'North Avenue Properties', 'Banani, Dhaka', 'Commercial', 2400000, 7, 120, 'tender');
    tender.createdAt = at(-3);
    tender.boq = [
      {id: 'banani-boq-1', name: 'Structural extension', quantity: 120, unit: 'm²', rate: 12000},
      {id: 'banani-boq-2', name: 'Finishing and electrical works', quantity: 120, unit: 'm²', rate: 8000}
    ];

    const site = project('dhanmondi', 'Dhanmondi Apartment Renovation', 'Lakeview Housing Ltd.', 'Dhanmondi, Dhaka', 'Residential', 1800000, -45, 60);
    site.boq = [
      {id: 'dhan-boq-1', name: 'Demolition and preparation', quantity: 100, unit: 'm²', rate: 5000},
      {id: 'dhan-boq-2', name: 'Structural repairs', quantity: 80, unit: 'm²', rate: 10000},
      {id: 'dhan-boq-3', name: 'Finishing and services', quantity: 100, unit: 'm²', rate: 5000}
    ];
    site.packages = [
      workPackage('dhan-demolition', 'Demolition and preparation', 100, 'm²', -45, -20),
      workPackage('dhan-structure', 'Structural repairs', 80, 'm²', -20, 20),
      workPackage('dhan-finishing', 'Finishing and services', 100, 'm²', 21, 60)
    ];
    site.drawings = [
      drawing('dhan-drawing-a', 'dhan-structure', 'STR-DR01', 'A', false, true),
      drawing('dhan-drawing-b', 'dhan-structure', 'STR-DR01', 'B', true),
      drawing('dhan-drawing-c', 'dhan-structure', 'STR-DR01', 'C', false)
    ];
    site.logs = [
      log('dhan-log-1', 'dhan-demolition', 100, -20, 'Demolition and debris removal completed. Area released for structural repairs.'),
      log('dhan-log-2', 'dhan-structure', 20, -3, 'Concrete repairs completed at columns C1–C4.', 'Existing water line crosses the proposed footing.', 'STR-DR01 · Rev B'),
      log('dhan-log-3', 'dhan-structure', 12, -1, 'Repaired beam edges and completed reinforcement inspection.', 'Please confirm the lintel reinforcement at the west entrance.', 'STR-DR01 · Rev B')
    ];
    site.logs.slice(1).forEach(item => {item.drawingId = 'dhan-drawing-b';});
    site.rfis = [
      {id: 'dhan-rfi-1', logId: 'dhan-log-2', packageId: 'dhan-structure', question: site.logs[1].blocker,
        drawingReference: 'STR-DR01 · Rev B', response: 'Divert the water line around the footing and install a protective sleeve.', at: at(-3), respondedAt: at(-2)},
      {id: 'dhan-rfi-2', logId: 'dhan-log-3', packageId: 'dhan-structure', question: site.logs[2].blocker,
        drawingReference: 'STR-DR01 · Rev B', response: '', at: at(-1)}
    ];
    site.changes = [
      {id: 'dhan-change-1', title: 'Additional waterproofing', reason: 'Client instruction for the wet areas.', amount: 45000, rfiId: '', status: 'Approved', at: at(-8), decidedAt: at(-6)},
      {id: 'dhan-change-2', title: 'Water line diversion', reason: 'Diversion and protective sleeve following the design response.', amount: 75000, rfiId: 'dhan-rfi-1', status: 'Pending', at: at(-1)},
      {id: 'dhan-change-3', title: 'Imported floor tiles', reason: 'Alternative finish proposal; client retained the original specification.', amount: 120000, rfiId: '', status: 'Rejected', at: at(-12), decidedAt: at(-10)}
    ];
    site.requests = [
      request('dhan-request-1', 'dhan-structure', 'Cement', 100, 'bags', 'Fulfilled'),
      request('dhan-request-2', 'dhan-structure', 'Reinforcement steel', 2, 'tons', 'Ordered'),
      request('dhan-request-3', 'dhan-finishing', 'Wall primer', 20, 'litres', 'Requested'),
      request('dhan-request-4', 'dhan-finishing', 'Imported tile samples', 5, 'boxes', 'Cancelled')
    ];
    site.orders = [
      order('dhan-order-1', 'dhan-request-1', 'Cement', 100, 'bags', 'Eastern Building Supplies', 550, 'Received', -4),
      order('dhan-order-2', 'dhan-request-2', 'Reinforcement steel', 2, 'tons', 'City Steel Traders', 85000, 'Ordered', 3)
    ];
    site.punch = [{id: 'dhan-punch-1', description: 'Repair chipped plaster at the stair landing.', resolvedAt: null}];

    const handover = project('chattogram', 'Chattogram Warehouse Repairs', 'Portside Logistics Ltd.', 'Agrabad, Chattogram', 'Commercial', 950000, -75, 10);
    handover.boq = [
      {id: 'ctg-boq-1', name: 'Roof repairs', quantity: 200, unit: 'm²', rate: 3000},
      {id: 'ctg-boq-2', name: 'Electrical and safety works', quantity: 1, unit: 'lot', rate: 350000}
    ];
    handover.packages = [
      workPackage('ctg-roof', 'Roof repairs', 200, 'm²', -75, -25),
      workPackage('ctg-electrical', 'Electrical and safety works', 1, 'lot', -25, -2)
    ];
    handover.logs = [
      log('ctg-log-1', 'ctg-roof', 200, -25, 'Roof sheets replaced and water-tightness test passed.'),
      log('ctg-log-2', 'ctg-electrical', 1, -2, 'Lighting, emergency exits, and earthing inspection completed.')
    ];
    handover.requests = [request('ctg-request-1', 'ctg-roof', 'Roof sheets', 40, 'sheets', 'Fulfilled', -40)];
    handover.orders = [order('ctg-order-1', 'ctg-request-1', 'Roof sheets', 40, 'sheets', 'Coastal Roofing Supply', 7000, 'Received', -35)];
    handover.punch = [
      {id: 'ctg-punch-1', description: 'Replace the faded emergency-exit sign at the loading bay.', resolvedAt: null},
      {id: 'ctg-punch-2', description: 'Seal the gutter joint above the east entrance.', resolvedAt: at(-1)}
    ];
    handover.documents = {drawings: true, certificates: true, manual: false};

    const completed = project('sylhet', 'Sylhet Community Centre', 'Greenfield Community Trust', 'Sylhet Sadar', 'Commercial', 3200000, -180, -10);
    completed.boq = [
      {id: 'sylhet-boq-1', name: 'Building works', quantity: 400, unit: 'm²', rate: 6000},
      {id: 'sylhet-boq-2', name: 'Finishing and services', quantity: 1, unit: 'lot', rate: 800000}
    ];
    completed.packages = [
      workPackage('sylhet-building', 'Building works', 400, 'm²', -180, -50),
      workPackage('sylhet-services', 'Finishing and services', 1, 'lot', -50, -10)
    ];
    completed.logs = [
      log('sylhet-log-1', 'sylhet-building', 400, -50, 'Building works completed and inspected.'),
      log('sylhet-log-2', 'sylhet-services', 1, -12, 'Finishes and services completed. Final inspection passed.')
    ];
    completed.changes = [{id: 'sylhet-change-1', title: 'Accessible entrance ramp', reason: 'Client-approved accessibility improvement.', amount: 80000, rfiId: '', status: 'Approved', at: at(-60), decidedAt: at(-55)}];
    completed.punch = [{id: 'sylhet-punch-1', description: 'Adjust the main entrance door closer.', resolvedAt: at(-11)}];
    completed.documents = {drawings: true, certificates: true, manual: true};
    completed.status = 'Handed over';
    completed.signedAt = at(-10);
    completed.signedBy = 'Farhana Ahmed, Client Representative';

    const lost = project('gazipur', 'Gazipur Boundary Wall', 'Meghna Industrial Estate', 'Gazipur', 'Infrastructure', 650000, 15, 75, 'tender');
    lost.createdAt = at(-20);
    lost.status = 'Lost';
    lost.boq = [{id: 'gazipur-boq-1', name: 'Boundary wall construction', quantity: 100, unit: 'metres', rate: 6500}];

    const costs = [
      ['sample-dhanmondi', -4, 'Materials', 'Cement delivery invoice', 100, 550, 'dhan-order-1'],
      ['sample-dhanmondi', -1, 'Labor', 'Structural repair crew', 10, 1800, ''],
      ['sample-dhanmondi', 0, 'Equipment', 'Concrete cutter rental', 1, 4500, ''],
      ['sample-chattogram', -35, 'Materials', 'Roof sheet invoice', 40, 7000, 'ctg-order-1'],
      ['sample-chattogram', -2, 'Labor', 'Roofing and electrical installation', 1, 320000, ''],
      ['sample-chattogram', -1, 'Services', 'Final electrical inspection', 1, 18000, ''],
      ['sample-sylhet', -50, 'Materials', 'Building materials and finishes', 1, 1800000, ''],
      ['sample-sylhet', -12, 'Labor', 'Construction and finishing teams', 1, 950000, ''],
      ['sample-sylhet', -11, 'Services', 'Commissioning and final inspection', 1, 120000, '']
    ].map(([projectId, offset, category, description, quantity, rate, orderId], index) => ({
      id: 'sample-cost-' + (index + 1), projectId, date: day(offset), category, description, quantity, rate, orderId, voidedAt: null
    }));
    costs.push({id: 'sample-cost-void', projectId: site.id, date: day(-1), category: 'Labor', description: 'Duplicate labor invoice', quantity: 1, rate: 18000, orderId: '', voidedAt: at(0)});

    const auditEntries = [
      [site.id, 'Change submitted', 'Water line diversion submitted for approval.', -1, 'operator'],
      [site.id, 'RFI raised', 'Lintel reinforcement clarification requested from the site log.', -1, 'operator'],
      [site.id, 'Expense recorded', 'Concrete cutter rental recorded.', 0, 'operator'],
      [site.id, 'Expense voided', 'Duplicate labor invoice voided.', 0, 'admin'],
      [site.id, 'Expense updated', 'Labor invoice corrected to 10 working days.', -1, 'operator'],
      [site.id, 'Project updated', 'Client contact and completion date confirmed.', -5, 'admin'],
      [site.id, 'Change approved', 'Additional waterproofing approved.', -6, 'admin'],
      [site.id, 'Materials received', '100 bags of cement received against the purchase order.', -4, 'operator'],
      [handover.id, 'Punch-list item resolved', 'East entrance gutter joint sealed.', -1, 'operator'],
      [completed.id, 'Project handed over', 'Client acceptance and required documents recorded.', -10, 'admin'],
      [tender.id, 'Project created', 'Office extension tender registered for review.', -3, 'admin'],
      [lost.id, 'Tender closed', 'Tender marked unsuccessful.', -7, 'admin']
    ];
    return {
      projects: [tender, site, handover, completed, lost], costs,
      audit: auditEntries.map(([projectId, action, description, offset, role], index) => ({id: 'sample-event-' + index, projectId, action, description, role, at: at(offset)})),
      users: [
        {id: 'sample-user-1', name: 'Arif Hossain', email: 'arif@example.com', role: 'operator'},
        {id: 'sample-user-2', name: 'Nusrat Jahan', email: 'nusrat@example.com', role: 'viewer'},
        {id: 'sample-user-3', name: 'Mahmud Rahman', email: 'mahmud@example.com', role: 'admin'}
      ]
    };
  }

  function addSampleRecords(records) {
    if (records.sampleDataVersion >= 1) return records;
    const examples = sampleRecords();
    const existingProjects = new Set(records.projects.map(project => project.id));
    const projects = examples.projects.filter(project => !existingProjects.has(project.id));
    const addedIds = new Set(projects.map(project => project.id));
    records.projects.push(...projects);
    records.costs.push(...examples.costs.filter(cost => addedIds.has(cost.projectId)));
    records.audit.push(...examples.audit.filter(event => addedIds.has(event.projectId)));
    records.audit.sort((a, b) => b.at.localeCompare(a.at));
    for (const user of examples.users) {
      if (!records.users.some(existing => existing.id === user.id || existing.email === user.email)) records.users.push(user);
    }
    records.sampleDataVersion = 1;
    return records;
  }

  function validateRecords(records) {
    if (records?.version !== 2 || !Array.isArray(records.projects) || !Array.isArray(records.costs) || !Array.isArray(records.audit) || !Array.isArray(records.users) || !records.settings) {
      throw new Error('Saved records are not in the supported format.');
    }
    for (const project of records.projects) {
      if (!project.id || !project.name || !['Tender', 'Active', 'Lost', 'Handed over'].includes(project.status)) throw new Error('Invalid project record.');
      for (const key of ['boq', 'packages', 'drawings', 'logs', 'rfis', 'changes', 'requests', 'orders', 'punch']) {
        if (!Array.isArray(project[key])) throw new Error('Incomplete project records.');
      }
      if (!project.documents || !requiredDocuments.every(key => typeof project.documents[key] === 'boolean')) throw new Error('Invalid handover checklist.');
    }
    return records;
  }

  function createStore(storage, role = 'admin') {
    if (!roles.includes(role)) role = 'viewer';
    let records;
    try {
      const saved = storage.getItem(STORAGE_KEY);
      records = saved ? validateRecords(JSON.parse(saved)) : initialRecords();
      const needsSampleRecords = !records.sampleDataVersion;
      if (needsSampleRecords) records = addSampleRecords(records);
      // Persist immediately so initial IDs and dates remain stable between pages.
      if (!saved || needsSampleRecords) storage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (error) {
      throw new Error('Unable to load project records. ' + error.message);
    }

    function write(action, projectId, description, update, approval = false) {
      if (role === 'viewer' || (approval && role !== 'admin')) throw new Error('Your current role cannot perform this action.');
      // Persist a complete copy before replacing memory; failed writes never look successful.
      const latest = storage.getItem(STORAGE_KEY);
      const next = clone(latest ? validateRecords(JSON.parse(latest)) : records);
      const project = projectId ? next.projects.find(item => item.id === projectId) : null;
      if (projectId && !project) throw new Error('Project not found.');
      const result = update(next, project);
      next.audit.unshift({id: id('event'), at: timestamp(), action, projectId: projectId || result?.id || '', description, role});
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
      records = next;
      return clone(result ?? project ?? true);
    }

    function active(project) {
      if (project.status !== 'Active') throw new Error('This action requires an active, awarded project.');
    }

    function find(rows, recordId, label) {
      const record = rows.find(item => item.id === recordId);
      if (!record) throw new Error(label + ' not found.');
      return record;
    }

    function summary(project) {
      const approvedChanges = round(project.changes.filter(change => change.status === 'Approved').reduce((sum, change) => sum + change.amount, 0));
      const budget = round(project.originalBudget + approvedChanges);
      const spending = total(records.costs.filter(cost => cost.projectId === project.id && !cost.voidedAt));
      const completedPackages = project.packages.filter(item => packageProgress(project, item) >= 100).length;
      const progress = project.packages.length ? Math.round(project.packages.reduce((sum, item) => sum + packageProgress(project, item), 0) / project.packages.length) : 0;
      return {approvedChanges, budget, spending, remaining: round(budget - spending), progress, completedPackages, pending: project.changes.filter(change => change.status === 'Pending').length};
    }

    function packageProgress(project, item) {
      const quantity = project.logs.filter(log => log.packageId === item.id).reduce((sum, log) => sum + log.quantity, 0);
      return Math.min(100, quantity / item.quantity * 100);
    }

    function handoverChecks(project) {
      return [
        {label: 'All work packages completed', done: project.packages.length > 0 && project.packages.every(item => packageProgress(project, item) >= 100)},
        {label: 'All material requests fulfilled or cancelled', done: project.requests.every(item => item.status !== 'Requested')},
        {label: 'All purchase orders received or cancelled', done: project.orders.every(order => order.status !== 'Ordered')},
        {label: 'All RFIs answered', done: project.rfis.every(rfi => Boolean(rfi.response))},
        {label: 'No changes awaiting approval', done: project.changes.every(change => change.status !== 'Pending')},
        {label: 'All punch-list items resolved', done: project.punch.every(item => item.resolvedAt)},
        {label: 'Required handover documents confirmed', done: requiredDocuments.every(key => project.documents[key])}
      ];
    }

    return {
      snapshot: () => clone(records),
      project: projectId => clone(records.projects.find(item => item.id === projectId) || null),
      summary, packageProgress, handoverChecks,

      addProject(input) {
        return write('Project created', '', text(input.name, 'Project name'), next => {
          const project = projectRecord(input);
          next.projects.push(project);
          return project;
        });
      },

      editProject(projectId, input) {
        return write('Project updated', projectId, 'Project details updated', (next, project) => {
          if (project.status === 'Handed over') throw new Error('Handed-over projects are closed.');
          const details = projectRecord({...input, budget: project.estimate, stage: 'tender'});
          if (project.packages.some(item => item.start < details.start || item.end > details.end)) throw new Error('Project dates must include all work packages.');
          for (const key of ['name', 'client', 'location', 'sector', 'start', 'end']) project[key] = details[key];
        });
      },

      addBoq(projectId, input) {
        return write('Estimate updated', projectId, 'BOQ item added', (next, project) => {
          if (project.status !== 'Tender') throw new Error('The estimate is locked after tender review.');
          project.boq.push({id: id('boq'), name: text(input.name, 'Work item'), quantity: number(input.quantity, 'Quantity', 0.01), unit: text(input.unit, 'Unit'), rate: number(input.rate, 'Rate', 0.01)});
        });
      },

      removeBoq(projectId, itemId) {
        return write('Estimate updated', projectId, 'BOQ item removed', (next, project) => {
          if (project.status !== 'Tender') throw new Error('The estimate is locked after tender review.');
          find(project.boq, itemId, 'BOQ item');
          project.boq = project.boq.filter(item => item.id !== itemId);
        });
      },

      award(projectId, amount) {
        return write('Contract awarded', projectId, 'Original contract budget confirmed', (next, project) => {
          if (project.status !== 'Tender') throw new Error('Only a tender can be awarded.');
          const budget = project.boq.length ? total(project.boq) : round(number(amount, 'Contract amount', 0.01));
          project.originalBudget = budget;
          project.awardedAt = timestamp();
          project.status = 'Active';
        }, true);
      },

      loseTender(projectId) {
        return write('Tender closed', projectId, 'Tender marked unsuccessful', (next, project) => {
          if (project.status !== 'Tender') throw new Error('Only an open tender can be marked unsuccessful.');
          project.status = 'Lost';
        }, true);
      },

      addPackage(projectId, input) {
        return write('Work package added', projectId, input.name, (next, project) => {
          active(project);
          const start = date(input.start, 'Package start');
          const end = date(input.end, 'Package completion');
          if (start < project.start || end > project.end || end < start) throw new Error('Work package dates must be within the project dates.');
          project.packages.push({id: id('package'), name: text(input.name, 'Package name'), quantity: number(input.quantity, 'Planned quantity', 0.01), unit: text(input.unit, 'Unit'), start, end});
        });
      },

      addDrawing(projectId, input) {
        return write('Drawing registered', projectId, input.reference, (next, project) => {
          active(project);
          find(project.packages, input.packageId, 'Work package');
          const reference = text(input.reference, 'Drawing reference');
          const revision = text(input.revision, 'Revision');
          if (project.drawings.some(item => item.reference === reference && item.revision === revision)) throw new Error('That drawing revision is already registered.');
          const url = text(input.url, 'Drawing URL', false);
          if (url && !/^https?:\/\//i.test(url)) throw new Error('Use an http or https link for the drawing.');
          project.drawings.push({id: id('drawing'), packageId: input.packageId, reference, revision, title: text(input.title, 'Drawing title'), url, approved: false, superseded: false});
        });
      },

      approveDrawing(projectId, drawingId) {
        return write('Drawing approved', projectId, 'Current revision updated', (next, project) => {
          active(project);
          const drawing = find(project.drawings, drawingId, 'Drawing');
          project.drawings.filter(item => item.reference === drawing.reference && item.approved).forEach(item => {
            item.approved = false;
            item.superseded = true;
          });
          drawing.approved = true;
          drawing.superseded = false;
        }, true);
      },

      addLog(projectId, input) {
        return write('Site log recorded', projectId, 'Progress recorded against work package', (next, project) => {
          active(project);
          const item = find(project.packages, input.packageId, 'Work package');
          const quantity = number(input.quantity, 'Completed quantity', 0);
          const completed = project.logs.filter(log => log.packageId === item.id).reduce((sum, log) => sum + log.quantity, 0);
          if (round(completed + quantity) > item.quantity) throw new Error('Completed quantity exceeds the remaining package scope.');
          const drawing = input.drawingId ? find(project.drawings, input.drawingId, 'Drawing') : null;
          if (drawing && (drawing.packageId !== item.id || !drawing.approved)) throw new Error('Select an approved drawing for this work package.');
          project.logs.push({id: id('log'), packageId: item.id, quantity, date: date(input.date, 'Log date'), notes: text(input.notes, 'Progress notes'), blocker: text(input.blocker, 'Blocker', false), drawingId: drawing?.id || '', drawingReference: drawing ? drawing.reference + ' · Rev ' + drawing.revision : '', at: timestamp()});
        });
      },

      raiseRfi(projectId, logId) {
        return write('RFI raised', projectId, 'Clarification requested from site record', (next, project) => {
          active(project);
          const log = find(project.logs, logId, 'Site log');
          if (!log.blocker) throw new Error('This site log has no blocker.');
          if (project.rfis.some(rfi => rfi.logId === logId)) throw new Error('An RFI already exists for this log.');
          project.rfis.push({id: id('rfi'), logId, packageId: log.packageId, question: log.blocker, drawingReference: log.drawingReference, response: '', at: timestamp()});
        });
      },

      respondRfi(projectId, rfiId, response) {
        return write('RFI answered', projectId, 'Design clarification recorded', (next, project) => {
          active(project);
          const rfi = find(project.rfis, rfiId, 'RFI');
          if (rfi.response) throw new Error('This RFI already has a response.');
          rfi.response = text(response, 'Design response');
          rfi.respondedAt = timestamp();
        }, true);
      },

      addChange(projectId, input) {
        return write('Change submitted', projectId, input.title, (next, project) => {
          active(project);
          if (input.rfiId && !find(project.rfis, input.rfiId, 'RFI').response) throw new Error('Answer the RFI before pricing its change.');
          const amount = round(number(input.amount, 'Change amount', -1000000000000));
          if (amount === 0) throw new Error('A priced change must have a non-zero amount.');
          if (project.originalBudget + project.changes.filter(change => change.status === 'Approved').reduce((sum, change) => sum + change.amount, 0) + amount < 0) throw new Error('The change would make the budget negative.');
          project.changes.push({id: id('change'), title: text(input.title, 'Change title'), reason: text(input.reason, 'Reason'), amount, rfiId: input.rfiId || '', status: 'Pending', at: timestamp()});
        });
      },

      decideChange(projectId, changeId, decision) {
        return write('Change ' + decision.toLowerCase(), projectId, 'Change decision recorded', (next, project) => {
          active(project);
          const change = find(project.changes, changeId, 'Change');
          if (change.status !== 'Pending') throw new Error('This change has already been decided.');
          if (!['Approved', 'Rejected'].includes(decision)) throw new Error('Invalid decision.');
          const budget = project.originalBudget + project.changes.filter(item => item.status === 'Approved').reduce((sum, item) => sum + item.amount, 0);
          if (decision === 'Approved' && budget + change.amount < 0) throw new Error('The change would make the budget negative.');
          change.status = decision;
          change.decidedAt = timestamp();
        }, true);
      },

      requestMaterials(projectId, input) {
        return write('Materials requested', projectId, input.item, (next, project) => {
          active(project);
          if (input.packageId) find(project.packages, input.packageId, 'Work package');
          project.requests.push({id: id('request'), packageId: input.packageId || '', item: text(input.item, 'Material'), quantity: number(input.quantity, 'Quantity', 0.01), unit: text(input.unit, 'Unit'), status: 'Requested', at: timestamp()});
        });
      },

      cancelRequest(projectId, requestId) {
        return write('Material request cancelled', projectId, 'Request closed', (next, project) => {
          active(project);
          const request = find(project.requests, requestId, 'Material request');
          if (request.status !== 'Requested') throw new Error('This request is already processed.');
          request.status = 'Cancelled';
        });
      },

      createOrder(projectId, input) {
        return write('Purchase order issued', projectId, input.supplier, (next, project) => {
          active(project);
          const request = find(project.requests, input.requestId, 'Material request');
          if (request.status !== 'Requested') throw new Error('This request is already processed.');
          project.orders.push({id: id('order'), requestId: request.id, item: request.item, quantity: request.quantity, unit: request.unit, supplier: text(input.supplier, 'Supplier'), rate: number(input.rate, 'Unit rate', 0.01), expected: date(input.expected, 'Expected delivery'), status: 'Ordered', receivedAt: null});
          request.status = 'Ordered';
        });
      },

      receiveOrder(projectId, orderId) {
        return write('Materials received', projectId, 'Full delivery acknowledged', (next, project) => {
          active(project);
          const order = find(project.orders, orderId, 'Purchase order');
          if (order.status !== 'Ordered') throw new Error('This order is already closed.');
          order.status = 'Received';
          order.receivedAt = timestamp();
          find(project.requests, order.requestId, 'Material request').status = 'Fulfilled';
        });
      },

      cancelOrder(projectId, orderId) {
        return write('Purchase order cancelled', projectId, 'Order closed without delivery', (next, project) => {
          active(project);
          const order = find(project.orders, orderId, 'Purchase order');
          if (order.status !== 'Ordered') throw new Error('Only open orders can be cancelled.');
          order.status = 'Cancelled';
          find(project.requests, order.requestId, 'Material request').status = 'Cancelled';
        }, true);
      },

      saveCost(input, costId = '') {
        return write(costId ? 'Expense updated' : 'Expense recorded', input.projectId, input.description, (next, project) => {
          active(project);
          if (input.orderId) find(project.orders.filter(order => order.status !== 'Cancelled'), input.orderId, 'Purchase order');
          const cost = {projectId: project.id, date: date(input.date, 'Expense date'), category: text(input.category, 'Category'), description: text(input.description, 'Description'), quantity: number(input.quantity, 'Quantity', 0.01), rate: number(input.rate, 'Unit rate', 0.01), orderId: input.orderId || '', voidedAt: null};
          if (costId) {
            const existing = find(next.costs, costId, 'Expense');
            if (existing.projectId !== project.id || existing.voidedAt) throw new Error('Cannot edit this expense.');
            Object.assign(existing, cost);
          } else next.costs.push({id: id('cost'), ...cost});
        });
      },

      voidCost(costId) {
        const cost = find(records.costs, costId, 'Expense');
        return write('Expense voided', cost.projectId, cost.description, (next, project) => {
          active(project);
          const record = find(next.costs, costId, 'Expense');
          if (record.voidedAt) throw new Error('This expense is already voided.');
          record.voidedAt = timestamp();
        }, true);
      },

      addPunch(projectId, description) {
        return write('Punch-list item added', projectId, description, (next, project) => {
          active(project);
          project.punch.push({id: id('punch'), description: text(description, 'Defect description'), resolvedAt: null});
        });
      },

      resolvePunch(projectId, punchId) {
        return write('Punch-list item resolved', projectId, 'Defect rectified', (next, project) => {
          active(project);
          find(project.punch, punchId, 'Punch-list item').resolvedAt = timestamp();
        });
      },

      setDocument(projectId, key, confirmed) {
        return write('Handover checklist updated', projectId, key, (next, project) => {
          active(project);
          if (!requiredDocuments.includes(key)) throw new Error('Unknown document.');
          project.documents[key] = Boolean(confirmed);
        });
      },

      signOff(projectId, representative) {
        return write('Project handed over', projectId, 'Client acceptance recorded', (next, project) => {
          active(project);
          if (!handoverChecks(project).every(check => check.done)) throw new Error('Complete all required handover checks first.');
          project.signedBy = text(representative, 'Client representative');
          project.signedAt = timestamp();
          project.status = 'Handed over';
        }, true);
      },

      saveUser(input, userId = '') {
        return write('Team member updated', '', input.name, next => {
          if (!roles.includes(input.role)) throw new Error('Select a valid role.');
          const user = {name: text(input.name, 'Name'), email: text(input.email, 'Email', false), role: input.role};
          if (user.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) throw new Error('Enter a valid email address.');
          if (userId) Object.assign(find(next.users, userId, 'Team member'), user);
          else next.users.push({id: id('user'), ...user});
        }, true);
      },

      addOption(kind, value) {
        return write('Settings updated', '', 'Option added', next => {
          if (!['sectors', 'categories'].includes(kind)) throw new Error('Unknown setting.');
          const option = text(value, 'Option');
          if (next.settings[kind].some(item => item.toLowerCase() === option.toLowerCase())) throw new Error('This option already exists.');
          next.settings[kind].push(option);
        }, true);
      }
    };
  }

  const api = {createStore, initialRecords, STORAGE_KEY, total, round};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ConstructFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
