/* Shared developer-project records and business rules. No UI code belongs in this file. */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'constructflow.records.v3';
  const roles = ['admin', 'pm', 'sales', 'accounts', 'viewer'];
  const roleNames = {admin: 'Managing Director', pm: 'Project Manager', sales: 'Sales Executive', accounts: 'Accounts Officer', viewer: 'Viewer'};
  const permissions = {
    project: ['admin'], decide: ['admin'], permit: ['admin', 'pm'], units: ['admin', 'sales'],
    site: ['admin', 'pm'], procurement: ['admin', 'pm'], costs: ['admin', 'accounts'],
    sales: ['admin', 'sales'], receipts: ['admin', 'accounts'], team: ['admin']
  };
  const statuses = ['Land', 'Approval', 'Construction', 'Handover', 'Closed'];
  const authorities = ['RAJUK', 'CDA', 'KDA', 'RDA', 'Pourashava'];
  const requiredPermits = ['Land use clearance', 'Building plan approval', 'Fire service NOC', 'Environmental clearance'];
  const paymentMethods = ['Cash', 'Cheque', 'Pay order', 'Bank transfer'];
  const SHARE_TOLERANCE = 0.05;
  const MILESTONE_GRACE_DAYS = 15;
  const SALE_STAGES = ['Approval', 'Construction', 'Handover'];
  const SITE_STAGES = ['Approval', 'Construction'];
  const OPEN_STAGES = ['Land', 'Approval', 'Construction', 'Handover'];

  const clone = value => JSON.parse(JSON.stringify(value));
  const timestamp = () => new Date().toISOString();
  const id = prefix => prefix + '-' + (root.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const sum = (rows, pick) => round(rows.reduce((total, row) => total + pick(row), 0));
  const total = rows => sum(rows, row => row.quantity * row.rate);
  const pad = value => String(value).padStart(4, '0');

  function text(value, label, required = true) {
    const result = String(value ?? '').trim();
    if (required && !result) throw new Error(label + ' is required.');
    if (result.length > 2000) throw new Error(label + ' is too long.');
    return result;
  }

  function number(value, label, minimum = 0, maximum = 1000000000000) {
    const result = Number(value);
    if (!Number.isFinite(result) || result < minimum || result > maximum) {
      throw new Error(label + ' must be a valid number of at least ' + minimum + '.');
    }
    return result;
  }

  function whole(value, label, minimum, maximum) {
    const result = number(value, label, minimum, maximum);
    if (!Number.isInteger(result)) throw new Error(label + ' must be a whole number.');
    return result;
  }

  function date(value, label) {
    const result = text(value, label);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || new Date(result + 'T00:00:00Z').toISOString().slice(0, 10) !== result) {
      throw new Error(label + ' must be a valid date.');
    }
    return result;
  }

  function choice(value, options, label) {
    if (!options.includes(value)) throw new Error('Select a valid ' + label + '.');
    return value;
  }

  function mobile(value) {
    const result = text(value, 'Mobile number').replace(/[\s-]/g, '').replace(/^\+?88/, '');
    if (!/^01[3-9]\d{8}$/.test(result)) throw new Error('Enter a Bangladeshi mobile number such as 01712345678.');
    return result;
  }

  function nid(value, required = true) {
    const result = text(value, 'NID', required).replace(/\s/g, '');
    if (result && !/^(\d{10}|\d{13}|\d{17})$/.test(result)) throw new Error('NID must have 10, 13, or 17 digits.');
    return result;
  }

  const dhakaDay = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());

  function addDays(day, count) {
    const value = new Date(day + 'T12:00:00Z');
    value.setUTCDate(value.getUTCDate() + count);
    return value.toISOString().slice(0, 10);
  }

  function addMonths(day, count) {
    const value = new Date(day + 'T12:00:00Z');
    const dayOfMonth = value.getUTCDate();
    value.setUTCDate(1);
    value.setUTCMonth(value.getUTCMonth() + count);
    const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
    value.setUTCDate(Math.min(dayOfMonth, lastDay));
    return value.toISOString().slice(0, 10);
  }

  const daysBetween = (from, to) => Math.round((new Date(to + 'T12:00:00Z') - new Date(from + 'T12:00:00Z')) / 86400000);

  function monthsBetween(from, to) {
    const [y1, m1, d1] = from.split('-').map(Number);
    const [y2, m2, d2] = to.split('-').map(Number);
    return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
  }

  function projectRecord(input) {
    const start = date(input.start, 'Start date');
    const end = date(input.end, 'Planned handover date');
    if (end < start) throw new Error('Planned handover cannot be before the start date.');
    return {
      id: id('project'), name: text(input.name, 'Project name'), location: text(input.location, 'Location'),
      authority: choice(input.authority, authorities, 'approving authority'), start, end,
      costBudget: round(number(input.costBudget, 'Construction budget', 0.01)),
      status: 'Land', createdAt: timestamp(), closedAt: null,
      land: {owners: [], mouza: '', dagNo: '', khatianNo: '', areaKatha: 0, developerShare: 0, signingMoney: 0, monthlyRent: 0, agreementDate: '', deedNo: ''},
      permits: [], building: null, units: [], pricing: {ratePerSft: 0, parkingPrice: 0, utilityCharge: 0},
      packages: [], drawings: [], logs: [], rfis: [], changes: [], requests: [], orders: [], punch: [],
      occupancy: null, association: null
    };
  }

  function emptyRecords() {
    return {
      version: 3, sampleDataVersion: 0, projects: [], customers: [], sales: [], receipts: [], costs: [], audit: [],
      settings: {
        categories: ['Design & approvals', 'Rod & steel', 'Cement', 'Bricks', 'Sand & stone chips', 'Labour', 'Equipment', 'Utilities & services', 'Sales & marketing', 'Other'],
        units: ['ton', 'kg', 'bag', 'pcs', 'cft', 'sft', 'rft', 'lot']
      },
      users: [{id: 'user-admin', name: 'Managing Director', email: '', role: 'admin'}]
    };
  }

  /* Calculations shared by the store, the sample builder, and the pages. */

  function packageDone(project, item) {
    return sum(project.logs.filter(log => log.packageId === item.id), log => log.quantity);
  }

  function packageProgress(project, item) {
    return Math.min(100, packageDone(project, item) / item.quantity * 100);
  }

  function packageCompletedOn(project, item) {
    let completed = 0;
    for (const log of project.logs.filter(entry => entry.packageId === item.id).sort((a, b) => a.date.localeCompare(b.date))) {
      completed = round(completed + log.quantity);
      if (completed >= item.quantity) return log.date;
    }
    return null;
  }

  function summary(records, project) {
    const approvedChanges = sum(project.changes.filter(change => change.status === 'Approved'), change => change.amount);
    const budget = round(project.costBudget + approvedChanges);
    const spending = total(records.costs.filter(cost => cost.projectId === project.id && !cost.voidedAt));
    const progress = project.packages.length ? Math.round(project.packages.reduce((value, item) => value + packageProgress(project, item), 0) / project.packages.length) : 0;
    const developerUnits = project.units.filter(unit => unit.owner === 'Developer');
    return {
      approvedChanges, budget, spending, remaining: round(budget - spending), progress,
      completedPackages: project.packages.filter(item => packageProgress(project, item) >= 100).length,
      pending: project.changes.filter(change => change.status === 'Pending').length,
      units: project.units.length, developerUnits: developerUnits.length,
      landownerUnits: project.units.length - developerUnits.length,
      available: developerUnits.filter(unit => unit.status === 'Available').length,
      booked: developerUnits.filter(unit => unit.status === 'Booked').length,
      sold: developerUnits.filter(unit => unit.status === 'Sold').length,
      handedOver: project.units.filter(unit => unit.status === 'Handed over').length
    };
  }

  function landShare(project) {
    const totalSft = sum(project.units, unit => unit.sizeSft);
    const entitledSft = round(totalSft * (100 - project.land.developerShare) / 100);
    const allocated = project.units.filter(unit => unit.owner === 'Landowner');
    const allocatedSft = sum(allocated, unit => unit.sizeSft);
    return {
      totalSft, entitledSft, allocatedSft, units: allocated.length,
      withinTolerance: entitledSft > 0 && Math.abs(allocatedSft - entitledSft) <= entitledSft * SHARE_TOLERANCE
    };
  }

  function unitPrice(project, unit, parking = 0, rate = project.pricing.ratePerSft, discount = 0) {
    return round(unit.sizeSft * rate + parking * project.pricing.parkingPrice + project.pricing.utilityCharge - discount);
  }

  const permitApproved = (project, type) => project.permits.some(permit => permit.type === type && permit.status === 'Approved');

  function statement(records, sale, today = dhakaDay()) {
    const project = records.projects.find(item => item.id === sale.projectId);
    const receipts = records.receipts.filter(receipt => receipt.saleId === sale.id).sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
    const paid = sum(receipts, receipt => receipt.amount);
    const active = sale.status !== 'Cancelled';
    let remaining = paid;
    const rows = sale.plan.map(item => {
      let due = item.dueDate || null;
      if (item.milestoneId) {
        const milestone = project.packages.find(pkg => pkg.id === item.milestoneId);
        const completedOn = milestone && packageCompletedOn(project, milestone);
        due = completedOn ? addDays(completedOn, MILESTONE_GRACE_DAYS) : null;
      }
      const applied = round(Math.min(item.amount, remaining));
      remaining = round(remaining - applied);
      const outstanding = round(item.amount - applied);
      const status = !active ? 'Cancelled' : outstanding === 0 ? 'Paid' : !due ? 'Not yet due' : due < today ? 'Overdue' : due <= addDays(today, 30) ? 'Due' : 'Upcoming';
      return {...item, due, paid: applied, outstanding, status, daysLate: status === 'Overdue' ? daysBetween(due, today) : 0};
    });
    const pick = state => sum(rows.filter(row => row.status === state), row => row.outstanding);
    return {
      sale, project, receipts, rows, price: sale.price, paid,
      balance: active ? round(sale.price - paid) : 0,
      overdue: pick('Overdue'), dueSoon: pick('Due'),
      daysLate: Math.max(0, ...rows.map(row => row.daysLate)),
      upfrontPaid: paid >= sum(sale.plan.filter(item => ['booking', 'down'].includes(item.kind)), item => item.amount)
    };
  }

  function finance(records, project, today = dhakaDay()) {
    const sales = records.sales.filter(sale => sale.projectId === project.id);
    const active = sales.filter(sale => sale.status !== 'Cancelled');
    const statements = active.map(sale => statement(records, sale, today));
    const cancelled = sales.filter(sale => sale.status === 'Cancelled').map(sale => statement(records, sale, today));
    const salesValue = sum(active, sale => sale.price);
    const collected = sum(statements, item => item.paid);
    const refunds = sum(cancelled, item => item.sale.refund?.amount || 0);
    const forfeited = round(sum(cancelled, item => item.paid) - refunds);
    const unsold = project.units.filter(unit => unit.owner === 'Developer' && unit.status === 'Available');
    const unsoldValue = project.pricing.ratePerSft ? sum(unsold, unit => unitPrice(project, unit)) : 0;
    // Landowner rent runs until the landowner's own flats are handed over.
    const landownerUnits = project.units.filter(unit => unit.owner === 'Landowner');
    const rentUntil = landownerUnits.length && landownerUnits.every(unit => unit.handover) ? landownerUnits.map(unit => unit.handover.date).sort().pop() : today;
    const rentMonths = project.land.agreementDate && project.land.monthlyRent ? monthsBetween(project.land.agreementDate, rentUntil) : 0;
    const landCost = round(project.land.signingMoney + project.land.monthlyRent * rentMonths);
    const costs = summary(records, project);
    const constructionCost = Math.max(costs.budget, costs.spending);
    const projectedRevenue = round(salesValue + unsoldValue + forfeited);
    return {
      salesValue, collected, receivable: round(salesValue - collected),
      overdue: sum(statements, item => item.overdue), dueSoon: sum(statements, item => item.dueSoon),
      overdueSales: statements.filter(item => item.overdue > 0).length,
      refunds, forfeited, unsoldValue, rentMonths, landCost, constructionCost,
      spending: costs.spending, budget: costs.budget, projectedRevenue,
      projectedMargin: round(projectedRevenue - landCost - constructionCost)
    };
  }

  function gateChecks(records, project) {
    const land = project.land;
    switch (project.status) {
      case 'Land': return [
        {label: 'Landowner details recorded', done: land.owners.length > 0, section: 'land'},
        {label: 'Joint-venture agreement registered (deed no. and date)', done: Boolean(land.deedNo && land.agreementDate), section: 'land'},
        {label: 'Developer–landowner share ratio agreed', done: land.developerShare > 0, section: 'land'}
      ];
      case 'Approval': return [
        ...requiredPermits.map(type => ({label: type + ' approved', done: permitApproved(project, type), section: 'permits'})),
        {label: 'Building and flats defined', done: project.units.length > 0, section: 'units'},
        {label: 'Landowner flats allocated (within 5% of the agreed share)', done: project.units.length > 0 && landShare(project).withinTolerance, section: 'units'},
        {label: 'Flat pricing set', done: project.pricing.ratePerSft > 0, section: 'units'},
        {label: 'Construction milestones planned', done: project.packages.length > 0, section: 'construction'}
      ];
      case 'Construction': return [
        {label: 'All construction milestones complete', done: project.packages.length > 0 && project.packages.every(item => packageProgress(project, item) >= 100), section: 'construction'},
        {label: 'Material requests and purchase orders closed', done: project.requests.every(item => item.status !== 'Requested') && project.orders.every(item => item.status !== 'Ordered'), section: 'procurement'},
        {label: 'All RFIs answered', done: project.rfis.every(rfi => Boolean(rfi.response)), section: 'construction'},
        {label: 'No budget revisions awaiting decision', done: project.changes.every(change => change.status !== 'Pending'), section: 'costs'},
        {label: 'Occupancy certificate recorded', done: Boolean(project.occupancy), section: 'handover'}
      ];
      case 'Handover': return [
        {label: 'All sold and landowner flats handed over', done: project.units.filter(needsHandover).every(unit => unit.status === 'Handed over'), section: 'handover'},
        {label: 'All defects resolved', done: project.punch.every(item => item.resolvedAt), section: 'handover'},
        {label: "Owners' association formed", done: Boolean(project.association), section: 'handover'}
      ];
      default: return [];
    }
  }

  const needsHandover = unit => unit.owner === 'Landowner' || unit.status !== 'Available';

  function validateRecords(records) {
    if (records?.version !== 3 || !['projects', 'customers', 'sales', 'receipts', 'costs', 'audit', 'users'].every(key => Array.isArray(records[key])) || !records.settings) {
      throw new Error('Saved records are not in the supported format.');
    }
    for (const project of records.projects) {
      if (!project.id || !project.name || !statuses.includes(project.status) || !project.land || !project.pricing) throw new Error('Invalid project record.');
      for (const key of ['permits', 'units', 'packages', 'drawings', 'logs', 'rfis', 'changes', 'requests', 'orders', 'punch']) {
        if (!Array.isArray(project[key])) throw new Error('Incomplete project records.');
      }
    }
    return records;
  }

  function createStore(storage, role = 'admin') {
    if (!roles.includes(role)) role = 'viewer';
    let records;
    try {
      const saved = storage.getItem(STORAGE_KEY);
      records = saved ? validateRecords(JSON.parse(saved)) : sampleRecords();
      // Persist immediately so generated IDs and dates remain stable between pages.
      if (!saved) storage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (error) {
      throw new Error('Unable to load project records. ' + error.message);
    }

    const can = permission => permissions[permission].includes(role);

    function write(action, projectId, description, update, permission) {
      if (!can(permission)) throw new Error('Your current role cannot perform this action.');
      // Persist a complete copy before replacing memory; failed writes never look successful.
      const latest = storage.getItem(STORAGE_KEY);
      const next = clone(latest ? validateRecords(JSON.parse(latest)) : records);
      const project = projectId ? next.projects.find(item => item.id === projectId) : null;
      if (projectId && !project) throw new Error('Project not found.');
      if (project?.status === 'Closed') throw new Error('This project is closed. Records are read-only.');
      const result = update(next, project);
      const auditProject = projectId || (next.projects.includes(result) ? result.id : '');
      next.audit.unshift({id: id('event'), at: timestamp(), action, projectId: auditProject, description: String(description || ''), role});
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
      records = next;
      return clone(result ?? project ?? true);
    }

    function stage(project, allowed) {
      if (!allowed.includes(project.status)) throw new Error(`This action is not available at the ${project.status} stage.`);
    }

    function find(rows, recordId, label) {
      const record = rows.find(item => item.id === recordId);
      if (!record) throw new Error(label + ' not found.');
      return record;
    }

    function saleOf(next, project, saleId) {
      const sale = find(next.sales, saleId, 'Sale');
      if (sale.projectId !== project.id) throw new Error('Sale not found.');
      return sale;
    }

    return {
      role, can,
      snapshot: () => clone(records),
      project: projectId => clone(records.projects.find(item => item.id === projectId) || null),
      summary: project => summary(records, project),
      finance: (project, today) => finance(records, project, today),
      gateChecks: project => gateChecks(records, project),
      statement: (saleId, today) => statement(records, find(records.sales, saleId, 'Sale'), today),
      packageProgress, landShare, unitPrice, packageCompletedOn,

      addProject(input) {
        return write('Project created', '', text(input.name, 'Project name'), next => {
          const project = projectRecord(input);
          next.projects.push(project);
          return project;
        }, 'project');
      },

      editProject(projectId, input) {
        return write('Project updated', projectId, 'Project details updated', (next, project) => {
          const details = projectRecord({...input, costBudget: project.costBudget});
          if (project.packages.some(item => item.start < details.start || item.end > details.end)) throw new Error('Project dates must include all construction milestones.');
          for (const key of ['name', 'location', 'authority', 'start', 'end']) project[key] = details[key];
        }, 'project');
      },

      addLandowner(projectId, input) {
        return write('Landowner added', projectId, input.name, (next, project) => {
          stage(project, ['Land']);
          project.land.owners.push({id: id('owner'), name: text(input.name, 'Landowner name'), nid: nid(input.nid), phone: mobile(input.phone)});
        }, 'project');
      },

      recordJv(projectId, input) {
        return write('JV agreement recorded', projectId, 'Joint-venture terms recorded', (next, project) => {
          stage(project, ['Land']);
          if (!project.land.owners.length) throw new Error('Add at least one landowner before recording the agreement.');
          Object.assign(project.land, {
            mouza: text(input.mouza, 'Mouza'), dagNo: text(input.dagNo, 'Dag no.'), khatianNo: text(input.khatianNo, 'Khatian no.'),
            areaKatha: number(input.areaKatha, 'Land area', 0.5, 1000),
            developerShare: number(input.developerShare, 'Developer share', 1, 99),
            signingMoney: round(number(input.signingMoney, 'Signing money')),
            monthlyRent: round(number(input.monthlyRent, 'Monthly rent')),
            agreementDate: date(input.agreementDate, 'Agreement date'), deedNo: text(input.deedNo, 'Deed no.')
          });
        }, 'project');
      },

      advance(projectId) {
        const current = find(records.projects, projectId, 'Project');
        const target = statuses[statuses.indexOf(current.status) + 1];
        return write('Stage advanced', projectId, 'Moved to ' + target + ' stage', (next, project) => {
          const open = gateChecks(next, project).filter(check => !check.done);
          if (open.length) throw new Error('Complete this stage first: ' + open.map(check => check.label.toLowerCase()).join('; ') + '.');
          project.status = statuses[statuses.indexOf(project.status) + 1];
          if (project.status === 'Closed') project.closedAt = timestamp();
        }, 'project');
      },

      addPermit(projectId, input) {
        return write('Permit submitted', projectId, input.type, (next, project) => {
          stage(project, ['Approval']);
          const type = text(input.type, 'Permit type');
          if (project.permits.some(item => item.type === type && item.status !== 'Rejected')) throw new Error('This permit is already submitted or approved.');
          const permit = {id: id('permit'), type, refNo: text(input.refNo, 'Reference no.'), submittedAt: date(input.submittedAt, 'Submission date'), fee: round(number(input.fee || 0, 'Fee')), status: 'Submitted', decidedOn: ''};
          project.permits.push(permit);
          return permit;
        }, 'permit');
      },

      decidePermit(projectId, permitId, input) {
        return write('Permit ' + String(input.decision).toLowerCase(), projectId, 'Authority decision recorded', (next, project) => {
          stage(project, ['Approval']);
          const permit = find(project.permits, permitId, 'Permit');
          if (permit.status !== 'Submitted') throw new Error('This permit has already been decided.');
          permit.status = choice(input.decision, ['Approved', 'Rejected'], 'decision');
          permit.decidedOn = date(input.date, 'Decision date');
          if (permit.decidedOn < permit.submittedAt) throw new Error('The decision date cannot be before submission.');
        }, 'decide');
      },

      defineBuilding(projectId, input) {
        return write('Building defined', projectId, 'Flats generated from the approved design', (next, project) => {
          stage(project, ['Approval']);
          if (next.sales.some(sale => sale.projectId === project.id)) throw new Error('Flats cannot be regenerated after sales have started.');
          const storeys = whole(input.storeys, 'Residential floors', 1, 40);
          const types = (input.types || []).filter(type => String(type.code ?? '').trim()).map(type => ({
            code: text(type.code, 'Flat type').toUpperCase().slice(0, 2), sizeSft: whole(type.sizeSft, 'Flat size', 300, 10000), beds: whole(type.beds, 'Bedrooms', 1, 8)
          }));
          if (!types.length || types.length > 6) throw new Error('Define between one and six flat types.');
          if (new Set(types.map(type => type.code)).size !== types.length) throw new Error('Flat type codes must be unique.');
          project.building = {storeys, basements: whole(input.basements || 0, 'Basements', 0, 5), parkingSlots: whole(input.parkingSlots || 0, 'Parking slots', 0, 500), types};
          project.units = [];
          for (let floor = 1; floor <= storeys; floor += 1) {
            for (const type of types) project.units.push({id: id('unit'), label: floor + type.code, floor, type: type.code, sizeSft: type.sizeSft, beds: type.beds, owner: 'Developer', status: 'Available', handover: null});
          }
        }, 'units');
      },

      allocateLandowner(projectId, unitIds) {
        return write('Landowner share allocated', projectId, unitIds.length + ' flats allocated', (next, project) => {
          stage(project, SITE_STAGES);
          if (!project.land.developerShare) throw new Error('Record the JV share ratio first.');
          const chosen = new Set(unitIds);
          for (const unitId of chosen) find(project.units, unitId, 'Flat');
          for (const unit of project.units) {
            const target = chosen.has(unit.id) ? 'Landowner' : 'Developer';
            if (unit.owner !== target && unit.status !== 'Available') throw new Error(`Flat ${unit.label} is already ${unit.status.toLowerCase()} and cannot change owner.`);
          }
          project.units.forEach(unit => {unit.owner = chosen.has(unit.id) ? 'Landowner' : 'Developer';});
          const share = landShare(project);
          if (share.allocatedSft > share.entitledSft * (1 + SHARE_TOLERANCE)) throw new Error(`Allocation of ${share.allocatedSft} sft exceeds the landowner's agreed share of ${share.entitledSft} sft.`);
        }, 'units');
      },

      setPricing(projectId, input) {
        return write('Pricing updated', projectId, 'Flat price list updated', (next, project) => {
          stage(project, SALE_STAGES);
          project.pricing = {
            ratePerSft: round(number(input.ratePerSft, 'Rate per sft', 1)),
            parkingPrice: round(number(input.parkingPrice || 0, 'Parking price')),
            utilityCharge: round(number(input.utilityCharge || 0, 'Utility charge'))
          };
        }, 'units');
      },

      addCustomer(input, customerId = '') {
        return write(customerId ? 'Customer updated' : 'Customer added', '', input.name, next => {
          const customer = {name: text(input.name, 'Customer name'), phone: mobile(input.phone), nid: nid(input.nid), email: text(input.email, 'Email', false), address: text(input.address, 'Address')};
          if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new Error('Enter a valid email address.');
          if (next.customers.some(item => item.id !== customerId && item.phone === customer.phone)) throw new Error('A customer with this mobile number already exists.');
          if (customerId) return Object.assign(find(next.customers, customerId, 'Customer'), customer);
          const record = {id: id('customer'), ...customer, createdAt: timestamp()};
          next.customers.push(record);
          return record;
        }, 'sales');
      },

      bookUnit(projectId, input) {
        return write('Flat booked', projectId, 'Booking recorded', (next, project) => {
          stage(project, SALE_STAGES);
          if (!permitApproved(project, 'Building plan approval')) throw new Error('Flats cannot be sold before the building plan is approved.');
          if (!project.pricing.ratePerSft) throw new Error('Set the flat price list first.');
          const unit = find(project.units, input.unitId, 'Flat');
          if (unit.owner !== 'Developer') throw new Error('Landowner flats cannot be sold by the developer.');
          if (unit.status !== 'Available') throw new Error('This flat is not available.');
          const customer = find(next.customers, input.customerId, 'Customer');
          const bookedOn = date(input.date, 'Booking date');
          const rate = round(number(input.rate || project.pricing.ratePerSft, 'Rate per sft', 1));
          const parking = whole(input.parking || 0, 'Parking', 0, 2);
          const usedParking = next.sales.filter(sale => sale.projectId === project.id && sale.status !== 'Cancelled').reduce((count, sale) => count + sale.parking, 0);
          if (usedParking + parking > (project.building?.parkingSlots || 0)) throw new Error('No parking slots remain.');
          const discount = round(number(input.discount || 0, 'Discount'));
          const price = unitPrice(project, unit, parking, rate, discount);
          if (price <= 0 || discount > unit.sizeSft * rate * 0.25) throw new Error('Discount cannot exceed 25% of the flat value.');
          const bookingMoney = round(number(input.bookingMoney, 'Booking money', 1));
          const downPayment = round(number(input.downPayment || 0, 'Down payment'));
          const rest = round(price - bookingMoney - downPayment);
          if (rest <= 0) throw new Error('Booking money and down payment must be less than the total price.');
          const plan = [{id: id('due'), kind: 'booking', label: 'Booking money', amount: bookingMoney, dueDate: bookedOn}];
          if (downPayment) plan.push({id: id('due'), kind: 'down', label: 'Down payment', amount: downPayment, dueDate: addDays(bookedOn, 30)});
          let parts;
          if (input.planType === 'milestone') {
            const remaining = project.packages.filter(item => packageProgress(project, item) < 100).sort((a, b) => a.end.localeCompare(b.end));
            if (!remaining.length) throw new Error('No construction milestones remain. Use a monthly plan.');
            parts = remaining.map(item => ({kind: 'milestone', label: 'On completion: ' + item.name, milestoneId: item.id}));
          } else if (input.planType === 'monthly') {
            const count = whole(input.installments, 'Number of installments', 1, 120);
            const first = date(input.firstDue, 'First installment date');
            if (first < bookedOn) throw new Error('Installments cannot start before the booking date.');
            parts = Array.from({length: count}, (_, index) => ({kind: 'installment', label: 'Installment ' + (index + 1), dueDate: addMonths(first, index)}));
          } else throw new Error('Select a payment plan.');
          const share = Math.floor(rest / parts.length);
          parts.forEach((part, index) => plan.push({id: id('due'), ...part, amount: index === parts.length - 1 ? round(rest - share * (parts.length - 1)) : share}));
          const sale = {
            id: id('sale'), no: 'SA-' + pad(next.sales.length + 1), projectId: project.id, unitId: unit.id, customerId: customer.id,
            date: bookedOn, rate, parking, utility: project.pricing.utilityCharge, discount, price, planType: input.planType, plan,
            status: 'Booked', agreementDate: '', cancelledOn: '', refund: null
          };
          next.sales.push(sale);
          unit.status = 'Booked';
          return sale;
        }, 'sales');
      },

      signAgreement(projectId, saleId, input) {
        return write('Sale agreement signed', projectId, 'Agreement for sale executed', (next, project) => {
          stage(project, SALE_STAGES);
          const sale = saleOf(next, project, saleId);
          if (sale.status !== 'Booked') throw new Error('Only a booked sale can be signed.');
          if (!statement(next, sale).upfrontPaid) throw new Error('Collect the booking money and down payment before signing.');
          const signed = date(input.date, 'Agreement date');
          if (signed < sale.date) throw new Error('The agreement cannot be dated before the booking.');
          sale.status = 'Agreement signed';
          sale.agreementDate = signed;
          find(project.units, sale.unitId, 'Flat').status = 'Sold';
        }, 'sales');
      },

      cancelSale(projectId, saleId, input) {
        return write('Sale cancelled', projectId, 'Booking cancelled with refund', (next, project) => {
          stage(project, SALE_STAGES);
          const sale = saleOf(next, project, saleId);
          const unit = find(project.units, sale.unitId, 'Flat');
          if (sale.status === 'Cancelled') throw new Error('This sale is already cancelled.');
          if (unit.status === 'Handed over') throw new Error('A handed-over flat cannot be cancelled.');
          const deductionPct = number(input.deductionPct, 'Deduction', 0, 100);
          const paid = statement(next, sale).paid;
          sale.status = 'Cancelled';
          sale.cancelledOn = date(input.date, 'Cancellation date');
          sale.refund = {deductionPct, amount: round(paid - paid * deductionPct / 100), reason: text(input.reason, 'Reason')};
          unit.status = 'Available';
        }, 'decide');
      },

      addReceipt(input) {
        const current = find(records.sales, input.saleId, 'Sale');
        return write('Payment received', current.projectId, 'Money receipt issued', (next, project) => {
          stage(project, SALE_STAGES);
          const sale = saleOf(next, project, input.saleId);
          if (sale.status === 'Cancelled') throw new Error('Payments cannot be received against a cancelled sale.');
          const amount = round(number(input.amount, 'Amount', 1));
          if (amount > statement(next, sale).balance) throw new Error('The payment exceeds the remaining balance.');
          const method = choice(input.method, paymentMethods, 'payment method');
          const receipt = {
            id: id('receipt'), no: 'MR-' + pad(next.receipts.length + 1), saleId: sale.id, projectId: project.id,
            date: date(input.date, 'Receipt date'), amount, method, ref: text(input.ref, 'Cheque / transaction reference', method !== 'Cash')
          };
          if (receipt.date < sale.date) throw new Error('A receipt cannot be dated before the booking.');
          next.receipts.push(receipt);
          return receipt;
        }, 'receipts');
      },

      addPackage(projectId, input) {
        return write('Milestone planned', projectId, input.name, (next, project) => {
          stage(project, SITE_STAGES);
          const start = date(input.start, 'Milestone start');
          const end = date(input.end, 'Milestone completion');
          if (start < project.start || end > project.end || end < start) throw new Error('Milestone dates must be within the project dates.');
          const item = {id: id('package'), name: text(input.name, 'Milestone name'), quantity: number(input.quantity, 'Planned quantity', 0.01), unit: text(input.unit, 'Unit'), start, end};
          project.packages.push(item);
          return item;
        }, 'site');
      },

      addDrawing(projectId, input) {
        return write('Drawing registered', projectId, input.reference, (next, project) => {
          stage(project, SITE_STAGES);
          find(project.packages, input.packageId, 'Milestone');
          const reference = text(input.reference, 'Drawing reference');
          const revision = text(input.revision, 'Revision');
          if (project.drawings.some(item => item.reference === reference && item.revision === revision)) throw new Error('That drawing revision is already registered.');
          const url = text(input.url, 'Drawing URL', false);
          if (url && !/^https?:\/\//i.test(url) && !url.startsWith('assets/')) throw new Error('Use an http or https link for the drawing.');
          const drawing = {id: id('drawing'), packageId: input.packageId, reference, revision, title: text(input.title, 'Drawing title'), url, approved: false, superseded: false};
          project.drawings.push(drawing);
          return drawing;
        }, 'site');
      },

      approveDrawing(projectId, drawingId) {
        return write('Drawing approved', projectId, 'Current revision updated', (next, project) => {
          stage(project, SITE_STAGES);
          const drawing = find(project.drawings, drawingId, 'Drawing');
          project.drawings.filter(item => item.reference === drawing.reference && item.approved).forEach(item => {
            item.approved = false;
            item.superseded = true;
          });
          drawing.approved = true;
          drawing.superseded = false;
        }, 'decide');
      },

      addLog(projectId, input) {
        return write('Site log recorded', projectId, 'Progress recorded against milestone', (next, project) => {
          stage(project, ['Construction']);
          const item = find(project.packages, input.packageId, 'Milestone');
          const quantity = number(input.quantity, 'Completed quantity', 0);
          if (round(packageDone(project, item) + quantity) > item.quantity) throw new Error('Completed quantity exceeds the remaining milestone scope.');
          const drawing = input.drawingId ? find(project.drawings, input.drawingId, 'Drawing') : null;
          if (drawing && (drawing.packageId !== item.id || !drawing.approved)) throw new Error('Select an approved drawing for this milestone.');
          const log = {
            id: id('log'), packageId: item.id, quantity, date: date(input.date, 'Log date'), notes: text(input.notes, 'Progress notes'),
            labour: whole(input.labour || 0, 'Labour count', 0, 5000), weather: text(input.weather, 'Weather', false),
            blocker: text(input.blocker, 'Blocker', false), drawingId: drawing?.id || '',
            drawingReference: drawing ? drawing.reference + ' · Rev ' + drawing.revision : '', at: timestamp()
          };
          project.logs.push(log);
          return log;
        }, 'site');
      },

      raiseRfi(projectId, logId) {
        return write('RFI raised', projectId, 'Clarification requested from site record', (next, project) => {
          stage(project, ['Construction']);
          const log = find(project.logs, logId, 'Site log');
          if (!log.blocker) throw new Error('This site log has no blocker.');
          if (project.rfis.some(rfi => rfi.logId === logId)) throw new Error('An RFI already exists for this log.');
          project.rfis.push({id: id('rfi'), logId, packageId: log.packageId, question: log.blocker, drawingReference: log.drawingReference, response: '', at: timestamp()});
        }, 'site');
      },

      respondRfi(projectId, rfiId, response) {
        return write('RFI answered', projectId, 'Design clarification recorded', (next, project) => {
          stage(project, ['Construction']);
          const rfi = find(project.rfis, rfiId, 'RFI');
          if (rfi.response) throw new Error('This RFI already has a response.');
          rfi.response = text(response, 'Design response');
          rfi.respondedAt = timestamp();
        }, 'decide');
      },

      addChange(projectId, input) {
        return write('Budget revision submitted', projectId, input.title, (next, project) => {
          stage(project, SALE_STAGES);
          if (input.rfiId && !find(project.rfis, input.rfiId, 'RFI').response) throw new Error('Answer the RFI before pricing its revision.');
          const amount = round(number(input.amount, 'Revision amount', -1000000000000));
          if (amount === 0) throw new Error('A budget revision must have a non-zero amount.');
          if (summary(next, project).budget + amount < 0) throw new Error('The revision would make the budget negative.');
          project.changes.push({id: id('change'), title: text(input.title, 'Revision title'), reason: text(input.reason, 'Reason'), amount, rfiId: input.rfiId || '', status: 'Pending', at: timestamp()});
        }, 'site');
      },

      decideChange(projectId, changeId, decision) {
        return write('Budget revision ' + decision.toLowerCase(), projectId, 'Revision decision recorded', (next, project) => {
          stage(project, SALE_STAGES);
          const change = find(project.changes, changeId, 'Budget revision');
          if (change.status !== 'Pending') throw new Error('This revision has already been decided.');
          if (!['Approved', 'Rejected'].includes(decision)) throw new Error('Invalid decision.');
          if (decision === 'Approved' && summary(next, project).budget + change.amount < 0) throw new Error('The revision would make the budget negative.');
          change.status = decision;
          change.decidedAt = timestamp();
        }, 'decide');
      },

      requestMaterials(projectId, input) {
        return write('Materials requested', projectId, input.item, (next, project) => {
          stage(project, ['Construction']);
          if (input.packageId) find(project.packages, input.packageId, 'Milestone');
          const request = {id: id('request'), packageId: input.packageId || '', item: text(input.item, 'Material'), quantity: number(input.quantity, 'Quantity', 0.01), unit: text(input.unit, 'Unit'), status: 'Requested', at: timestamp()};
          project.requests.push(request);
          return request;
        }, 'procurement');
      },

      cancelRequest(projectId, requestId) {
        return write('Material request cancelled', projectId, 'Request closed', (next, project) => {
          stage(project, ['Construction']);
          const request = find(project.requests, requestId, 'Material request');
          if (request.status !== 'Requested') throw new Error('This request is already processed.');
          request.status = 'Cancelled';
        }, 'procurement');
      },

      createOrder(projectId, input) {
        return write('Purchase order issued', projectId, input.supplier, (next, project) => {
          stage(project, ['Construction']);
          const request = find(project.requests, input.requestId, 'Material request');
          if (request.status !== 'Requested') throw new Error('This request is already processed.');
          const order = {id: id('order'), requestId: request.id, item: request.item, quantity: request.quantity, unit: request.unit, supplier: text(input.supplier, 'Supplier'), rate: number(input.rate, 'Unit rate', 0.01), expected: date(input.expected, 'Expected delivery'), status: 'Ordered', receivedAt: null};
          project.orders.push(order);
          request.status = 'Ordered';
          return order;
        }, 'procurement');
      },

      receiveOrder(projectId, orderId) {
        return write('Materials received', projectId, 'Delivery acknowledged at site store', (next, project) => {
          stage(project, ['Construction']);
          const order = find(project.orders, orderId, 'Purchase order');
          if (order.status !== 'Ordered') throw new Error('This order is already closed.');
          order.status = 'Received';
          order.receivedAt = timestamp();
          find(project.requests, order.requestId, 'Material request').status = 'Fulfilled';
        }, 'procurement');
      },

      cancelOrder(projectId, orderId) {
        return write('Purchase order cancelled', projectId, 'Order closed without delivery', (next, project) => {
          stage(project, ['Construction']);
          const order = find(project.orders, orderId, 'Purchase order');
          if (order.status !== 'Ordered') throw new Error('Only open orders can be cancelled.');
          order.status = 'Cancelled';
          find(project.requests, order.requestId, 'Material request').status = 'Cancelled';
        }, 'decide');
      },

      saveCost(input, costId = '') {
        return write(costId ? 'Expense updated' : 'Expense recorded', input.projectId, input.description, (next, project) => {
          stage(project, OPEN_STAGES);
          if (input.orderId) find(project.orders.filter(order => order.status !== 'Cancelled'), input.orderId, 'Purchase order');
          const cost = {projectId: project.id, date: date(input.date, 'Expense date'), category: text(input.category, 'Category'), description: text(input.description, 'Description'), quantity: number(input.quantity, 'Quantity', 0.01), rate: number(input.rate, 'Unit rate', 0.01), orderId: input.orderId || '', voidedAt: null};
          if (costId) {
            const existing = find(next.costs, costId, 'Expense');
            if (existing.projectId !== project.id || existing.voidedAt) throw new Error('Cannot edit this expense.');
            Object.assign(existing, cost);
          } else next.costs.push({id: id('cost'), ...cost});
        }, 'costs');
      },

      voidCost(costId) {
        const cost = find(records.costs, costId, 'Expense');
        return write('Expense voided', cost.projectId, cost.description, next => {
          const record = find(next.costs, costId, 'Expense');
          if (record.voidedAt) throw new Error('This expense is already voided.');
          record.voidedAt = timestamp();
        }, 'decide');
      },

      addPunch(projectId, input) {
        return write('Defect recorded', projectId, input.description, (next, project) => {
          stage(project, ['Construction', 'Handover']);
          if (input.unitId) {
            const unit = find(project.units, input.unitId, 'Flat');
            if (unit.status === 'Handed over') throw new Error('This flat has already been handed over.');
          }
          project.punch.push({id: id('punch'), description: text(input.description, 'Defect description'), unitId: input.unitId || '', resolvedAt: null});
        }, 'site');
      },

      resolvePunch(projectId, punchId) {
        return write('Defect resolved', projectId, 'Defect rectified', (next, project) => {
          stage(project, ['Construction', 'Handover']);
          const item = find(project.punch, punchId, 'Defect');
          if (item.resolvedAt) throw new Error('This defect is already resolved.');
          item.resolvedAt = timestamp();
        }, 'site');
      },

      recordOccupancy(projectId, input) {
        return write('Occupancy certificate recorded', projectId, input.certificateNo, (next, project) => {
          stage(project, ['Construction']);
          project.occupancy = {certificateNo: text(input.certificateNo, 'Certificate no.'), date: date(input.date, 'Certificate date')};
        }, 'decide');
      },

      handoverUnit(projectId, unitId, input) {
        return write('Flat handed over', projectId, 'Possession given', (next, project) => {
          stage(project, ['Handover']);
          const unit = find(project.units, unitId, 'Flat');
          if (unit.status === 'Handed over') throw new Error('This flat has already been handed over.');
          if (unit.owner === 'Developer') {
            const sale = next.sales.find(item => item.unitId === unit.id && item.status !== 'Cancelled');
            if (!sale) throw new Error('Unsold flats remain with the developer.');
            if (sale.status !== 'Agreement signed') throw new Error('Sign the sale agreement before handover.');
            const balance = statement(next, sale).balance;
            if (balance > 0) throw new Error('The buyer still owes BDT ' + balance.toLocaleString('en-IN') + '. Collect the full price before handover.');
          }
          if (project.punch.some(item => item.unitId === unit.id && !item.resolvedAt)) throw new Error('Resolve the open defects in this flat first.');
          unit.status = 'Handed over';
          unit.handover = {date: date(input.date, 'Handover date'), receivedBy: text(input.receivedBy, 'Received by'), letterNo: text(input.letterNo, 'Possession letter no.')};
        }, 'decide');
      },

      formAssociation(projectId, input) {
        return write("Owners' association formed", projectId, input.name, (next, project) => {
          stage(project, ['Handover']);
          project.association = {name: text(input.name, 'Association name'), president: text(input.president, 'President'), date: date(input.date, 'Formation date')};
        }, 'decide');
      },

      saveUser(input, userId = '') {
        return write('Team member updated', '', input.name, next => {
          if (!roles.includes(input.role)) throw new Error('Select a valid role.');
          const user = {name: text(input.name, 'Name'), email: text(input.email, 'Email', false), role: input.role};
          if (user.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) throw new Error('Enter a valid email address.');
          if (userId) Object.assign(find(next.users, userId, 'Team member'), user);
          else next.users.push({id: id('user'), ...user});
        }, 'team');
      },

      addOption(kind, value) {
        return write('Settings updated', '', 'Option added', next => {
          if (!['categories', 'units'].includes(kind)) throw new Error('Unknown setting.');
          const option = text(value, 'Option');
          if (next.settings[kind].some(item => item.toLowerCase() === option.toLowerCase())) throw new Error('This option already exists.');
          next.settings[kind].push(option);
        }, 'team');
      }
    };
  }

  /* Example projects are built through the store itself, so every sample
     record obeys the same rules as records entered by users. */
  function sampleRecords() {
    const base = emptyRecords();
    base.sampleDataVersion = 1;
    const memory = new Map([[STORAGE_KEY, JSON.stringify(base)]]);
    const s = createStore({getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value)}, 'admin');
    const today = dhakaDay();
    const day = offset => addDays(today, offset);
    const unitId = (pid, label) => s.project(pid).units.find(unit => unit.label === label).id;
    let chequeNo = 104200;

    function pay(saleId, until, method = 'Cheque') {
      for (const row of s.statement(saleId, today).rows) {
        if (row.outstanding > 0 && row.due && row.due <= day(until)) {
          chequeNo += 1;
          s.addReceipt({saleId, date: row.due, amount: row.outstanding, method, ref: method === 'Cash' ? '' : (method === 'Cheque' ? 'Cheque ' : 'TRX ') + chequeNo});
        }
      }
    }

    function sell(pid, label, customer, bookedOn, plan) {
      const sale = s.bookUnit(pid, {unitId: unitId(pid, label), customerId: customer, date: day(bookedOn), parking: plan.parking ?? 1, discount: plan.discount || 0, bookingMoney: plan.booking, downPayment: plan.down, planType: plan.type, installments: plan.count, firstDue: plan.first === undefined ? undefined : day(plan.first)});
      pay(sale.id, bookedOn + 30);
      return sale.id;
    }

    function setup(input, owners, jv, permits, building, landownerFlats, pricing, milestones) {
      const pid = s.addProject(input).id;
      owners.forEach(owner => s.addLandowner(pid, owner));
      if (!jv) return pid;
      s.recordJv(pid, jv);
      s.advance(pid);
      for (const [type, refNo, submitted, decided] of permits) {
        const permit = s.addPermit(pid, {type, refNo, submittedAt: day(submitted), fee: 25000});
        if (decided !== null) s.decidePermit(pid, permit.id, {decision: 'Approved', date: day(decided)});
      }
      if (!building) return pid;
      s.defineBuilding(pid, building);
      if (landownerFlats) s.allocateLandowner(pid, landownerFlats.map(label => unitId(pid, label)));
      if (pricing) s.setPricing(pid, pricing);
      return {pid, milestones: (milestones || []).map(([name, quantity, unit, start, end]) => s.addPackage(pid, {name, quantity, unit, start: day(start), end: day(end)}).id)};
    }

    const log = (pid, packageId, quantity, offset, notes, labour = 40, weather = 'Sunny', blocker = '') =>
      s.addLog(pid, {packageId, quantity, date: day(offset), notes, labour, weather, blocker});

    const customers = [
      ['Tanvir Ahmed', '01711000101', '1990123456', 'House 12, Road 5, Mohammadpur, Dhaka'],
      ['Farzana Akter', '01819000202', '1987234567', 'Flat 4C, Green Road, Dhaka'],
      ['Shafiqul Islam', '01911000303', '1979345678', 'Riyadh, Saudi Arabia (local: Cumilla)'],
      ['Nasrin Sultana', '01552000404', '1985456789', 'Banasree Block C, Dhaka'],
      ['Rafiq Chowdhury', '01611000505', '1975567890', 'Gulshan 1, Dhaka'],
      ['Mehedi Hasan', '01712000606', '1992678901', 'Uttara Sector 7, Dhaka'],
      ['Sabrina Rahman', '01813000707', '1991789012', 'Lalmatia Block D, Dhaka'],
      ['Imran Hossain', '01914000808', '1983890123', 'London, UK (local: Sylhet)'],
      ['Jannatul Ferdous', '01715000909', '1995901234', 'Kalabagan, Dhaka'],
      ['Kamal Uddin', '01816001010', '1970012345', 'Narayanganj Sadar'],
      ['Ayesha Siddiqa', '01817001111', '1984112233', 'Nasirabad, Chattogram'],
      ['Zahid Hasan', '01818001212', '1981223344', 'GEC Circle, Chattogram'],
      ['Mosharraf Karim', '01819001313', '1978334455', 'Halishahar, Chattogram'],
      ['Shirin Akhter', '01711001414', '1986445566', 'Agrabad, Chattogram'],
      ['Habibur Rahman', '01712001515', '1977556677', 'Panchlaish, Chattogram'],
      ['Rubina Yasmin', '01713001616', '1989667788', 'Khulshi, Chattogram'],
      ['Abul Kalam', '01714001717', '1972778899', 'Mirpur 10, Dhaka'],
      ['Selina Parvin', '01715001818', '1980889900', 'Pallabi, Dhaka'],
      ['Mizanur Rahman', '01716001919', '1976990011', 'Kafrul, Dhaka'],
      ['Tahmina Khatun', '01717002020', '1988001122', 'Shewrapara, Dhaka'],
      ['Golam Mostofa', '01718002121', '1969112233', 'Kazipara, Dhaka']
    ].map(([name, phone, nidNo, address]) => s.addCustomer({name, phone, nid: nidNo, address}).id);
    const [tanvir, farzana, shafiq, nasrin, rafiq, mehedi, sabrina, imran, jannat, kamal, ayesha, zahid, mosharraf, shirin, habib, rubina, kalam, selina, mizan, tahmina, golam] = customers;

    // Lake View Residence: under construction, mid-way through sales.
    const lake = setup(
      {name: 'Lake View Residence', location: 'Road 9A, Dhanmondi, Dhaka', authority: 'RAJUK', start: day(-420), end: day(300), costBudget: 155000000},
      [{name: 'Md. Abdul Karim', nid: '1956123456', phone: '01711223344'}, {name: 'Rokeya Begum', nid: '1961234567', phone: '01811223355'}],
      {mouza: 'Dhanmondi', dagNo: 'CS 1123 / RS 2451', khatianNo: '512', areaKatha: 10, developerShare: 60, signingMoney: 15000000, monthlyRent: 80000, agreementDate: day(-420), deedNo: 'JV-4521/2025'},
      [['Land use clearance', 'RAJUK/LUC/2025/1188', -400, -380], ['Environmental clearance', 'DoE/DHK/2025/7741', -395, -350], ['Fire service NOC', 'FSCD/NOC/2025/3302', -390, -345], ['Building plan approval', 'RAJUK/BC/2025/0917', -375, -330]],
      {storeys: 9, basements: 0, parkingSlots: 16, types: [{code: 'A', sizeSft: 1650, beds: 3}, {code: 'B', sizeSft: 1450, beds: 3}]},
      ['2A', '2B', '3B', '4A', '4B', '5B', '6A'],
      {ratePerSft: 14000, parkingPrice: 1500000, utilityCharge: 350000},
      [['Piling & foundation', 120, 'piles', -300, -240], ['Ground floor slab', 1, 'slab', -240, -210], ['1st–3rd floor slabs', 3, 'slabs', -210, -140],
        ['4th–6th floor slabs', 3, 'slabs', -140, -60], ['7th–9th floor slabs & roof', 4, 'slabs', -60, 20], ['Brickwork & plaster', 100, '%', -30, 140],
        ['Tiles, doors & fittings', 100, '%', 100, 250], ['Lift, generator & utility connections', 1, 'lot', 220, 290]]
    );
    const [piling, ground, slabs13, slabs46, slabs79, brickwork] = lake.milestones;
    const L = lake.pid;
    const lakeFoundation = s.addDrawing(L, {packageId: piling, reference: 'STR-F01', revision: 'A', title: 'Pile layout and pile cap details', url: 'assets/reference-foundation.svg'});
    s.approveDrawing(L, lakeFoundation.id);
    const lakeSlab = s.addDrawing(L, {packageId: slabs46, reference: 'STR-S04', revision: 'B', title: 'Typical floor slab reinforcement', url: 'assets/reference-foundation.svg'});
    s.approveDrawing(L, lakeSlab.id);
    s.addDrawing(L, {packageId: brickwork, reference: 'ARC-P02', revision: 'C', title: 'Typical floor plan (revised kitchen)', url: 'assets/reference-foundation.svg'});
    const sale1A = sell(L, '1A', tanvir, -305, {type: 'milestone', booking: 500000, down: 3000000});
    const sale1B = sell(L, '1B', farzana, -300, {type: 'monthly', booking: 500000, down: 2500000, count: 36, first: -270});
    const sale3A = sell(L, '3A', shafiq, -295, {type: 'milestone', booking: 500000, down: 3500000, parking: 1});
    [sale1A, sale1B, sale3A].forEach((saleId, index) => s.signAgreement(L, saleId, {date: day(-290 + index * 5)}));
    s.advance(L);
    log(L, piling, 60, -270, 'Bored piling completed on grid A–C. Integrity tests passed.', 55);
    log(L, piling, 60, -245, 'Remaining piles and pile caps cast. Curing in progress.', 60);
    log(L, ground, 1, -215, 'Ground floor slab cast (M25). Cube samples sent to BUET lab.', 70);
    const sale5A = sell(L, '5A', nasrin, -200, {type: 'monthly', booking: 500000, down: 3000000, count: 24, first: -170});
    const sale8B = sell(L, '8B', kamal, -200, {type: 'monthly', booking: 500000, down: 2000000, count: 24, first: -170});
    const sale6B = sell(L, '6B', rafiq, -180, {type: 'milestone', booking: 500000, down: 4000000});
    [sale5A, sale8B, sale6B].forEach(saleId => s.signAgreement(L, saleId, {date: day(-150)}));
    log(L, slabs13, 1, -190, '1st floor slab cast.', 65, 'Rain in the afternoon');
    log(L, slabs13, 1, -165, '2nd floor slab cast.', 65);
    log(L, slabs13, 1, -145, '3rd floor slab cast.', 62);
    const sale7A = sell(L, '7A', mehedi, -150, {type: 'monthly', booking: 500000, down: 3000000, count: 30, first: -120});
    const sale7B = sell(L, '7B', sabrina, -100, {type: 'monthly', booking: 500000, down: 2500000, count: 24, first: -70, discount: 200000});
    [sale7A, sale7B].forEach(saleId => s.signAgreement(L, saleId, {date: day(-60)}));
    log(L, slabs46, 1, -120, '4th floor slab cast.', 60);
    log(L, slabs46, 1, -90, '5th floor slab cast after two rain days.', 58, 'Heavy rain');
    log(L, slabs46, 1, -62, '6th floor slab cast.', 60);
    const sale8A = sell(L, '8A', imran, -60, {type: 'milestone', booking: 500000, down: 4000000});
    s.signAgreement(L, sale8A, {date: day(-25)});
    s.cancelSale(L, sale8B, {deductionPct: 10, date: day(-90), reason: 'Buyer withdrew because of a job transfer abroad.'});
    log(L, slabs79, 1, -25, '7th floor slab cast.', 64);
    const blocked = log(L, brickwork, 15, -5, 'Brickwork on 1st–3rd floors. 1st class bricks from Savar kiln.', 48, 'Sunny', 'Kitchen wall position on the revised plan conflicts with the gas riser.');
    s.raiseRfi(L, blocked.id);
    const sale9A = sell(L, '9A', jannat, -6, {type: 'monthly', booking: 500000, down: 3000000, count: 24, first: 25});
    pay(sale1A, 0); pay(sale3A, -60); pay(sale5A, 0); pay(sale6B, 0); pay(sale7A, 0); pay(sale7B, 0); pay(sale8A, 0); pay(sale1B, -62);
    void sale9A;
    const rod = s.requestMaterials(L, {packageId: slabs79, item: 'Rod 500W (BSRM)', quantity: 18, unit: 'ton'});
    const rodOrder = s.createOrder(L, {requestId: rod.id, supplier: 'Rahman Steel Traders, Tejgaon', rate: 96000, expected: day(-20)});
    s.receiveOrder(L, rodOrder.id);
    const cement = s.requestMaterials(L, {packageId: slabs79, item: 'Cement (OPC)', quantity: 1200, unit: 'bag'});
    s.createOrder(L, {requestId: cement.id, supplier: 'Meghna Cement Dealer, Hazaribagh', rate: 540, expected: day(3)});
    s.requestMaterials(L, {packageId: brickwork, item: '1st class bricks', quantity: 80000, unit: 'pcs'});
    s.addChange(L, {title: 'Gas riser relocation', reason: 'Shift the riser behind the kitchen wall after the RFI response.', amount: 450000});
    s.addChange(L, {title: 'Soil test re-run', reason: 'Additional boreholes requested by RAJUK.', amount: 180000});
    s.decideChange(L, s.project(L).changes[1].id, 'Approved');

    // Sea Breeze Tower: handover in progress, two flats blocked.
    const sea = setup(
      {name: 'Sea Breeze Tower', location: 'Khulshi R/A, Chattogram', authority: 'CDA', start: day(-900), end: day(20), costBudget: 52000000},
      [{name: 'Alhaj Nurul Alam', nid: '1950345678', phone: '01811445566'}],
      {mouza: 'Khulshi', dagNo: 'BS 3307', khatianNo: '1178', areaKatha: 6, developerShare: 50, signingMoney: 8000000, monthlyRent: 30000, agreementDate: day(-900), deedNo: 'JV-2210/2023'},
      [['Land use clearance', 'CDA/LUC/2023/552', -880, -860], ['Environmental clearance', 'DoE/CTG/2023/3120', -875, -840], ['Fire service NOC', 'FSCD/CTG/2023/918', -870, -835], ['Building plan approval', 'CDA/BP/2023/1440', -860, -820]],
      {storeys: 6, basements: 0, parkingSlots: 8, types: [{code: 'A', sizeSft: 1300, beds: 3}, {code: 'B', sizeSft: 1100, beds: 2}]},
      ['1A', '1B', '2A', '2B', '3A', '3B'],
      {ratePerSft: 9500, parkingPrice: 800000, utilityCharge: 250000},
      [['Piling & foundation', 1, 'lot', -800, -700], ['Superstructure (6 floors)', 6, 'slabs', -700, -420], ['Brickwork, plaster & finishing', 100, '%', -420, -120], ['Lift, generator & utility connections', 1, 'lot', -150, -60]]
    );
    const S = sea.pid;
    const seaBuyers = [['4A', ayesha], ['4B', zahid], ['5A', mosharraf], ['5B', shirin], ['6A', habib], ['6B', rubina]];
    const seaSales = seaBuyers.map(([label, customer], index) => {
      const saleId = sell(S, label, customer, -810 + index * 10, {type: 'monthly', booking: 300000, down: 1500000, count: 24, first: -780 + index * 10});
      s.signAgreement(S, saleId, {date: day(-760 + index * 10)});
      return saleId;
    });
    s.advance(S);
    sea.milestones.forEach((packageId, index) => log(S, packageId, [1, 6, 100, 1][index], [-700, -420, -120, -60][index], ['Foundation complete.', 'Roof slab cast; superstructure complete.', 'Finishing complete on all floors.', 'Lift commissioned; Karnaphuli Gas and PDB connections live.'][index], 45));
    seaSales.forEach((saleId, index) => pay(saleId, index === 4 ? -300 : 0));
    s.saveCost({projectId: S, date: day(-80), category: 'Utilities & services', description: 'Lift installation (6-stop, 8 person)', quantity: 1, rate: 2800000});
    s.recordOccupancy(S, {certificateNo: 'CDA/OC/2026/211', date: day(-30)});
    s.advance(S);
    s.addPunch(S, {description: 'Seepage under the bathroom window; reseal and repaint.', unitId: unitId(S, '5B')});
    s.addPunch(S, {description: 'Replace cracked lobby floor tile.', unitId: ''});
    s.resolvePunch(S, s.project(S).punch[1].id);
    [['1A', 'Alhaj Nurul Alam'], ['1B', 'Alhaj Nurul Alam'], ['2A', 'Alhaj Nurul Alam'], ['2B', 'Alhaj Nurul Alam'], ['4A', 'Ayesha Siddiqa'], ['4B', 'Zahid Hasan'], ['5A', 'Mosharraf Karim']]
      .forEach(([label, receivedBy], index) => s.handoverUnit(S, unitId(S, label), {date: day(-20 + index), receivedBy, letterNo: 'SBT/PL/' + (101 + index)}));

    // Shapla Heights: completed and closed.
    const shapla = setup(
      {name: 'Shapla Heights', location: 'Section 11, Mirpur, Dhaka', authority: 'RAJUK', start: day(-1300), end: day(-200), costBudget: 38000000},
      [{name: 'Md. Siddiqur Rahman', nid: '1958456789', phone: '01911556677'}, {name: 'Hosne Ara', nid: '1963567890', phone: '01711556688'}],
      {mouza: 'Mirpur', dagNo: 'RS 8812', khatianNo: '2219', areaKatha: 4, developerShare: 50, signingMoney: 5000000, monthlyRent: 30000, agreementDate: day(-1300), deedNo: 'JV-0931/2022'},
      [['Land use clearance', 'RAJUK/LUC/2022/301', -1280, -1260], ['Environmental clearance', 'DoE/DHK/2022/1150', -1270, -1240], ['Fire service NOC', 'FSCD/NOC/2022/801', -1265, -1235], ['Building plan approval', 'RAJUK/BC/2022/0412', -1250, -1220]],
      {storeys: 5, basements: 0, parkingSlots: 6, types: [{code: 'A', sizeSft: 1100, beds: 3}, {code: 'B', sizeSft: 950, beds: 2}]},
      ['1A', '1B', '2A', '2B', '3B'],
      {ratePerSft: 8500, parkingPrice: 600000, utilityCharge: 200000},
      [['Foundation', 1, 'lot', -1200, -1100], ['Superstructure (5 floors)', 5, 'slabs', -1100, -800], ['Finishing & utilities', 100, '%', -800, -300]]
    );
    const H = shapla.pid;
    const shaplaSales = [['3A', kalam], ['4A', selina], ['4B', mizan], ['5A', tahmina], ['5B', golam]].map(([label, customer], index) => {
      const saleId = sell(H, label, customer, -1210 + index * 15, {type: 'monthly', booking: 200000, down: 1000000, count: 24, first: -1180 + index * 15});
      s.signAgreement(H, saleId, {date: day(-1170 + index * 15)});
      return saleId;
    });
    s.advance(H);
    shapla.milestones.forEach((packageId, index) => log(H, packageId, [1, 5, 100][index], [-1100, -800, -310][index], ['Foundation complete.', 'Roof slab cast.', 'Finishing and DESCO/Titas/WASA connections complete.'][index], 35));
    shaplaSales.forEach(saleId => pay(saleId, 0));
    s.saveCost({projectId: H, date: day(-900), category: 'Rod & steel', description: 'Rod 500W, full structure', quantity: 95, rate: 88000});
    s.saveCost({projectId: H, date: day(-700), category: 'Labour', description: 'Civil contractor final bill', quantity: 1, rate: 14500000});
    s.recordOccupancy(H, {certificateNo: 'RAJUK/OC/2025/088', date: day(-260)});
    s.advance(H);
    [...['1A', '1B', '2A', '2B', '3B'].map(label => [label, 'Md. Siddiqur Rahman']), ['3A', 'Abul Kalam'], ['4A', 'Selina Parvin'], ['4B', 'Mizanur Rahman'], ['5A', 'Tahmina Khatun'], ['5B', 'Golam Mostofa']]
      .forEach(([label, receivedBy], index) => s.handoverUnit(H, unitId(H, label), {date: day(-240 + index), receivedBy, letterNo: 'SH/PL/' + (201 + index)}));
    s.formAssociation(H, {name: 'Shapla Heights Flat Owners Association', president: 'Abul Kalam', date: day(-215)});
    s.advance(H);

    // Green Haven: approvals pending, so sales are blocked.
    const green = setup(
      {name: 'Green Haven', location: 'Block D, Bashundhara R/A, Dhaka', authority: 'RAJUK', start: day(-120), end: day(900), costBudget: 92000000},
      [{name: 'Kazi Anwar Hossain', nid: '1966678901', phone: '01611778899'}],
      {mouza: 'Vatara', dagNo: 'RS 4410', khatianNo: '885', areaKatha: 8, developerShare: 55, signingMoney: 12000000, monthlyRent: 0, agreementDate: day(-120), deedNo: 'JV-6110/2026'},
      [['Land use clearance', 'RAJUK/LUC/2026/2041', -100, -70], ['Environmental clearance', 'DoE/DHK/2026/5502', -95, -40], ['Fire service NOC', 'FSCD/NOC/2026/1290', -60, null], ['Building plan approval', 'RAJUK/BC/2026/1733', -45, null]],
      {storeys: 8, basements: 1, parkingSlots: 14, types: [{code: 'A', sizeSft: 2000, beds: 4}, {code: 'B', sizeSft: 1750, beds: 3}]}
    ).pid;

    // Purbachal Green Valley: land negotiation, no agreement yet.
    setup(
      {name: 'Purbachal Green Valley', location: 'Sector 12, Purbachal, Narayanganj', authority: 'RAJUK', start: day(30), end: day(1200), costBudget: 70000000},
      [{name: 'Md. Jalal Uddin', nid: '1968789012', phone: '01511889900'}], null
    );

    const costs = [
      [L, -330, 'Design & approvals', 'Architectural and structural design fee', 1, 2200000],
      [L, -268, 'Equipment', 'Piling rig hire (bored piles)', 1, 3600000],
      [L, -215, 'Cement', 'Cement for ground floor slab', 900, 520],
      [L, -200, 'Sand & stone chips', 'Sylhet sand and stone chips', 6000, 95],
      [L, -150, 'Rod & steel', 'Rod 500W for 1st–3rd floors', 42, 92000],
      [L, -62, 'Labour', 'Civil contractor running bill 4', 1, 6800000],
      [L, -20, 'Rod & steel', 'Rod 500W delivery against PO', 18, 96000],
      [L, -10, 'Sales & marketing', 'Newspaper ads and site billboard', 1, 350000]
    ];
    costs.forEach(([projectId, offset, category, description, quantity, rate]) => s.saveCost({projectId, date: day(offset), category, description, quantity, rate}));

    let records = s.snapshot();
    const renames = [[L, 'sample-lakeview'], [S, 'sample-seabreeze'], [H, 'sample-shapla'], [green, 'sample-greenhaven'], [records.projects[4].id, 'sample-purbachal']];
    let serialised = JSON.stringify(records);
    for (const [from, to] of renames) serialised = serialised.split(from).join(to);
    records = JSON.parse(serialised);
    const at = offset => day(offset) + 'T09:00:00Z';
    records.projects.find(project => project.id === 'sample-shapla').closedAt = at(-210);
    records.audit = [
      ['sample-lakeview', 'Flat booked', 'Flat 9A booked by Jannatul Ferdous.', -6, 'sales'],
      ['sample-lakeview', 'Site log recorded', 'Brickwork started on 1st–3rd floors; RFI raised for gas riser clash.', -5, 'pm'],
      ['sample-lakeview', 'Payment received', 'Installment received from Mehedi Hasan (Flat 7A).', -3, 'accounts'],
      ['sample-lakeview', 'Budget revision submitted', 'Gas riser relocation submitted for approval.', -2, 'pm'],
      ['sample-seabreeze', 'Flat handed over', 'Flat 5A handed over to Mosharraf Karim.', -14, 'admin'],
      ['sample-seabreeze', 'Defect recorded', 'Bathroom seepage in Flat 5B.', -18, 'pm'],
      ['sample-greenhaven', 'Permit submitted', 'Building plan submitted to RAJUK.', -45, 'pm'],
      ['sample-shapla', 'Stage advanced', 'Project closed after association formation.', -210, 'admin']
    ].map(([projectId, action, description, offset, role], index) => ({id: 'sample-event-' + index, projectId, action, description, role, at: at(offset)}));
    records.users = [
      {id: 'user-admin', name: 'Mahmud Rahman', email: 'md@example.com', role: 'admin'},
      {id: 'sample-user-pm', name: 'Arif Hossain', email: 'arif@example.com', role: 'pm'},
      {id: 'sample-user-sales', name: 'Sadia Islam', email: 'sadia@example.com', role: 'sales'},
      {id: 'sample-user-accounts', name: 'Kamrul Hasan', email: 'kamrul@example.com', role: 'accounts'},
      {id: 'sample-user-viewer', name: 'Nusrat Jahan', email: 'nusrat@example.com', role: 'viewer'}
    ];
    return records;
  }

  const api = {
    createStore, sampleRecords, STORAGE_KEY, total, round, roles, roleNames, permissions, statuses, authorities,
    requiredPermits, paymentMethods, addDays, dhakaDay, SHARE_TOLERANCE, MILESTONE_GRACE_DAYS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ConstructFlow = api;
})(typeof window !== 'undefined' ? window : globalThis);
