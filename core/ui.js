/* Shared rendering helpers and record lookups used by every module. */
(function () {
  'use strict';

  const {C, params, page, role, fileMode, root, projectId, store, routes} = CF.ctx;
  const STOP = Symbol('stop');
  const navigate = href => {location.href = href;};
  const assetUrl = value => /^https?:\/\//i.test(value) ? value : root + value;

  function url(route, query = {}, tab = '') {
    if (!routes[route]) throw new Error('Unknown page: ' + route);
    const values = new URLSearchParams({role, ...query});
    if (fileMode) values.set('page', route);
    return root + (fileMode ? 'index.html' : routes[route]) + '?' + values + (tab ? '#' + tab : '');
  }

  function notify(text, error = false) {
    const message = document.getElementById('message');
    message.textContent = text;
    message.className = error ? 'message error' : 'message';
    message.focus();
  }

  const can = permission => C.permissions[permission].includes(role);

  const actionPermission = {
    advance: 'project', 'approve-drawing': 'decide', rfi: 'site', 'approve-change': 'decide', 'reject-change': 'decide',
    'cancel-request': 'procurement', 'receive-order': 'procurement', 'cancel-order': 'decide', 'resolve-punch': 'site',
    'void-cost': 'decide', backup: 'team'
  };

  const formPermission = {
    'add-project': 'project', 'edit-project': 'project', landowner: 'project', jv: 'project', permit: 'permit', 'permit-decision': 'decide',
    building: 'units', allocate: 'units', pricing: 'units', customer: 'sales', booking: 'sales', receipt: 'receipts', agreement: 'sales',
    'cancel-sale': 'decide', package: 'site', drawing: 'site', 'site-log': 'site', 'rfi-response': 'decide', change: 'site',
    'material-request': 'procurement', 'purchase-order': 'procurement', cost: 'costs', punch: 'site', occupancy: 'decide',
    'handover-unit': 'decide', association: 'decide', user: 'team', option: 'team'
  };

  const tabs = ['overview', 'land', 'permits', 'units', 'sales', 'construction', 'procurement', 'costs', 'handover'];

  const tabLabels = {overview: 'Overview', land: 'Land & JV', permits: 'Permits', units: 'Flats', sales: 'Sales', construction: 'Construction', procurement: 'Procurement', costs: 'Budget & costs', handover: 'Handover'};

  const stageLabels = {Land: 'Land & JV', Approval: 'Approvals & sales launch', Construction: 'Construction', Handover: 'Flat handover', Closed: 'Closed'};

  const SALE_STAGES = ['Approval', 'Construction', 'Handover'];

  const SITE_STAGES = ['Approval', 'Construction'];

  const extraPermits = ['WASA water connection', 'DESCO / DPDC electricity connection', 'Titas gas connection', 'Civil Aviation height clearance'];

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

  const money = value => '৳ ' + Number(value || 0).toLocaleString('en-IN', {maximumFractionDigits: 2});

  const short = value => {
    const amount = Number(value || 0);
    const size = Math.abs(amount);
    return size >= 10000000 ? '৳ ' + (amount / 10000000).toFixed(2) + ' crore' : size >= 100000 ? '৳ ' + (amount / 100000).toFixed(2) + ' lakh' : money(amount);
  };

  const day = value => value ? new Date(value.length === 10 ? value + 'T00:00:00Z' : value).toLocaleDateString('en-GB', {timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric'}) : '—';

  const today = () => C.dhakaDay();

  const sft = value => Number(value || 0).toLocaleString('en-IN') + ' sft';

  const badgeTone = {
    success: ['Approved', 'Received', 'Fulfilled', 'Handed over', 'Resolved', 'Paid', 'Agreement signed', 'Closed', 'Ready', 'On track', 'Complete'],
    warning: ['Pending', 'Submitted', 'Requested', 'Ordered', 'Booked', 'Due', 'Land', 'Approval', 'Open', 'In progress'],
    danger: ['Overdue', 'Rejected', 'Cancelled', 'Delayed', 'Blocked'],
    info: ['Construction', 'Handover', 'Landowner', 'Upcoming', 'Not yet due']
  };

  const badge = value => `<span class="badge ${Object.keys(badgeTone).find(tone => badgeTone[tone].includes(value)) || ''}">${escape(value)}</span>`;

  const disabled = condition => condition ? ' disabled' : '';

  const isOpen = project => project && project.status !== 'Closed';

  const projectUrl = (id, tab = 'overview', extra = {}) => url('project', {project: id, ...extra}, tab);

  const saleUrl = saleId => url('sales', {sale: saleId});

  function link(label, href, primary = false) {
    return `<a class="button ${primary ? '' : 'secondary'}" href="${escape(href)}">${escape(label)}</a>`;
  }

  function button(label, action, recordId = '', allowed = true, pid = projectId) {
    if (actionPermission[action] && !can(actionPermission[action])) return '';
    return `<button type="button" class="button secondary small" data-action="${action}" data-id="${escape(recordId)}" data-project="${escape(pid)}"${disabled(!allowed)}>${escape(label)}</button>`;
  }

  function input(name, label, value = '', type = 'text', attributes = '') {
    return `<label class="field">${label}<input name="${name}" type="${type}" value="${escape(value)}" ${attributes}></label>`;
  }

  function textarea(name, label, value = '', required = true) {
    return `<label class="field">${label}<textarea name="${name}" maxlength="2000"${required ? ' required' : ''}>${escape(value)}</textarea></label>`;
  }

  function select(name, label, options, selected = '', placeholder = '') {
    return `<label class="field">${label}<select name="${name}"${placeholder ? '' : ' required'}>${placeholder ? `<option value="">${escape(placeholder)}</option>` : ''}${options.map(option => {
      const [value, title] = Array.isArray(option) ? option : [option, option];
      return `<option value="${escape(value)}"${String(selected) === String(value) ? ' selected' : ''}>${escape(title)}</option>`;
    }).join('')}</select></label>`;
  }

  function form(name, fields, submit, allowed = true, pid = projectId, recordId = '') {
    if (formPermission[name] && !can(formPermission[name])) return '';
    return `<form data-form="${name}" data-project="${escape(pid)}" data-id="${escape(recordId)}"><fieldset${disabled(!allowed)}>${fields}<div class="actions"><button class="button" type="submit">${escape(submit)}</button></div></fieldset></form>`;
  }

  function table(headers, rows, empty = 'No records yet.') {
    return rows.length ? `<div class="table-scroll"><table><thead><tr>${headers.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.map(cells => `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="empty">${escape(empty)}</p>`;
  }

  function card(title, body, description = '') {
    if (!String(body).trim()) return '';
    return `<section class="card"><h2>${escape(title)}</h2>${description ? `<p>${escape(description)}</p>` : ''}${body}</section>`;
  }

  const stack = (...sections) => `<div class="stack">${sections.join('\n')}</div>`;

  const columns = (left, right) => `<div class="two-column">${left}\n${right}</div>`;

  const definitionList = entries => `<dl class="totals">${entries.map(([label, value]) => `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join('\n')}</dl>`;

  const callout = (title, body) => `<div class="callout"><strong>${escape(title)}</strong><p>${escape(body)}</p></div>`;

  function heading(title, description, actions = '') {
    document.title = title + ' - ConstructFlow';
    return `<div class="page-heading"><div><h1>${escape(title)}</h1><p>${escape(description)}</p></div><div class="actions no-print">${actions}</div></div>`;
  }

  function metric(label, value) {
    return `<div><span class="metric-label">${escape(label)}</span><strong class="metric-value">${escape(value)}</strong></div>`;
  }

  function icon(name) {
    const paths = {
      helmet: '<path d="M4 16v-3a8 8 0 0 1 16 0v3M2 16h20v4H2zM9 5v7m6-7v7"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
      bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7z"/>',
      alert: '<path d="m12 3 10 18H2zM12 9v5m0 3v1"/>',
      folder: '<path d="M3 7V4h6l3 3h9v13H3zM12 11v6m-3-3h6"/>',
      list: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8m-8 4h5"/>',
      invoice: '<path d="M5 3h14v19l-3-2-4 2-4-2-3 2zM9 7h6m-6 4h6m-6 4h3"/>',
      chart: '<path d="M12 3v9h9a9 9 0 1 1-9-9Zm3 0a9 9 0 0 1 6 6h-6z"/>',
      truck: '<path d="M2 5h12v12H2zm12 5h4l4 4v3h-8M5 17v1m13-1v1"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
      check: '<path d="M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6"/>',
      moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
      building: '<path d="M4 21V3h11v18M15 9h5v12M2 21h20M8 7h3m-3 4h3m-3 4h3"/>',
      cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 10v4m12-4v4"/>',
      users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M16 4a3.5 3.5 0 0 1 0 7m6 10v-2a7 7 0 0 0-4-6.3"/>'
    };
    return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.list}</svg>`;
  }

  function dashboardStat(label, value, symbol, color, note = '') {
    return `<article class="stat-card accent-${color}">
      <div><span class="metric-label">${escape(label)}</span><strong class="metric-value">${escape(value)}</strong>${note ? `<small>${escape(note)}</small>` : ''}</div>
      <span class="stat-icon">${icon(symbol)}</span>
    </article>`;
  }

  function actionTile(title, description, href, symbol, color) {
    return `<a class="action-card accent-${color}" href="${escape(href)}">
      <span class="action-icon">${icon(symbol)}</span>
      <h3>${escape(title)}</h3><p>${escape(description)}</p>
    </a>`;
  }

  const customerOf = (records, customerId) => records.customers.find(item => item.id === customerId);

  const unitOf = (project, unitId) => project?.units.find(unit => unit.id === unitId);

  const projectOf = (records, id) => records.projects.find(item => item.id === id);

  const activeSales = records => records.sales.filter(sale => sale.status !== 'Cancelled');

  const saleForUnit = (records, unitId) => records.sales.find(sale => sale.unitId === unitId && sale.status !== 'Cancelled');

  const soldCount = project => project.units.filter(unit => unit.owner === 'Developer' && unit.status !== 'Available').length;

  function saleTitle(records, sale) {
    const project = projectOf(records, sale.projectId);
    return `${project?.name} · Flat ${unitOf(project, sale.unitId)?.label}`;
  }

  function nextStep(project) {
    if (project.status === 'Closed') return ['View final summary', 'handover'];
    const open = store.gateChecks(project).find(check => !check.done);
    return open ? [open.label, open.section] : ['Advance to the ' + stageLabels[C.statuses[C.statuses.indexOf(project.status) + 1]] + ' stage', 'overview'];
  }

  function stepper(project) {
    const index = C.statuses.indexOf(project.status);
    return `<ol class="stepper" aria-label="Project stage">${C.statuses.map((status, position) => `<li class="${position < index ? 'done' : position === index ? 'current' : ''}"${position === index ? ' aria-current="step"' : ''}><span>${position < index ? '✓' : position + 1}</span>${escape(stageLabels[status])}</li>`).join('')}</ol>`;
  }

  function milestoneState(project, item) {
    const progress = store.packageProgress(project, item);
    if (progress >= 100) return 'Complete';
    if (item.end < today()) return 'Delayed';
    return progress > 0 ? 'In progress' : item.start <= today() ? 'In progress' : 'Upcoming';
  }

  function projectRows(projects) {
    return projects.map(project => {
      const summary = store.summary(project);
      const finance = store.finance(project);
      const [next, tab] = nextStep(project);
      return [
        `<a class="project-name" href="${projectUrl(project.id)}">${escape(project.name)}</a><small>${escape(project.location)} · ${escape(project.authority)}</small>`,
        badge(project.status),
        `${summary.progress}%<progress max="100" value="${summary.progress}" aria-label="${escape(project.name)} construction progress"></progress>`,
        summary.developerUnits ? `${soldCount(project)} / ${summary.developerUnits}` : '—',
        finance.salesValue ? `${short(finance.collected)}<small>of ${short(finance.salesValue)}</small>` : '—',
        `<a href="${projectUrl(project.id, tab)}">${escape(next)} →</a>`
      ];
    });
  }

  function activityRows(events, records) {
    return events.map(event => {
      const project = projectOf(records, event.projectId);
      return [day(event.at), escape(event.action), project ? `<a href="${projectUrl(project.id)}">${escape(project.name)}</a>` : 'Organisation', escape(event.description), escape(C.roleNames[event.role] || event.role)];
    });
  }

  function overdueRows(records, projects) {
    const ids = new Set(projects.map(project => project.id));
    return activeSales(records).filter(sale => ids.has(sale.projectId)).map(sale => ({sale, statement: store.statement(sale.id)}))
      .filter(item => item.statement.overdue > 0).sort((a, b) => b.statement.daysLate - a.statement.daysLate)
      .map(({sale, statement}) => {
        const customer = customerOf(records, sale.customerId);
        return [`<a href="${saleUrl(sale.id)}">${escape(customer?.name)}</a><small>${escape(customer?.phone)}</small>`, escape(saleTitle(records, sale)), money(statement.overdue), `${statement.daysLate} days`, link('Open sale', saleUrl(sale.id))];
      });
  }

  function dueSoonRows(records, projects) {
    const ids = new Set(projects.map(project => project.id));
    return activeSales(records).filter(sale => ids.has(sale.projectId)).flatMap(sale => store.statement(sale.id).rows.filter(row => row.status === 'Due').map(row => ({sale, row})))
      .sort((a, b) => a.row.due.localeCompare(b.row.due))
      .map(({sale, row}) => [day(row.due), `<a href="${saleUrl(sale.id)}">${escape(customerOf(records, sale.customerId)?.name)}</a>`, escape(saleTitle(records, sale)), escape(row.label), money(row.outstanding)]);
  }

  function unavailable(reason) {
    return heading('Record unavailable', reason, link('View projects', url('projects')));
  }

  function saleRows(records, sales) {
    return sales.map(sale => {
      const statement = store.statement(sale.id);
      const customer = customerOf(records, sale.customerId);
      return [
        `<a href="${saleUrl(sale.id)}">${escape(sale.no)}</a><small>${day(sale.date)}</small>`, escape(saleTitle(records, sale)),
        `${escape(customer?.name)}<small>${escape(customer?.phone)}</small>`, money(sale.price), money(statement.paid),
        sale.status === 'Cancelled' ? '—' : money(statement.balance),
        badge(sale.status) + (statement.overdue ? ' ' + badge('Overdue') : ''), link('Open', saleUrl(sale.id))
      ];
    });
  }

  function milestoneTable(project) {
    return table(['Milestone', 'Schedule', 'Completed', 'Progress', 'Status'], project.packages.map(item => [
      escape(item.name), `${day(item.start)}<small>to ${day(item.end)}</small>`,
      `${C.round(project.logs.filter(log => log.packageId === item.id).reduce((value, log) => value + log.quantity, 0))} / ${item.quantity} ${escape(item.unit)}`,
      `${Math.round(store.packageProgress(project, item))}%<progress max="100" value="${Math.round(store.packageProgress(project, item))}" aria-label="${escape(item.name)} progress"></progress>`,
      badge(milestoneState(project, item))
    ]), 'No construction milestones planned yet.');
  }

  function changeTable(projects, pendingOnly = false) {
    const rows = projects.flatMap(project => project.changes.filter(change => !pendingOnly || change.status === 'Pending').map(change => [
      `<a href="${projectUrl(project.id, 'costs')}">${escape(project.name)}</a>`,
      `${escape(change.title)}<small>${escape(change.reason)}</small>`, money(change.amount), badge(change.status),
      change.status === 'Pending' ? `<div class="inline-actions">${button('Approve', 'approve-change', change.id, can('decide') && SALE_STAGES.includes(project.status), project.id)}${button('Reject', 'reject-change', change.id, can('decide') && SALE_STAGES.includes(project.status), project.id)}</div>` : day(change.decidedAt)
    ]));
    return table(['Project', 'Revision', 'Amount', 'Status', 'Decision'], rows, pendingOnly ? 'No revisions awaiting a decision.' : 'No budget revisions recorded.');
  }

  function readiness(project, records, unit) {
    if (unit.status === 'Handed over') return 'Handed over';
    if (project.punch.some(item => item.unitId === unit.id && !item.resolvedAt)) return 'Open defect';
    if (unit.owner === 'Landowner') return 'Ready';
    const sale = saleForUnit(records, unit.id);
    if (!sale) return 'Unsold';
    if (sale.status !== 'Agreement signed') return 'Agreement not signed';
    const balance = store.statement(sale.id).balance;
    return balance > 0 ? 'Balance ' + money(balance) : 'Ready';
  }

  function scheduleTable(statement) {
    return table(['Installment', 'Due', 'Amount', 'Paid', 'Status'], statement.rows.map(row => [
      escape(row.label), row.due ? day(row.due) : '<span class="muted">On milestone completion</span>', money(row.amount), money(row.paid),
      badge(row.status) + (row.daysLate ? `<small>${row.daysLate} days late</small>` : '')
    ]));
  }

  function receiptTable(statement, withLinks = true) {
    return table(['MR no.', 'Date', 'Method', 'Reference', 'Amount'], statement.receipts.map(receipt => [
      withLinks ? `<a href="${url('reports', {type: 'receipt', receipt: receipt.id})}">${escape(receipt.no)}</a>` : escape(receipt.no),
      day(receipt.date), escape(receipt.method), escape(receipt.ref || '—'), money(receipt.amount)
    ]), 'No payments received yet.');
  }

  function projectFilter(records, selected = '') {
    return `<form class="filters" data-form="filter">${select('project', 'Project', records.projects.map(project => [project.id, project.name]), selected, 'All projects')}<button type="submit" class="button">Apply</button></form>`;
  }

  function download(name, body, type) {
    const blob = new Blob([body], {type});
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  Object.assign(CF.ui, {C, params, page, role, fileMode, root, projectId, store, routes, STOP, navigate, assetUrl, url, notify, can, actionPermission, formPermission, tabs, tabLabels, stageLabels, SALE_STAGES, SITE_STAGES, extraPermits, escape, money, short, day, today, sft, badgeTone, badge, disabled, isOpen, projectUrl, saleUrl, link, button, input, textarea, select, form, table, card, stack, columns, definitionList, callout, heading, metric, icon, dashboardStat, actionTile, customerOf, unitOf, projectOf, activeSales, saleForUnit, soldCount, saleTitle, nextStep, stepper, milestoneState, projectRows, activityRows, overdueRows, dueSoonRows, unavailable, saleRows, milestoneTable, changeTable, readiness, scheduleTable, receiptTable, projectFilter, download});
})();
