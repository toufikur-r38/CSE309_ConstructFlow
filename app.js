/* Shared page rendering. Record changes go through app-store.js. */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const C = ConstructFlow;
  const params = new URLSearchParams(location.search);
  const fileMode = location.protocol === 'file:';
  const entryPage = location.pathname.replace(/\/+$/, '').split('/').pop()?.replace(/\.html$/, '') || 'index';
  const page = fileMode ? params.get('page') || entryPage : entryPage;
  let savedRole;
  try { savedRole = sessionStorage.getItem('constructflow.role'); } catch (_) { /* URL preserves role when session storage is disabled. */ }
  const requestedRole = params.get('role') || savedRole || 'admin';
  const role = C.roles.includes(requestedRole) ? requestedRole : 'viewer';
  try { sessionStorage.setItem('constructflow.role', role); } catch (_) { /* Optional preference. */ }

  // File URLs can isolate storage per HTML file. Keep direct-file navigation on
  // index.html so every section uses the same records, just as it does on HTTP.
  if (fileMode && entryPage !== 'index') {
    params.set('page', page);
    location.replace('index.html?' + params + location.hash);
    return;
  }
  const can = permission => C.permissions[permission].includes(role);
  const projectId = params.get('project') || '';
  const content = document.getElementById('content');
  const message = document.getElementById('message');
  const tabs = ['overview', 'land', 'permits', 'units', 'sales', 'construction', 'procurement', 'costs', 'handover'];
  const tabLabels = {overview: 'Overview', land: 'Land & JV', permits: 'Permits', units: 'Flats', sales: 'Sales', construction: 'Construction', procurement: 'Procurement', costs: 'Budget & costs', handover: 'Handover'};
  const stageLabels = {Land: 'Land & JV', Approval: 'Approvals & sales launch', Construction: 'Construction', Handover: 'Flat handover', Closed: 'Closed'};
  const SALE_STAGES = ['Approval', 'Construction', 'Handover'];
  const SITE_STAGES = ['Approval', 'Construction'];
  const extraPermits = ['WASA water connection', 'DESCO / DPDC electricity connection', 'Titas gas connection', 'Civil Aviation height clearance'];
  let store;
  let theme = 'light';
  try { theme = localStorage.getItem('constructflow.theme') === 'dark' ? 'dark' : 'light'; } catch (_) { /* Use the light theme when preferences are unavailable. */ }
  document.documentElement.dataset.theme = theme;

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

  function url(file, query = {}, tab = '') {
    const values = new URLSearchParams({role, ...query});
    if (fileMode) values.set('page', file.replace(/\.html$/, ''));
    return (fileMode ? 'index.html' : file) + '?' + values + (tab ? '#' + tab : '');
  }

  const projectUrl = (id, tab = 'overview', extra = {}) => url('workspace.html', {project: id, ...extra}, tab);
  const saleUrl = saleId => url('sales.html', {sale: saleId});

  function link(label, href, primary = false) {
    return `<a class="button ${primary ? '' : 'secondary'}" href="${escape(href)}">${escape(label)}</a>`;
  }

  function button(label, action, recordId = '', allowed = true, pid = projectId) {
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
    return `<form data-form="${name}" data-project="${escape(pid)}" data-id="${escape(recordId)}"><fieldset${disabled(!allowed)}>${fields}<div class="actions"><button class="button" type="submit">${escape(submit)}</button></div></fieldset></form>`;
  }

  function table(headers, rows, empty = 'No records yet.') {
    return rows.length ? `<div class="table-scroll"><table><thead><tr>${headers.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.map(cells => `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="empty">${escape(empty)}</p>`;
  }

  function card(title, body, description = '') {
    return `<section class="card"><h2>${escape(title)}</h2>${description ? `<p>${escape(description)}</p>` : ''}${body}</section>`;
  }

  const stack = (...sections) => `<div class="stack">${sections.join('\n')}</div>`;
  const columns = (left, right) => `<div class="two-column">${left}\n${right}</div>`;
  const definitionList = entries => `<dl class="totals">${entries.map(([label, value]) => `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join('\n')}</dl>`;
  const callout = (title, body) => `<div class="callout"><strong>${escape(title)}</strong><p>${escape(body)}</p></div>`;
  const roleNote = permission => can(permission) ? '' : `<p class="status-line">Your role (${escape(C.roleNames[role])}) can view this section but cannot change it.</p>`;

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

  function notify(text, error = false) {
    message.textContent = text;
    message.className = error ? 'message error' : 'message';
    message.focus();
  }

  function shell() {
    const navigation = [
      ['index', 'Dashboard', 'index.html'], ['view_projects', 'Projects', 'view_projects.html'],
      ['sales', 'Sales', 'sales.html'], ['collections', 'Collections', 'collections.html'],
      ['customers', 'Customers', 'customers.html'], ['approvals', 'Approvals', 'approvals.html'], ['reports', 'Reports', 'reports.html']
    ];
    const more = [['Procurement', 'procurement.html'], ['Expenses', 'view_costs.html'], ['Buyer view', 'buyer.html'],
      ...(can('team') ? [['Team', 'register.html'], ['Activity log', 'audit_log.html'], ['Settings', 'dropdown_options.html']] : [])];
    document.getElementById('header').innerHTML = `
      <a class="brand" href="${url('index.html')}"><img src="assets/constructflow-logo.png" alt="ConstructFlow — Project Management" width="181" height="48"></a>
      <nav aria-label="Main navigation">${navigation.map(([key, label, file]) => `<a href="${url(file)}"${(key === page || (key === 'view_projects' && ['workspace', 'add_project', 'edit_project'].includes(page))) ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
      <details><summary>More</summary><div>${more.map(([label, file]) => `<a href="${url(file)}">${label}</a>`).join('')}</div></details></nav>
      <div class="account">
        <button class="theme-toggle" type="button" data-action="toggle-theme" aria-label="Switch to ${theme === 'light' ? 'dark' : 'light'} mode">${icon(theme === 'light' ? 'moon' : 'sun')}</button>
        <a class="user-badge" href="${url('profile.html')}"><span class="user-avatar">${icon('user')}</span>${escape(C.roleNames[role])}</a>
        <label class="role-label">View as<select id="role-select" aria-label="View as role">${C.roles.map(key => `<option value="${key}">${escape(C.roleNames[key])}</option>`).join('')}</select></label>
      </div>`;
    document.getElementById('role-select').value = role;
  }

  /* Shared lookups */

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

  function dashboard(records) {
    const open = records.projects.filter(isOpen);
    const finances = records.projects.map(project => store.finance(project));
    const add = key => finances.reduce((value, item) => value + item[key], 0);
    const overdueSales = finances.reduce((value, item) => value + item.overdueSales, 0);
    const summaries = records.projects.map(project => store.summary(project));
    const unitsBy = key => summaries.reduce((value, item) => value + item[key], 0);
    const monthReceipts = records.receipts.filter(receipt => receipt.date.slice(0, 7) === today().slice(0, 7)).reduce((value, receipt) => value + receipt.amount, 0);
    const pendingDecisions = records.projects.reduce((value, project) => value + project.permits.filter(item => item.status === 'Submitted').length + project.changes.filter(item => item.status === 'Pending').length, 0);
    const tiles = [
      can('project') ? actionTile('Start a project', 'Register land and a landowner', url('add_project.html'), 'folder', 'warning') : '',
      can('sales') ? actionTile('Book a flat', 'Choose a project and flat', url('sales.html'), 'building', 'primary') : '',
      can('sales') ? actionTile('Customers', 'Add or find a buyer', url('customers.html'), 'users', 'info') : '',
      can('receipts') ? actionTile('Receive payment', 'Issue a money receipt', url('collections.html'), 'cash', 'success') : '',
      can('site') ? actionTile('Site progress', 'Record the daily site log', url('view_projects.html'), 'helmet', 'warning') : '',
      can('costs') ? actionTile('Record expense', 'Materials, labour, and services', url('select_cost_project.html'), 'invoice', 'danger') : '',
      can('procurement') ? actionTile('Procurement', 'Requests, orders, deliveries', url('procurement.html'), 'truck', 'info') : '',
      can('decide') ? actionTile('Approvals', pendingDecisions + ' decisions waiting', url('approvals.html'), 'check', 'primary') : '',
      actionTile('Reports', 'Statements, collections, P&L', url('reports.html'), 'chart', 'success')
    ].filter(Boolean).slice(0, 6).join('\n');
    return heading(C.roleNames[role] + ' dashboard', 'Portfolio status · ' + day(today()), can('project') ? link('Start a project', url('add_project.html'), true) : '') +
      `<div class="dashboard-metrics">
        ${dashboardStat('Running projects', open.length, 'building', 'primary', records.projects.length - open.length + ' closed')}
        ${dashboardStat('Sales booked', short(add('salesValue')), 'invoice', 'info', unitsBy('sold') + unitsBy('booked') + ' flats sold or booked')}
        ${dashboardStat('Collected', short(add('collected')), 'cash', 'success', short(monthReceipts) + ' this month')}
        ${dashboardStat('Overdue', short(add('overdue')), 'alert', overdueSales ? 'danger' : 'success', overdueSales + ' buyers late')}
      </div>
      <div class="portfolio-summary" aria-label="Portfolio totals">
        ${C.statuses.map(status => metric(stageLabels[status], records.projects.filter(project => project.status === status).length)).join('')}
        ${metric('Unsold flats', unitsBy('available'))}
        ${metric('Receivable', short(add('receivable')))}
      </div>
      <section class="quick-actions"><h2>Quick actions</h2><div class="action-grid">${tiles}</div></section>` +
      card('Projects', table(['Project', 'Stage', 'Construction', 'Flats sold', 'Collected', 'Next step'], projectRows(open), 'No running projects. Start a project to begin.')) +
      `<div class="section-gap">${columns(
        card('Overdue buyers', table(['Buyer', 'Flat', 'Overdue', 'Late by', ''], overdueRows(records, records.projects).slice(0, 8), 'No overdue installments.'), 'Follow up by phone before the next site visit.'),
        card('Due in the next 30 days', table(['Due', 'Buyer', 'Flat', 'Installment', 'Amount'], dueSoonRows(records, records.projects).slice(0, 8), 'Nothing falls due in the next 30 days.'))
      )}</div>` +
      `<div class="section-gap">${card('Recent activity', table(['Date', 'Activity', 'Project', 'Details', 'Role'], activityRows(records.audit.slice(0, 8), records)))}</div>`;
  }

  function projectList(records, title = 'Projects') {
    const search = (params.get('q') || '').toLowerCase();
    const status = params.get('status') || '';
    const projects = records.projects.filter(project => (!status || project.status === status) && `${project.name} ${project.location} ${project.authority}`.toLowerCase().includes(search));
    const filters = `<form class="filters" data-form="filter">${input('q', 'Search', params.get('q') || '', 'search')}${select('status', 'Stage', C.statuses, status, 'All stages')}<button class="button" type="submit">Apply filters</button></form>`;
    return heading(title, 'Every project moves through land, approvals, construction, handover, and closure.', can('project') ? link('Start a project', url('add_project.html'), true) : '') +
      card('Project register', filters + table(['Project', 'Stage', 'Construction', 'Flats sold', 'Collected', 'Next step'], projectRows(projects), 'No projects match these filters.'));
  }

  function projectForm(records, project = null) {
    if (!can('project')) return unavailable('Only the Managing Director can create or edit projects.');
    if (project && !isOpen(project)) return unavailable('This project is closed.');
    const fields = `<div class="form-row">${input('name', 'Project name', project?.name, 'text', 'required maxlength="150" placeholder="e.g. Lake View Residence"')}${select('authority', 'Approving authority', C.authorities, project?.authority || 'RAJUK')}</div>
      ${input('location', 'Plot address', project?.location, 'text', 'required placeholder="Plot, road, area, city"')}
      <div class="form-row">${input('start', 'Start date', project?.start || today(), 'date', 'required')}${input('end', 'Planned handover', project?.end, 'date', 'required')}</div>
      ${project ? '<p class="status-line">The construction budget is preserved. Submit a budget revision to change it.</p>' : input('costBudget', 'Construction budget (BDT)', '', 'number', 'min="1" step="1" required') + '<p class="status-line">New projects start at the Land stage. Record the landowner and JV agreement next.</p>'}`;
    return heading(project ? 'Edit project' : 'Start a project', project ? project.name : 'Register the plot once. Every later record links to this project.', link('Back to projects', url('view_projects.html'))) +
      card('Project details', form(project ? 'edit-project' : 'add-project', fields, project ? 'Save changes' : 'Create project', true, project?.id || ''));
  }

  function unavailable(reason) {
    return heading('Record unavailable', reason, link('View projects', url('view_projects.html')));
  }

  /* Project workspace */

  function workspace(project, records) {
    if (!project) return projectList(records, 'Select a project');
    const summary = store.summary(project);
    const finance = store.finance(project);
    const requested = location.hash.slice(1);
    const tab = tabs.includes(requested) ? requested : 'overview';
    const actions = link('Reports', url('reports.html', {project: project.id})) +
      (can('project') && isOpen(project) ? link('Edit details', url('edit_project.html', {project: project.id})) : '');
    const header = heading(project.name, `${project.location} · ${project.authority}`, actions) +
      `<section class="project-header"><div class="project-heading"><div>${badge(project.status)} <span class="muted">${day(project.start)} – ${day(project.end)}</span></div><a href="${url('view_projects.html')}">All projects</a></div>
      ${stepper(project)}
      <div class="summary-grid">${metric('Construction', summary.progress + '%')}${metric('Flats sold', `${soldCount(project)} / ${summary.developerUnits}`)}${metric('Collected', short(finance.collected))}${metric('Spent / budget', `${short(summary.spending)} / ${short(summary.budget)}`)}</div></section>
      <nav class="tabs" aria-label="Project sections">${tabs.map(key => `<a href="${projectUrl(project.id, key)}"${tab === key ? ' aria-current="page"' : ''}>${tabLabels[key]}</a>`).join('')}</nav>`;
    const views = {overview: overviewTab, land: landTab, permits: permitsTab, units: unitsTab, sales: salesTab, construction: constructionTab, procurement: procurementTab, costs: costsTab, handover: handoverTab};
    return header + views[tab](project, records);
  }

  function overviewTab(project, records) {
    const checks = store.gateChecks(project);
    const ready = checks.length && checks.every(check => check.done);
    const finance = store.finance(project);
    const nextStage = C.statuses[C.statuses.indexOf(project.status) + 1];
    const gate = project.status === 'Closed'
      ? callout('Project closed', `Closed on ${day(project.closedAt)}. All records are read-only.`)
      : `<ul class="checklist">${checks.map(check => `<li class="${check.done ? 'done' : ''}">${check.done ? '✓' : '○'} <a href="${projectUrl(project.id, check.section)}">${escape(check.label)}</a></li>`).join('')}</ul>
        <div class="actions">${button('Advance to ' + stageLabels[nextStage], 'advance', '', can('project') && ready, project.id)}</div>
        <p class="status-line">${ready ? 'All checks are complete.' : 'Each check must be complete before the project can move on.'} ${can('project') ? '' : 'Only the Managing Director advances stages.'}</p>`;
    const money1 = definitionList([
      ['Sales value (booked)', money(finance.salesValue)], ['Collected', money(finance.collected)],
      ['Receivable', money(finance.receivable)], ['Overdue', money(finance.overdue)],
      ['Unsold stock value', project.pricing.ratePerSft ? money(finance.unsoldValue) : 'Price list not set'],
      ['Land cost (signing money + rent)', money(finance.landCost)], ['Construction cost (budget or actual)', money(finance.constructionCost)],
      ['Projected margin', project.pricing.ratePerSft ? money(finance.projectedMargin) : '—']
    ]);
    const receipts = records.receipts.filter(receipt => receipt.projectId === project.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
      .map(receipt => {
        const sale = records.sales.find(item => item.id === receipt.saleId);
        return [day(receipt.date), escape(receipt.no), `${escape(customerOf(records, sale.customerId)?.name)}<small>Flat ${escape(unitOf(project, sale.unitId)?.label)}</small>`, money(receipt.amount)];
      });
    return columns(
      stack(card(project.status === 'Closed' ? 'Stage' : 'To finish the ' + stageLabels[project.status] + ' stage', gate), card('Construction milestones', milestoneTable(project))),
      stack(card('Project finance', money1, 'Projected margin = sales value + unsold stock + forfeited booking money − land cost − construction cost.'), card('Latest money receipts', table(['Date', 'MR no.', 'Buyer', 'Amount'], receipts, 'No payments received yet.')))
    );
  }

  function landTab(project) {
    const land = project.land;
    const editable = can('project') && project.status === 'Land';
    const owners = table(['Landowner', 'NID', 'Mobile'], land.owners.map(owner => [escape(owner.name), escape(owner.nid), escape(owner.phone)]), 'No landowner recorded yet.');
    const ownerFields = input('name', 'Full name', '', 'text', 'required') + `<div class="form-row">${input('nid', 'NID number', '', 'text', 'required inputmode="numeric" pattern="[0-9 ]{10,20}"')}${input('phone', 'Mobile', '', 'tel', 'required placeholder="01XXXXXXXXX"')}</div>`;
    const jvFields = `<div class="form-row">${input('mouza', 'Mouza', land.mouza, 'text', 'required')}${input('areaKatha', 'Land area (katha)', land.areaKatha || '', 'number', 'min="0.5" step="0.01" required')}</div>
      <div class="form-row">${input('dagNo', 'Dag no. (CS/RS/BS)', land.dagNo, 'text', 'required')}${input('khatianNo', 'Khatian no.', land.khatianNo, 'text', 'required')}</div>
      <div class="form-row">${input('developerShare', 'Developer share (%)', land.developerShare || 60, 'number', 'min="1" max="99" step="1" required')}${input('signingMoney', 'Signing money to landowner (BDT)', land.signingMoney || '', 'number', 'min="0" step="1" required')}</div>
      <div class="form-row">${input('monthlyRent', 'Monthly house rent to landowner (BDT)', land.monthlyRent || 0, 'number', 'min="0" step="1" required')}${input('agreementDate', 'Agreement date', land.agreementDate || today(), 'date', 'required')}</div>
      ${input('deedNo', 'Registered deed / power of attorney no.', land.deedNo, 'text', 'required')}`;
    const terms = land.agreementDate ? definitionList([
      ['Land', `${land.areaKatha} katha · Mouza ${land.mouza}`], ['Dag / Khatian', `${land.dagNo} / ${land.khatianNo}`],
      ['Share ratio', `${land.developerShare} : ${100 - land.developerShare} (developer : landowner)`], ['Signing money', money(land.signingMoney)],
      ['Monthly rent', money(land.monthlyRent)], ['Agreement', `${day(land.agreementDate)} · ${land.deedNo}`]
    ]) : '<p class="empty">The joint-venture agreement has not been recorded.</p>';
    return columns(
      stack(card('Landowners', owners + (editable ? form('landowner', ownerFields, 'Add landowner', true, project.id) : '')), card('Joint-venture terms', terms)),
      card('Joint-venture agreement', project.status === 'Land' ? form('jv', jvFields, 'Save agreement', editable, project.id) + roleNote('project') : '<p class="status-line">The agreement is locked after the Land stage.</p>',
        'In a land-sharing JV, the landowner gives the plot and receives a share of the finished flats, signing money, and rent while the building is constructed.')
    );
  }

  function permitsTab(project) {
    const editable = can('permit') && project.status === 'Approval';
    const required = C.requiredPermits.map(type => {
      const latest = project.permits.filter(item => item.type === type).pop();
      return `<li class="${latest?.status === 'Approved' ? 'done' : ''}">${latest?.status === 'Approved' ? '✓' : '○'} ${escape(type)} ${latest ? badge(latest.status) : badge('Pending')}</li>`;
    }).join('');
    const rows = project.permits.map(permit => [
      `${escape(permit.type)}<small>${escape(permit.refNo)}</small>`, day(permit.submittedAt), money(permit.fee), badge(permit.status),
      permit.status === 'Submitted' ? form('permit-decision', `<div class="inline-form">${select('decision', 'Decision', ['Approved', 'Rejected'])}${input('date', 'Letter date', today(), 'date', `required min="${permit.submittedAt}"`)}</div>`, 'Record decision', can('decide') && project.status === 'Approval', project.id, permit.id) : day(permit.decidedOn)
    ]);
    const fields = select('type', 'Permit / clearance', [...C.requiredPermits, ...extraPermits]) + `<div class="form-row">${input('refNo', 'Application / reference no.', '', 'text', 'required')}${input('submittedAt', 'Submitted on', today(), 'date', 'required')}</div>` + input('fee', 'Fee paid (BDT)', '', 'number', 'min="0" step="1"');
    return stack(
      columns(
        card('Required before construction', `<ul class="checklist">${required}</ul><p class="status-line">Flats can be sold only after the ${escape(project.authority)} building plan approval. All four are needed before construction starts.</p>`),
        card('Submit application', project.status === 'Approval' ? form('permit', fields, 'Record submission', editable, project.id) + roleNote('permit') : `<p class="status-line">${project.status === 'Land' ? 'Applications open after the JV agreement.' : 'The approvals stage is complete.'}</p>`)
      ),
      card('Permit register', table(['Permit', 'Submitted', 'Fee', 'Status', 'Decision'], rows, 'No applications submitted.'))
    );
  }

  function unitGrid(project, records, selectedId) {
    const building = project.building;
    const floors = Array.from({length: building.storeys}, (_, index) => building.storeys - index);
    const cell = unit => {
      const sale = saleForUnit(records, unit.id);
      const state = unit.status === 'Handed over' ? 'handed' : unit.owner === 'Landowner' ? 'landowner' : unit.status.toLowerCase();
      const who = unit.owner === 'Landowner' ? 'Landowner' : sale ? customerOf(records, sale.customerId)?.name : unit.status;
      return `<a class="unit unit-${state}${unit.id === selectedId ? ' selected' : ''}" href="${projectUrl(project.id, 'units', {unit: unit.id})}"><strong>${escape(unit.label)}</strong><span>${sft(unit.sizeSft)}</span><span>${escape(who)}</span></a>`;
    };
    const rows = floors.map(floor => `<tr><th scope="row">Floor ${floor}</th>${building.types.map(type => `<td>${cell(project.units.find(unit => unit.floor === floor && unit.type === type.code))}</td>`).join('')}</tr>`).join('');
    return `<div class="table-scroll"><table class="unit-grid"><thead><tr><th scope="col">Floor</th>${building.types.map(type => `<th scope="col">Type ${escape(type.code)} · ${sft(type.sizeSft)} · ${type.beds} bed</th>`).join('')}</tr></thead><tbody>${rows}
      <tr><th scope="row">Ground</th><td colspan="${building.types.length}"><div class="unit unit-parking">Car parking · ${building.parkingSlots} slots${building.basements ? ` · ${building.basements} basement` : ''}</div></td></tr></tbody></table></div>
      <div class="legend"><span class="unit-available">Available</span><span class="unit-booked">Booked</span><span class="unit-sold">Sold</span><span class="unit-landowner">Landowner</span><span class="unit-handed">Handed over</span></div>`;
  }

  function unitsTab(project, records) {
    if (!project.building) {
      const fields = `<div class="form-row">${input('storeys', 'Residential floors (above ground)', 9, 'number', 'min="1" max="40" step="1" required')}${input('basements', 'Basements', 0, 'number', 'min="0" max="5" step="1"')}</div>` +
        input('parkingSlots', 'Car parking slots', 16, 'number', 'min="0" step="1" required') +
        [['A', 1650, 3], ['B', 1450, 3], ['', '', '']].map(([code, size, beds], index) => `<div class="form-row three">${input('code' + index, 'Flat type ' + (index + 1), code, 'text', 'maxlength="2"' + (index ? '' : ' required'))}${input('size' + index, 'Size (sft)', size, 'number', 'min="300" step="1"' + (index ? '' : ' required'))}${input('beds' + index, 'Bedrooms', beds, 'number', 'min="1" max="8" step="1"' + (index ? '' : ' required'))}</div>`).join('');
      return card('Define the building', project.status === 'Approval' ? form('building', fields, 'Generate flats', can('units'), project.id) + roleNote('units') : '<p class="empty">The building is defined at the Approvals stage, after the JV agreement.</p>',
        'Enter the approved design: floors and flat types per floor. Every flat is generated once, e.g. 5A, 5B.');
    }
    const share = store.landShare(project);
    const selected = unitOf(project, params.get('unit'));
    const allocationOpen = can('units') && SITE_STAGES.includes(project.status);
    const allocation = `<div class="cost-grid">${metric('Total saleable area', sft(share.totalSft))}${metric('Landowner entitled (' + (100 - project.land.developerShare) + '%)', sft(share.entitledSft))}${metric('Allocated to landowner', sft(share.allocatedSft) + ' · ' + share.units + ' flats')}${metric('Status', share.withinTolerance ? 'Within agreed share' : 'Not balanced')}</div>` +
      (allocationOpen ? form('allocate', `<div class="unit-checks">${project.units.map(unit => `<label><input type="checkbox" name="unit_${escape(unit.id)}"${unit.owner === 'Landowner' ? ' checked' : ''}${disabled(unit.status !== 'Available')}> ${escape(unit.label)} <small>${sft(unit.sizeSft)}</small></label>`).join('')}</div>`, 'Save landowner allocation', true, project.id) : '') +
      `<p class="status-line">The allocation must be within ${C.SHARE_TOLERANCE * 100}% of the agreed share. Sold or booked flats cannot move to the landowner.</p>`;
    const pricing = project.pricing;
    const pricingFields = `<div class="form-row three">${input('ratePerSft', 'Rate per sft (BDT)', pricing.ratePerSft || '', 'number', 'min="1" step="1" required')}${input('parkingPrice', 'Car parking (BDT)', pricing.parkingPrice || '', 'number', 'min="0" step="1"')}${input('utilityCharge', 'Utility & connection charge (BDT)', pricing.utilityCharge || '', 'number', 'min="0" step="1"')}</div>`;
    let detail = '<p class="empty">Select a flat in the grid to see its details.</p>';
    if (selected) {
      const sale = saleForUnit(records, selected.id);
      const statement = sale && store.statement(sale.id);
      detail = definitionList([
        ['Flat', `${selected.label} · Floor ${selected.floor} · Type ${selected.type}`], ['Size', `${sft(selected.sizeSft)} · ${selected.beds} bedrooms`],
        ['Owner', selected.owner], ['Status', selected.status],
        ...(selected.owner === 'Developer' && pricing.ratePerSft && !sale ? [['List price (with 1 parking)', money(store.unitPrice(project, selected, 1))]] : []),
        ...(sale ? [['Buyer', customerOf(records, sale.customerId)?.name], ['Price', money(sale.price)], ['Paid', money(statement.paid)], ['Balance', money(statement.balance)]] : []),
        ...(selected.handover ? [['Handed over', `${day(selected.handover.date)} · ${selected.handover.receivedBy}`]] : [])
      ]) + `<div class="actions">${sale ? link('Open sale', saleUrl(sale.id)) : ''}${!sale && selected.owner === 'Developer' && selected.status === 'Available' && can('sales') && SALE_STAGES.includes(project.status) ? link('Book this flat', projectUrl(project.id, 'sales', {unit: selected.id}), true) : ''}</div>`;
    }
    return stack(
      columns(card('Flats by floor', unitGrid(project, records, selected?.id)), stack(card(selected ? 'Flat ' + selected.label : 'Flat details', detail), card('Price list', form('pricing', pricingFields, 'Save price list', can('units') && SALE_STAGES.includes(project.status), project.id) + roleNote('units')))),
      card('Landowner share', allocation)
    );
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

  function bookingForm(project, records) {
    const ready = project.permits.some(item => item.type === 'Building plan approval' && item.status === 'Approved');
    if (!SALE_STAGES.includes(project.status)) return callout('Sales not open', project.status === 'Land' ? 'Sales open after the JV agreement and building plan approval.' : 'This project is closed.');
    if (!ready) return callout('Sales blocked', `Flats can be sold only after the ${project.authority} building plan approval is recorded under Permits.`);
    if (!project.pricing.ratePerSft) return callout('Price list missing', 'Set the rate per sft under Flats before booking.');
    const available = project.units.filter(unit => unit.owner === 'Developer' && unit.status === 'Available');
    if (!available.length) return '<p class="empty">All developer flats are sold or booked.</p>';
    const fields = select('unitId', 'Flat', available.map(unit => [unit.id, `${unit.label} · ${sft(unit.sizeSft)} · ${money(store.unitPrice(project, unit, 1))}`]), params.get('unit') || '') +
      select('customerId', 'Buyer', records.customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map(customer => [customer.id, `${customer.name} · ${customer.phone}`])) +
      `<p class="status-line">New buyer? <a href="${url('customers.html')}">Add the customer first</a>.</p>
      <div class="form-row three">${input('date', 'Booking date', today(), 'date', 'required')}${input('rate', 'Rate per sft (BDT)', project.pricing.ratePerSft, 'number', 'min="1" step="1" required')}${select('parking', 'Car parking', [['1', '1 slot'], ['0', 'None'], ['2', '2 slots']])}</div>
      <div class="form-row three">${input('bookingMoney', 'Booking money (BDT)', 500000, 'number', 'min="1" step="1" required')}${input('downPayment', 'Down payment (BDT)', 3000000, 'number', 'min="0" step="1"')}${input('discount', 'Discount (BDT)', 0, 'number', 'min="0" step="1"')}</div>
      <div class="form-row three">${select('planType', 'Payment plan', [['monthly', 'Monthly installments'], ['milestone', 'Construction-linked (per milestone)']])}${input('installments', 'Number of installments', 24, 'number', 'min="1" max="120" step="1"')}${input('firstDue', 'First installment due', C.addDays(today(), 30), 'date')}</div>
      <p class="status-line">Price = size × rate + parking + utility charge (${money(project.pricing.utilityCharge)}) − discount. Construction-linked installments fall due ${C.MILESTONE_GRACE_DAYS} days after each remaining milestone is completed.</p>`;
    return form('booking', fields, 'Book flat', can('sales'), project.id) + roleNote('sales');
  }

  function salesTab(project, records) {
    const sales = records.sales.filter(sale => sale.projectId === project.id);
    return stack(
      card('Book a flat', bookingForm(project, records)),
      card('Sales register', table(['Sale', 'Flat', 'Buyer', 'Price', 'Paid', 'Balance', 'Status', ''], saleRows(records, sales), 'No flats sold yet.'))
    );
  }

  function milestoneTable(project) {
    return table(['Milestone', 'Schedule', 'Completed', 'Progress', 'Status'], project.packages.map(item => [
      escape(item.name), `${day(item.start)}<small>to ${day(item.end)}</small>`,
      `${C.round(project.logs.filter(log => log.packageId === item.id).reduce((value, log) => value + log.quantity, 0))} / ${item.quantity} ${escape(item.unit)}`,
      `${Math.round(store.packageProgress(project, item))}%<progress max="100" value="${Math.round(store.packageProgress(project, item))}" aria-label="${escape(item.name)} progress"></progress>`,
      badge(milestoneState(project, item))
    ]), 'No construction milestones planned yet.');
  }

  function constructionTab(project) {
    const planning = can('site') && SITE_STAGES.includes(project.status);
    const onSite = can('site') && project.status === 'Construction';
    const packageFields = input('name', 'Milestone', '', 'text', 'required placeholder="e.g. 4th–6th floor slabs"') +
      `<div class="form-row">${input('quantity', 'Planned quantity', '', 'number', 'min="0.01" step="0.01" required')}${input('unit', 'Unit', '', 'text', 'required placeholder="slabs, piles, %, lot"')}</div>` +
      `<div class="form-row">${input('start', 'Start', project.start, 'date', `required min="${project.start}" max="${project.end}"`)}${input('end', 'Completion', project.end, 'date', `required min="${project.start}" max="${project.end}"`)}</div>`;
    const drawingRows = project.drawings.map(drawing => [
      `${escape(drawing.reference)}<small>${escape(drawing.title)}</small>`, escape(drawing.revision), escape(project.packages.find(item => item.id === drawing.packageId)?.name),
      badge(drawing.approved ? 'Approved' : drawing.superseded ? 'Superseded' : 'Pending'),
      (drawing.url ? `<a href="${escape(drawing.url)}" target="_blank" rel="noopener noreferrer">Open</a> ` : '') +
      (!drawing.approved && !drawing.superseded ? button('Approve', 'approve-drawing', drawing.id, can('decide') && SITE_STAGES.includes(project.status), project.id) : '')
    ]);
    const drawingFields = select('packageId', 'Milestone', project.packages.map(item => [item.id, item.name])) +
      `<div class="form-row">${input('reference', 'Drawing no.', '', 'text', 'required placeholder="STR-S04"')}${input('revision', 'Revision', '', 'text', 'required')}</div>` + input('title', 'Title', '', 'text', 'required') + input('url', 'Document link (optional)', '', 'url');
    const first = project.packages.find(item => store.packageProgress(project, item) < 100) || project.packages[0];
    const drawings = project.drawings.filter(drawing => drawing.packageId === first?.id && drawing.approved);
    const logFields = select('packageId', 'Milestone', project.packages.map(item => [item.id, `${item.name} (${item.unit})`]), first?.id) +
      `<div class="form-row three">${input('date', 'Date', today(), 'date', 'required')}${input('quantity', 'Quantity completed', '', 'number', 'min="0" step="0.01" required')}${input('labour', 'Labour on site', '', 'number', 'min="0" step="1"')}</div>` +
      `<div class="form-row">${select('weather', 'Weather', ['Sunny', 'Cloudy', 'Rain in the afternoon', 'Heavy rain', 'Storm / work stopped'])}${select('drawingId', 'Approved drawing', drawings.map(drawing => [drawing.id, drawing.reference + ' · Rev ' + drawing.revision]), '', 'No drawing reference')}</div>` +
      textarea('notes', 'Work done today') + textarea('blocker', 'Blocker / clarification needed (optional)', '', false);
    const logs = project.logs.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12).map(log => {
      const item = project.packages.find(pkg => pkg.id === log.packageId);
      const rfi = project.rfis.find(record => record.logId === log.id);
      return `<article class="record">
        <div class="section-heading"><h3>${escape(item?.name)} · ${log.quantity} ${escape(item?.unit)}</h3><span class="muted">${day(log.date)}</span></div>
        <p>${escape(log.notes)}</p>
        <p class="status-line">${log.labour ? log.labour + ' workers · ' : ''}${escape(log.weather || '')}${log.drawingReference ? ' · ' + escape(log.drawingReference) : ''}</p>
        ${log.blocker ? `<div class="callout"><strong>Blocker:</strong> ${escape(log.blocker)}</div>${rfi ? '<span class="status-line">RFI raised</span>' : button('Raise RFI', 'rfi', log.id, onSite, project.id)}` : ''}
      </article>`;
    }).join('');
    const rfis = project.rfis.map((rfi, index) => `<article class="record">
        <h3>RFI ${index + 1} · ${escape(project.packages.find(pkg => pkg.id === rfi.packageId)?.name)}</h3>
        <p>${escape(rfi.question)}</p>
        <p class="status-line">Raised ${day(rfi.at)} · ${escape(rfi.drawingReference || 'No drawing reference')}</p>
        ${rfi.response ? callout('Design response', rfi.response) : form('rfi-response', textarea('response', 'Architect / engineer response'), 'Record response', can('decide') && project.status === 'Construction', project.id, rfi.id)}
      </article>`).join('');
    return stack(
      card('Construction milestones', milestoneTable(project), 'Delayed milestones have passed their planned completion date without reaching 100%.'),
      columns(
        card('Daily site log', project.status === 'Construction' ? form('site-log', logFields, 'Save site log', onSite && project.packages.length > 0, project.id) + roleNote('site') : `<p class="status-line">Site logs are recorded during the Construction stage.</p>`),
        stack(card('Recent site records', logs || '<p class="empty">No site activity recorded.</p>'), card('Requests for information', rfis || '<p class="empty">No RFIs. Raise one from a site log blocker.</p>'))
      ),
      columns(
        card('Plan milestone', form('package', packageFields, 'Add milestone', planning, project.id), 'Milestones drive construction progress and construction-linked installments.'),
        card('Register drawing', form('drawing', drawingFields, 'Register revision', planning && project.packages.length > 0, project.id), 'Approving a revision supersedes the previous approved revision.')
      ),
      card('Drawing register', table(['Drawing', 'Rev', 'Milestone', 'Status', ''], drawingRows))
    );
  }

  function procurementTab(project, records) {
    const editable = can('procurement') && project.status === 'Construction';
    const requests = project.requests.filter(request => request.status === 'Requested');
    const requestFields = select('packageId', 'Milestone (optional)', project.packages.map(item => [item.id, item.name]), '', 'Project-wide') + input('item', 'Material', '', 'text', 'required placeholder="Rod 500W, cement, 1st class bricks…"') +
      `<div class="form-row">${input('quantity', 'Quantity', '', 'number', 'min="0.01" step="0.01" required')}${select('unit', 'Unit', records.settings.units)}</div>`;
    const orderFields = select('requestId', 'Material request', requests.map(request => [request.id, `${request.item} · ${request.quantity} ${request.unit}`])) + input('supplier', 'Supplier', '', 'text', 'required') +
      `<div class="form-row">${input('rate', 'Unit rate (BDT)', '', 'number', 'min="0.01" step="0.01" required')}${input('expected', 'Expected delivery', today(), 'date', 'required')}</div>`;
    const requestRows = project.requests.map(request => [escape(request.item), `${request.quantity} ${escape(request.unit)}`, escape(project.packages.find(item => item.id === request.packageId)?.name || 'Project-wide'), badge(request.status), request.status === 'Requested' ? button('Cancel', 'cancel-request', request.id, editable, project.id) : '']);
    return stack(
      columns(
        card('Request materials', form('material-request', requestFields, 'Save request', editable, project.id) + roleNote('procurement')),
        card('Issue purchase order', form('purchase-order', orderFields, 'Create purchase order', editable && requests.length > 0, project.id), 'Purchase orders track commitments. Record the supplier bill as an expense.')
      ),
      card('Material requests', table(['Material', 'Quantity', 'Milestone', 'Status', ''], requestRows)),
      card('Purchase orders', orderTable([project]))
    );
  }

  function orderTable(projects) {
    const rows = projects.flatMap(project => project.orders.map(order => [
      `<a href="${projectUrl(project.id, 'procurement')}">${escape(project.name)}</a><small>${escape(order.supplier)}</small>`,
      `${escape(order.item)}<small>${order.quantity} ${escape(order.unit)}</small>`, money(order.quantity * order.rate),
      order.receivedAt ? day(order.receivedAt) : day(order.expected), badge(order.status),
      order.status === 'Ordered' ? `<div class="inline-actions">${button('Receive', 'receive-order', order.id, can('procurement') && project.status === 'Construction', project.id)}${button('Cancel', 'cancel-order', order.id, can('decide') && project.status === 'Construction', project.id)}</div>` :
      order.status === 'Received' && isOpen(project) && can('costs') ? link('Record bill', url('add_cost.html', {project: project.id, order: order.id})) : ''
    ]));
    return table(['Project / supplier', 'Material', 'Order value', 'Delivery', 'Status', ''], rows, 'No purchase orders yet.');
  }

  function costsTab(project, records) {
    const summary = store.summary(project);
    const editable = can('site') && SALE_STAGES.includes(project.status);
    const fields = input('title', 'Revision title', '', 'text', 'required') + textarea('reason', 'Reason') +
      select('rfiId', 'Related RFI (optional)', project.rfis.filter(rfi => rfi.response).map(rfi => [rfi.id, rfi.question.slice(0, 80)]), '', 'No RFI') +
      input('amount', 'Budget change (BDT)', '', 'number', 'step="1" required') + '<p class="status-line">Positive for extra cost, negative for savings. Only approved revisions change the budget.</p>';
    const byCategory = records.settings.categories.map(category => [category, ConstructFlow.total(records.costs.filter(cost => cost.projectId === project.id && !cost.voidedAt && cost.category === category))]).filter(([, value]) => value > 0);
    const budget = `<div class="cost-grid">${metric('Original budget', money(project.costBudget))}${metric('Approved revisions', money(summary.approvedChanges))}${metric('Current budget', money(summary.budget))}${metric('Spent', money(summary.spending))}</div>
      <p>Remaining: <strong class="${summary.remaining < 0 ? 'negative' : ''}">${money(summary.remaining)}</strong></p>
      ${table(['Category', 'Spent'], byCategory.map(([category, value]) => [escape(category), money(value)]), 'No expenses recorded.')}
      <div class="actions">${link('Expense ledger', url('view_costs.html', {project: project.id}))}${can('costs') && isOpen(project) ? link('Record expense', url('add_cost.html', {project: project.id}), true) : ''}</div>`;
    return stack(
      columns(card('Construction budget', budget), card('Submit budget revision', form('change', fields, 'Submit for approval', editable, project.id) + roleNote('site'))),
      card('Budget revisions', changeTable([project]))
    );
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

  function handoverTab(project, records) {
    const decide = can('decide');
    const units = project.units.filter(unit => unit.owner === 'Landowner' || unit.status !== 'Available');
    const rows = units.map(unit => {
      const sale = saleForUnit(records, unit.id);
      const state = readiness(project, records, unit);
      return [escape(unit.label), unit.owner === 'Landowner' ? 'Landowner' : escape(customerOf(records, sale?.customerId)?.name), badge(['Ready', 'Handed over'].includes(state) ? state : state === 'Unsold' ? 'Upcoming' : 'Blocked') + (['Ready', 'Handed over'].includes(state) ? '' : `<small>${escape(state)}</small>`),
        unit.handover ? `${day(unit.handover.date)}<small>${escape(unit.handover.receivedBy)} · ${escape(unit.handover.letterNo)}</small>` : '—'];
    });
    const ready = units.filter(unit => readiness(project, records, unit) === 'Ready');
    const handoverFields = select('unitId', 'Flat ready for handover', ready.map(unit => [unit.id, unit.label + ' · ' + (unit.owner === 'Landowner' ? 'Landowner' : customerOf(records, saleForUnit(records, unit.id)?.customerId)?.name)])) +
      `<div class="form-row three">${input('date', 'Handover date', today(), 'date', 'required')}${input('receivedBy', 'Received by', '', 'text', 'required')}${input('letterNo', 'Possession letter no.', '', 'text', 'required')}</div>`;
    const punchOpen = can('site') && ['Construction', 'Handover'].includes(project.status);
    const punch = table(['Defect', 'Flat', 'Status', ''], project.punch.map(item => [escape(item.description), escape(unitOf(project, item.unitId)?.label || 'Common area'), badge(item.resolvedAt ? 'Resolved' : 'Open'), item.resolvedAt ? day(item.resolvedAt) : button('Resolve', 'resolve-punch', item.id, punchOpen, project.id)]), 'No defects recorded.') +
      (punchOpen ? form('punch', input('description', 'Defect', '', 'text', 'required') + select('unitId', 'Flat', project.units.filter(unit => unit.status !== 'Handed over').map(unit => [unit.id, unit.label]), '', 'Common area'), 'Add defect', true, project.id) : '');
    const occupancy = project.occupancy
      ? callout('Occupancy certificate', `${project.occupancy.certificateNo} · ${day(project.occupancy.date)}`)
      : project.status === 'Construction' ? form('occupancy', `<div class="form-row">${input('certificateNo', 'Certificate no.', '', 'text', 'required')}${input('date', 'Issued on', today(), 'date', 'required')}</div>`, 'Record occupancy certificate', decide, project.id) : '<p class="empty">Recorded at the end of construction.</p>';
    const association = project.association
      ? callout("Owners' association", `${project.association.name} · President ${project.association.president} · ${day(project.association.date)}`)
      : project.status === 'Handover' ? form('association', input('name', 'Association name', project.name + ' Flat Owners Association', 'text', 'required') + `<div class="form-row">${input('president', 'President', '', 'text', 'required')}${input('date', 'Formed on', today(), 'date', 'required')}</div>`, 'Record association', decide, project.id) : '<p class="empty">Formed by the flat owners after handover.</p>';
    const finance = store.finance(project);
    const final = project.status === 'Closed' ? card('Final summary', definitionList([
      ['Closed', day(project.closedAt)], ['Flats handed over', String(project.units.filter(unit => unit.status === 'Handed over').length)],
      ['Sales value', money(finance.salesValue)], ['Collected', money(finance.collected)], ['Land cost', money(finance.landCost)],
      ['Construction spent', money(finance.spending)], ['Margin', money(finance.projectedMargin)]
    ])) : '';
    return stack(
      final,
      columns(
        stack(card('Flat handover register', table(['Flat', 'Owner', 'Readiness', 'Handed over'], rows, 'No sold or landowner flats yet.'), 'A buyer flat is handed over only after the agreement is signed, the full price is paid, and its defects are fixed.'),
          project.status === 'Handover' ? card('Hand over a flat', ready.length ? form('handover-unit', handoverFields, 'Record handover', decide, project.id) + roleNote('decide') : '<p class="empty">No flats are ready. Clear the blockers in the register.</p>') : ''),
        stack(card('Occupancy certificate', occupancy), card('Defects (punch list)', punch), card("Owners' association", association))
      )
    );
  }

  /* Organisation pages */

  function salesPage(records) {
    const sale = records.sales.find(item => item.id === params.get('sale'));
    if (params.get('sale')) return sale ? saleDetail(records, sale) : unavailable('The requested sale could not be found.');
    const status = params.get('status') || '';
    const sales = records.sales.filter(item => (!projectId || item.projectId === projectId) && (!status || item.status === status)).sort((a, b) => b.date.localeCompare(a.date));
    const open = records.projects.filter(project => SALE_STAGES.includes(project.status));
    const filters = `<form class="filters" data-form="filter">${select('project', 'Project', records.projects.map(project => [project.id, project.name]), projectId, 'All projects')}${select('status', 'Status', ['Booked', 'Agreement signed', 'Cancelled'], status, 'All statuses')}<button class="button" type="submit">Apply</button></form>`;
    return heading('Sales', 'Bookings, agreements, and cancellations across projects.') +
      (can('sales') ? card('Book a flat', table(['Project', 'Available flats', ''], open.map(project => [escape(project.name), String(store.summary(project).available), link('Choose flat', projectUrl(project.id, 'sales'), true)]), 'No project is open for sales.')) : '') +
      `<div class="section-gap">${card('Sales register', filters + table(['Sale', 'Flat', 'Buyer', 'Price', 'Paid', 'Balance', 'Status', ''], saleRows(records, sales), 'No sales match these filters.'))}</div>`;
  }

  function scheduleTable(statement) {
    return table(['Installment', 'Due', 'Amount', 'Paid', 'Status'], statement.rows.map(row => [
      escape(row.label), row.due ? day(row.due) : '<span class="muted">On milestone completion</span>', money(row.amount), money(row.paid),
      badge(row.status) + (row.daysLate ? `<small>${row.daysLate} days late</small>` : '')
    ]));
  }

  function receiptTable(statement, withLinks = true) {
    return table(['MR no.', 'Date', 'Method', 'Reference', 'Amount'], statement.receipts.map(receipt => [
      withLinks ? `<a href="${url('reports.html', {type: 'receipt', receipt: receipt.id})}">${escape(receipt.no)}</a>` : escape(receipt.no),
      day(receipt.date), escape(receipt.method), escape(receipt.ref || '—'), money(receipt.amount)
    ]), 'No payments received yet.');
  }

  function saleDetail(records, sale) {
    const statement = store.statement(sale.id);
    const project = statement.project;
    const unit = unitOf(project, sale.unitId);
    const customer = customerOf(records, sale.customerId);
    const open = SALE_STAGES.includes(project.status) && sale.status !== 'Cancelled';
    const facts = definitionList([
      ['Buyer', `${customer?.name} · ${customer?.phone}`], ['Flat', `${unit?.label} · ${sft(unit?.sizeSft)} · ${unit?.beds} bed`],
      ['Rate', money(sale.rate) + ' per sft'], ['Parking', sale.parking + ' slot(s)'], ['Utility charge', money(sale.utility)], ['Discount', money(sale.discount)],
      ['Total price', money(sale.price)], ['Paid', money(statement.paid)], ['Balance', money(statement.balance)], ['Overdue', money(statement.overdue)],
      ['Booked', day(sale.date)], ['Agreement', sale.agreementDate ? day(sale.agreementDate) : 'Not signed'],
      ...(sale.refund ? [['Cancelled', day(sale.cancelledOn)], ['Refund', `${money(sale.refund.amount)} (${sale.refund.deductionPct}% deducted)`]] : [])
    ]);
    const next = statement.rows.find(row => row.outstanding > 0 && row.due);
    const receiptFields = `<div class="form-row">${input('amount', 'Amount (BDT)', next ? next.outstanding : statement.balance, 'number', `min="1" max="${statement.balance}" step="1" required`)}${input('date', 'Date', today(), 'date', 'required')}</div>
      <div class="form-row">${select('method', 'Method', C.paymentMethods, 'Cheque')}${input('ref', 'Cheque / transaction no.', '', 'text', 'placeholder="Required unless cash"')}</div>`;
    const actions = [];
    if (open && statement.balance > 0) actions.push(card('Receive payment', form('receipt', receiptFields, 'Issue money receipt', can('receipts'), project.id, sale.id) + roleNote('receipts'), 'The payment is applied to the oldest unpaid installment first.'));
    if (open && sale.status === 'Booked') actions.push(card('Sale agreement', form('agreement', input('date', 'Agreement date', today(), 'date', 'required'), 'Record signed agreement', can('sales') && statement.upfrontPaid, project.id, sale.id) + `<p class="status-line">${statement.upfrontPaid ? 'Booking money and down payment are received.' : 'Collect the booking money and down payment before signing.'}</p>`));
    if (open && unit?.status !== 'Handed over') actions.push(card('Cancel booking', form('cancel-sale', `<div class="form-row">${input('deductionPct', 'Deduction (%)', 10, 'number', 'min="0" max="100" step="0.5" required')}${input('date', 'Date', today(), 'date', 'required')}</div>` + textarea('reason', 'Reason'), 'Cancel and refund', can('decide'), project.id, sale.id), `Refund = paid amount minus the deduction. The flat returns to stock. Paid so far: ${money(statement.paid)}.`));
    return heading('Sale ' + sale.no, saleTitle(records, sale), link('Statement', url('reports.html', {type: 'statement', sale: sale.id})) + link('Buyer view', url('buyer.html', {customer: sale.customerId})) + link('Project sales', projectUrl(project.id, 'sales'))) +
      `<p>${badge(sale.status)} ${statement.overdue ? badge('Overdue') : ''}</p>` +
      columns(stack(card('Payment schedule', scheduleTable(statement)), card('Money receipts', receiptTable(statement))), stack(card('Sale details', facts), ...actions));
  }

  function collectionsPage(records) {
    const projects = projectId ? records.projects.filter(project => project.id === projectId) : records.projects;
    const ids = new Set(projects.map(project => project.id));
    const finances = projects.map(project => store.finance(project));
    const add = key => finances.reduce((value, item) => value + item[key], 0);
    const receipts = records.receipts.filter(receipt => ids.has(receipt.projectId)).sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
    const month = today().slice(0, 7);
    const receiptRows = receipts.slice(0, 15).map(receipt => {
      const sale = records.sales.find(item => item.id === receipt.saleId);
      return [`<a href="${url('reports.html', {type: 'receipt', receipt: receipt.id})}">${escape(receipt.no)}</a>`, day(receipt.date), `<a href="${saleUrl(sale.id)}">${escape(customerOf(records, sale.customerId)?.name)}</a>`, escape(saleTitle(records, sale)), escape(receipt.method), money(receipt.amount)];
    });
    const payable = activeSales(records).filter(sale => ids.has(sale.projectId) && store.statement(sale.id).balance > 0 && SALE_STAGES.includes(projectOf(records, sale.projectId).status));
    const payForm = can('receipts') ? card('Receive payment', table(['Buyer', 'Flat', 'Balance', ''], payable.map(sale => [escape(customerOf(records, sale.customerId)?.name), escape(saleTitle(records, sale)), money(store.statement(sale.id).balance), link('Receive', saleUrl(sale.id), true)]), 'No balances outstanding.')) : '';
    return heading('Collections', 'Installments due, overdue buyers, and money receipts.', link('Collection report', url('reports.html', {type: 'collection', ...(projectId ? {project: projectId} : {})}))) +
      `<div class="dashboard-metrics">
        ${dashboardStat('Collected this month', short(receipts.filter(receipt => receipt.date.slice(0, 7) === month).reduce((value, receipt) => value + receipt.amount, 0)), 'cash', 'success')}
        ${dashboardStat('Due in 30 days', short(add('dueSoon')), 'calendar', 'info')}
        ${dashboardStat('Overdue', short(add('overdue')), 'alert', add('overdue') ? 'danger' : 'success')}
        ${dashboardStat('Total receivable', short(add('receivable')), 'invoice', 'primary')}
      </div>` +
      card('Filter', projectFilter(records, projectId)) +
      `<div class="section-gap">${columns(card('Overdue buyers', table(['Buyer', 'Flat', 'Overdue', 'Late by', ''], overdueRows(records, projects), 'No overdue installments.')), card('Due in the next 30 days', table(['Due', 'Buyer', 'Flat', 'Installment', 'Amount'], dueSoonRows(records, projects), 'Nothing falls due in the next 30 days.')))}</div>` +
      `<div class="section-gap">${columns(card('Recent money receipts', table(['MR no.', 'Date', 'Buyer', 'Flat', 'Method', 'Amount'], receiptRows, 'No receipts yet.')), payForm || card('Receive payment', roleNote('receipts')))}</div>`;
  }

  function customersPage(records) {
    const customer = customerOf(records, params.get('customer'));
    const fields = existing => `<div class="form-row">${input('name', 'Full name', existing?.name, 'text', 'required')}${input('phone', 'Mobile', existing?.phone, 'tel', 'required placeholder="01XXXXXXXXX"')}</div>
      <div class="form-row">${input('nid', 'NID number', existing?.nid, 'text', 'required inputmode="numeric"')}${input('email', 'Email (optional)', existing?.email, 'email')}</div>` + textarea('address', 'Present address', existing?.address);
    if (customer) {
      const sales = records.sales.filter(sale => sale.customerId === customer.id);
      return heading(customer.name, `${customer.phone} · NID ${customer.nid}`, link('Buyer view', url('buyer.html', {customer: customer.id})) + link('All customers', url('customers.html'))) +
        columns(card('Purchases', table(['Sale', 'Flat', 'Buyer', 'Price', 'Paid', 'Balance', 'Status', ''], saleRows(records, sales), 'No purchases yet.')),
          card('Customer details', form('customer', fields(customer), 'Save customer', can('sales'), '', customer.id) + roleNote('sales')));
    }
    const search = (params.get('q') || '').toLowerCase();
    const rows = records.customers.filter(item => `${item.name} ${item.phone} ${item.nid}`.toLowerCase().includes(search)).sort((a, b) => a.name.localeCompare(b.name)).map(item => {
      const sales = activeSales(records).filter(sale => sale.customerId === item.id);
      return [`<a href="${url('customers.html', {customer: item.id})}">${escape(item.name)}</a><small>${escape(item.address)}</small>`, escape(item.phone), sales.map(sale => escape(saleTitle(records, sale))).join('<br>') || '<span class="muted">No purchase</span>', link('Open', url('customers.html', {customer: item.id}))];
    });
    return heading('Customers', 'Flat buyers and prospects.') + columns(
      card('Customer list', `<form class="filters" data-form="filter">${input('q', 'Search name, mobile, or NID', params.get('q') || '', 'search')}<button class="button" type="submit">Search</button></form>` + table(['Name', 'Mobile', 'Flats', ''], rows, 'No customers found.')),
      card('Add customer', form('customer', fields(null), 'Add customer', can('sales'), '') + roleNote('sales'))
    );
  }

  function buyerPage(records) {
    const customer = customerOf(records, params.get('customer'));
    if (!customer) {
      return heading('Buyer view', 'Preview what a buyer sees about their flat, payments, and construction progress.') +
        card('Choose a buyer', table(['Buyer', 'Flats', ''], records.customers.filter(item => activeSales(records).some(sale => sale.customerId === item.id)).map(item => [escape(item.name), escape(activeSales(records).filter(sale => sale.customerId === item.id).map(sale => saleTitle(records, sale)).join(', ')), link('Open buyer view', url('buyer.html', {customer: item.id}))])));
    }
    const sales = activeSales(records).filter(sale => sale.customerId === customer.id);
    const sections = sales.map(sale => {
      const statement = store.statement(sale.id);
      const project = statement.project;
      const unit = unitOf(project, sale.unitId);
      const progress = store.summary(project).progress;
      const next = statement.rows.find(row => row.outstanding > 0);
      const milestones = `<ul class="checklist">${project.packages.map(item => `<li class="${store.packageProgress(project, item) >= 100 ? 'done' : ''}">${store.packageProgress(project, item) >= 100 ? '✓' : '○'} ${escape(item.name)}</li>`).join('')}</ul>`;
      return `<section class="buyer-flat">
        <h2>${escape(project.name)} · Flat ${escape(unit.label)}</h2>
        <p>${escape(project.location)} · ${sft(unit.sizeSft)} · ${unit.beds} bedrooms</p>
        <div class="dashboard-metrics">${dashboardStat('Construction', progress + '%', 'helmet', 'primary', 'Stage: ' + stageLabels[project.status])}${dashboardStat('Paid', short(statement.paid), 'cash', 'success', 'of ' + short(statement.price))}${dashboardStat('Balance', short(statement.balance), 'invoice', 'info')}${dashboardStat('Next payment', next ? short(next.outstanding) : 'None', 'calendar', statement.overdue ? 'danger' : 'warning', next ? (next.due ? (next.status === 'Overdue' ? 'Overdue since ' : 'Due ') + day(next.due) : 'On milestone completion') : 'Fully paid')}</div>
        ${columns(card('Payment schedule', scheduleTable(statement)), stack(card('Construction progress', milestones), card('Handover', unit.handover ? callout('Handed over', `${day(unit.handover.date)} · Possession letter ${unit.handover.letterNo}`) : `<p>Planned handover: <strong>${day(project.end)}</strong></p>`)))}
        <div class="section-gap">${card('Your money receipts', receiptTable(statement, false))}</div>
      </section>`;
    }).join('');
    return heading('Welcome, ' + customer.name, 'Your flat, payments, and construction progress. This page is read-only.', '<button type="button" class="button secondary" data-action="print">Print</button>') +
      (sections || card('No active purchase', '<p>This buyer has no active flat purchase.</p>'));
  }

  function reportsPage(records) {
    const type = params.get('type') || '';
    const printButton = `<button type="button" class="button" data-action="print">Print / save PDF</button>`;
    const letterhead = title => `<div class="letterhead"><img src="assets/constructflow-logo.png" alt="ConstructFlow" width="136" height="36"><div><strong>ConstructFlow Properties Ltd.</strong><span>${escape(title)} · Printed ${day(today())}</span></div></div>`;
    if (type === 'statement') {
      const sale = records.sales.find(item => item.id === params.get('sale'));
      if (!sale) return unavailable('Choose a sale to print its statement.');
      const statement = store.statement(sale.id);
      const customer = customerOf(records, sale.customerId);
      return heading('Buyer statement', saleTitle(records, sale), printButton + link('Back to sale', saleUrl(sale.id))) + `<div class="report">${letterhead('Statement of account')}` +
        definitionList([['Buyer', customer.name], ['Mobile', customer.phone], ['Flat', saleTitle(records, sale)], ['Sale no.', sale.no], ['Total price', money(sale.price)], ['Paid', money(statement.paid)], ['Balance', money(statement.balance)], ['Overdue', money(statement.overdue)]]) +
        `<h3>Payment schedule</h3>${scheduleTable(statement)}<h3>Money receipts</h3>${receiptTable(statement, false)}</div>`;
    }
    if (type === 'receipt') {
      const receipt = records.receipts.find(item => item.id === params.get('receipt'));
      if (!receipt) return unavailable('The requested money receipt could not be found.');
      const sale = records.sales.find(item => item.id === receipt.saleId);
      const statement = store.statement(sale.id);
      return heading('Money receipt ' + receipt.no, saleTitle(records, sale), printButton + link('Back to sale', saleUrl(sale.id))) + `<div class="report receipt">${letterhead('Money receipt')}` +
        definitionList([['Receipt no.', receipt.no], ['Date', day(receipt.date)], ['Received from', customerOf(records, sale.customerId).name], ['Against', saleTitle(records, sale) + ' (' + sale.no + ')'], ['Method', receipt.method + (receipt.ref ? ' · ' + receipt.ref : '')], ['Amount', money(receipt.amount)], ['Balance after all receipts', money(statement.balance)]]) +
        '<div class="signatures"><span>Received by (Accounts)</span><span>Authorised signature</span></div></div>';
    }
    const project = projectOf(records, projectId);
    if (type === 'inventory' && project) {
      const rows = project.units.map(unit => {
        const sale = saleForUnit(records, unit.id);
        return [escape(unit.label), sft(unit.sizeSft), escape(unit.owner), badge(unit.status), escape(sale ? customerOf(records, sale.customerId)?.name : '—'), sale ? money(sale.price) : unit.owner === 'Developer' && project.pricing.ratePerSft ? money(store.unitPrice(project, unit)) : '—'];
      });
      return heading('Flat inventory', project.name, printButton) + `<div class="report">${letterhead('Flat inventory · ' + project.name)}${table(['Flat', 'Size', 'Owner', 'Status', 'Buyer', 'Price / list'], rows, 'No flats defined.')}</div>`;
    }
    if (type === 'pnl' && project) {
      const finance = store.finance(project);
      return heading('Project P&L', project.name, printButton) + `<div class="report">${letterhead('Projected profit and loss · ' + project.name)}` +
        definitionList([['Sales value (booked)', money(finance.salesValue)], ['Unsold stock at list price', money(finance.unsoldValue)], ['Forfeited on cancellations', money(finance.forfeited)], ['Projected revenue', money(finance.projectedRevenue)],
          ['Signing money to landowner', money(project.land.signingMoney)], [`Landowner rent (${finance.rentMonths} months)`, money(finance.landCost - project.land.signingMoney)], ['Construction (current budget)', money(finance.budget)], ['Construction (spent to date)', money(finance.spending)],
          ['Projected margin', money(finance.projectedMargin)], ['Collected to date', money(finance.collected)], ['Receivable', money(finance.receivable)], ['Refunds paid', money(finance.refunds)]]) +
        '<p class="status-line">Construction cost uses the larger of the current budget and actual spending.</p></div>';
    }
    if (type === 'collection') {
      const from = params.get('start') || today().slice(0, 8) + '01';
      const to = params.get('end') || today();
      const receipts = records.receipts.filter(receipt => (!projectId || receipt.projectId === projectId) && receipt.date >= from && receipt.date <= to).sort((a, b) => a.date.localeCompare(b.date));
      const rows = receipts.map(receipt => {
        const sale = records.sales.find(item => item.id === receipt.saleId);
        return [escape(receipt.no), day(receipt.date), escape(customerOf(records, sale.customerId)?.name), escape(saleTitle(records, sale)), escape(receipt.method), money(receipt.amount)];
      });
      const filters = `<form class="filters no-print" data-form="filter"><input type="hidden" name="type" value="collection">${select('project', 'Project', records.projects.map(item => [item.id, item.name]), projectId, 'All projects')}${input('start', 'From', from, 'date')}${input('end', 'To', to, 'date')}<button class="button" type="submit">Apply</button></form>`;
      return heading('Collection report', `${day(from)} – ${day(to)}`, printButton) + filters + `<div class="report">${letterhead('Collection report · ' + (project ? project.name : 'All projects'))}${table(['MR no.', 'Date', 'Buyer', 'Flat', 'Method', 'Amount'], rows, 'No receipts in this period.')}<p class="total-line">Total collected: <strong>${money(receipts.reduce((value, receipt) => value + receipt.amount, 0))}</strong></p></div>`;
    }
    const rows = records.projects.map(item => [escape(item.name), badge(item.status),
      `<div class="inline-actions">${link('Flat inventory', url('reports.html', {type: 'inventory', project: item.id}))}${link('Project P&L', url('reports.html', {type: 'pnl', project: item.id}))}${link('Collections', url('reports.html', {type: 'collection', project: item.id}))}</div>`]);
    return heading('Reports', 'Printable statements for management, buyers, and the bank.') + stack(
      card('Project reports', table(['Project', 'Stage', ''], rows)),
      card('Buyer documents', '<p>Open a sale to print its statement of account, or a money receipt from the collections list.</p>' + `<div class="actions">${link('Sales register', url('sales.html'))}${link('Collections', url('collections.html'))}</div>`)
    );
  }

  function procurementPage(records) {
    const selected = projectOf(records, projectId);
    const projects = selected ? [selected] : records.projects;
    return heading('Procurement', 'Material requests and purchase orders across projects.', selected ? link('Open project procurement', projectUrl(selected.id, 'procurement'), true) : '') +
      card('Purchase orders', projectFilter(records, projectId) + orderTable(projects)) +
      `<div class="section-gap">${card('Outstanding material requests', table(['Project', 'Material', 'Quantity', ''], projects.flatMap(project => project.requests.filter(request => request.status === 'Requested').map(request => [escape(project.name), escape(request.item), `${request.quantity} ${escape(request.unit)}`, link('Issue order', projectUrl(project.id, 'procurement'))]))))}</div>`;
  }

  function projectFilter(records, selected = '') {
    return `<form class="filters" data-form="filter">${select('project', 'Project', records.projects.map(project => [project.id, project.name]), selected, 'All projects')}<button type="submit" class="button">Apply</button></form>`;
  }

  function expensePage(records, voidedOnly = false) {
    const category = params.get('category') || '';
    const start = params.get('start') || '';
    const end = params.get('end') || '';
    const costs = records.costs.filter(cost => Boolean(cost.voidedAt) === voidedOnly && (!projectId || cost.projectId === projectId) && (!category || cost.category === category) && (!start || cost.date >= start) && (!end || cost.date <= end));
    const filters = `<form class="filters" data-form="filter">${select('project', 'Project', records.projects.map(project => [project.id, project.name]), projectId, 'All projects')}${select('category', 'Category', records.settings.categories, category, 'All categories')}${input('start', 'From', start, 'date')}${input('end', 'To', end, 'date')}<button class="button" type="submit">Apply</button></form>`;
    const rows = costs.slice().sort((a, b) => b.date.localeCompare(a.date)).map(cost => {
      const project = projectOf(records, cost.projectId);
      return [day(cost.date), `<a href="${projectUrl(cost.projectId, 'costs')}">${escape(project?.name)}</a>`, `${escape(cost.description)}<small>${escape(cost.category)}</small>`, cost.quantity, money(cost.rate), money(cost.quantity * cost.rate),
        !voidedOnly && can('costs') && isOpen(project) ? `<div class="inline-actions">${link('Edit', url('edit_cost.html', {project: cost.projectId, cost: cost.id}))}${button('Void', 'void-cost', cost.id, can('decide'), cost.projectId)}</div>` : (cost.voidedAt ? 'Voided ' + day(cost.voidedAt) : '')];
    });
    const actions = (voidedOnly ? link('Active expenses', url('view_costs.html', projectId ? {project: projectId} : {})) :
      (can('costs') ? link('Record expense', url(projectId ? 'add_cost.html' : 'select_cost_project.html', projectId ? {project: projectId} : {}), true) : '')) +
      (!voidedOnly && can('decide') ? link('Voided expenses', url('all_removed_costs.html', projectId ? {project: projectId} : {})) : '');
    return heading(voidedOnly ? 'Voided expenses' : 'Expenses', 'Supplier bills, labour, and services charged to each project.', actions) +
      card('Expenditure ledger', filters + table(['Date', 'Project', 'Description', 'Qty', 'Rate', 'Total', ''], rows, 'No expenses match these filters.') + `<p class="total-line">Total: <strong>${money(ConstructFlow.total(costs))}</strong></p><div class="actions">${button('Export CSV', 'export-costs', '', true)}</div>`);
  }

  function costProjectPicker(records) {
    const open = records.projects.filter(isOpen);
    return heading('Record expense', 'Choose the project this expense belongs to.') +
      card('Open projects', table(['Project', 'Spent / budget', ''], open.map(project => {
        const summary = store.summary(project);
        return [escape(project.name), `${money(summary.spending)} / ${money(summary.budget)}`, link('Select project', url('add_cost.html', {project: project.id}), true)];
      }), 'No open projects.'));
  }

  function costForm(records) {
    if (!can('costs')) return unavailable('Only Accounts or the Managing Director can record expenses.');
    const existing = records.costs.find(cost => cost.id === params.get('cost'));
    if (page === 'edit_cost' && !existing) return unavailable('The requested expense could not be found.');
    const project = projectOf(records, existing?.projectId || projectId);
    if (!project) return costProjectPicker(records);
    if (!isOpen(project) || existing?.voidedAt) return unavailable('Expenses can only be recorded for open projects.');
    const order = project.orders.find(item => item.id === params.get('order'));
    const fields = `<p><strong>Project:</strong> <a href="${projectUrl(project.id, 'costs')}">${escape(project.name)}</a></p>` +
      `<div class="form-row">${input('date', 'Date', existing?.date || today(), 'date', 'required')}${select('category', 'Category', [...new Set([...records.settings.categories, ...(existing ? [existing.category] : [])])], existing?.category || '')}</div>` +
      input('description', 'Description', existing?.description || order?.item, 'text', 'required') +
      `<div class="form-row">${input('quantity', 'Quantity', existing?.quantity || order?.quantity || 1, 'number', 'min="0.01" step="0.01" required')}${input('rate', 'Unit rate (BDT)', existing?.rate || order?.rate || '', 'number', 'min="0.01" step="0.01" required')}</div>` +
      select('orderId', 'Related purchase order (optional)', project.orders.filter(item => item.status !== 'Cancelled').map(item => [item.id, item.item + ' · ' + item.supplier]), existing?.orderId || order?.id, 'No purchase order') +
      (order && !existing && records.costs.some(cost => cost.orderId === order.id && !cost.voidedAt) ? '<div class="callout">This order already has a recorded bill. Check the ledger before adding another.</div>' : '') +
      '<p class="status-line" id="expense-total">Enter quantity and unit rate to calculate the total.</p>';
    return heading(existing ? 'Edit expense' : 'Record expense', project.name, link('Back to ledger', url('view_costs.html', {project: project.id}))) + card('Expense details', form('cost', fields, 'Save expense', true, project.id, existing?.id || ''));
  }

  function approvalsPage(records) {
    const projects = projectId ? records.projects.filter(project => project.id === projectId) : records.projects;
    const permits = projects.flatMap(project => project.permits.filter(permit => permit.status === 'Submitted').map(permit => [escape(project.name), `${escape(permit.type)}<small>${escape(permit.refNo)}</small>`, day(permit.submittedAt), link('Record decision', projectUrl(project.id, 'permits'))]));
    const rfis = projects.flatMap(project => project.rfis.filter(rfi => !rfi.response).map(rfi => [escape(project.name), escape(rfi.question), link('Respond', projectUrl(project.id, 'construction'))]));
    const drawings = projects.filter(project => SITE_STAGES.includes(project.status)).flatMap(project => project.drawings.filter(drawing => !drawing.approved && !drawing.superseded).map(drawing => [escape(project.name), escape(drawing.reference), escape(drawing.revision), link('Review', projectUrl(project.id, 'construction'))]));
    const agreements = records.sales.filter(sale => sale.status === 'Booked' && projects.some(project => project.id === sale.projectId)).map(sale => [escape(saleTitle(records, sale)), escape(customerOf(records, sale.customerId)?.name), store.statement(sale.id).upfrontPaid ? badge('Ready') : badge('Pending'), link('Open sale', saleUrl(sale.id))]);
    const stages = projects.filter(project => isOpen(project) && store.gateChecks(project).every(check => check.done)).map(project => [escape(project.name), badge(project.status), link('Advance stage', projectUrl(project.id))]);
    const handovers = projects.filter(project => project.status === 'Handover').flatMap(project => project.units.filter(unit => readiness(project, records, unit) === 'Ready').map(unit => [escape(project.name), escape(unit.label), link('Hand over', projectUrl(project.id, 'handover'))]));
    return heading('Approvals', 'Decisions waiting for the Managing Director.') + projectFilter(records, projectId) +
      `<div class="stack">
        ${card('Projects ready for the next stage', table(['Project', 'Stage', ''], stages, 'No project has completed its stage checks.'))}
        ${card('Permits awaiting authority decision', table(['Project', 'Permit', 'Submitted', ''], permits, 'No permits awaiting a decision.'))}
        ${card('Budget revisions', changeTable(projects, true))}
        ${columns(card('Agreements to sign', table(['Flat', 'Buyer', 'Upfront paid', ''], agreements, 'No bookings awaiting agreement.')), card('Flats ready for handover', table(['Project', 'Flat', ''], handovers, 'No flats ready.')))}
        ${columns(card('RFIs awaiting response', table(['Project', 'Question', ''], rfis, 'No open RFIs.')), card('Drawings awaiting approval', table(['Project', 'Drawing', 'Rev', ''], drawings, 'No drawings awaiting approval.')))}
      </div>`;
  }

  function teamPage(records) {
    if (!can('team')) return unavailable('Only the Managing Director can manage the team.');
    const user = records.users.find(item => item.id === params.get('user'));
    const fields = input('name', 'Name', user?.name, 'text', 'required') + input('email', 'Email', user?.email, 'email') + select('role', 'Role', C.roles.map(key => [key, C.roleNames[key]]), user?.role);
    const rows = records.users.map(item => [escape(item.name), escape(item.email || '—'), escape(C.roleNames[item.role]), link('Edit', url('edit_user.html', {user: item.id}))]);
    return heading('Team', 'Who does what in the company.') + columns(
      card('Team members', table(['Name', 'Email', 'Role', ''], rows)),
      card(user ? 'Edit team member' : 'Add team member', form('user', fields, 'Save member', true, '', user?.id || ''), 'Records responsibilities. They do not create sign-in accounts.')
    );
  }

  function settingsPage(records) {
    if (!can('team')) return unavailable('Only the Managing Director can change settings.');
    function options(kind, title, singular) {
      const list = '<ul>' + records.settings[kind].map(item => `<li>${escape(item)}</li>`).join('') + '</ul>';
      const fields = `<input type="hidden" name="kind" value="${kind}">` + input('value', 'New ' + singular, '', 'text', 'required');
      return card(title, list + form('option', fields, 'Add ' + singular, true, ''));
    }
    return heading('Settings', 'Expense categories and material units.') + stack(
      columns(options('categories', 'Expense categories', 'category'), options('units', 'Material units', 'unit')),
      card('Data backup', '<p>Records are saved in this browser on this device. Export a backup before clearing browser data.</p>' + button('Export backup', 'backup', '', true))
    );
  }

  function auditPage(records) {
    if (!can('team')) return unavailable('Only the Managing Director can view the activity log.');
    const only = params.get('project');
    let events = records.audit.filter(event => !only || event.projectId === only);
    if (page === 'all_edited_projects') events = events.filter(event => event.action === 'Project updated');
    if (page === 'all_edited_costs') events = events.filter(event => event.action === 'Expense updated');
    const historyLinks = link('All activity', url('audit_log.html')) + link('Project edits', url('all_edited_projects.html')) + link('Expense edits', url('all_edited_costs.html'));
    return heading('Activity log', 'Every recorded action, with the role that performed it.', historyLinks) +
      card('Recorded activity', projectFilter(records, only) + table(['Date', 'Activity', 'Project', 'Details', 'Role'], activityRows(events, records)));
  }

  function profilePage() {
    const duties = {
      admin: 'Creates projects, records JV agreements, decides permits, approves drawings and budget revisions, cancels sales, and hands over flats.',
      pm: 'Submits permits, plans milestones, records daily site logs, raises RFIs, manages procurement and defects.',
      sales: 'Adds customers, sets the price list, allocates landowner flats, books flats, and records sale agreements.',
      accounts: 'Issues money receipts and records expenses.',
      viewer: 'Read-only access to every page.'
    };
    return heading('Account', 'Current role: ' + C.roleNames[role]) + card('Role responsibilities', `<ul class="checklist">${C.roles.map(key => `<li${key === role ? ' class="done"' : ''}><strong>${escape(C.roleNames[key])}</strong> — ${escape(duties[key])}</li>`).join('')}</ul><p class="status-line">Records are stored on this device. Role views are not authenticated accounts.</p>` + link('Dashboard', url('index.html')));
  }

  function render() {
    const records = store.snapshot();
    const project = projectOf(records, projectId);
    const pages = {
      index: () => dashboard(records), modules: () => dashboard(records),
      view_projects: () => projectList(records), all_removed_projects: () => projectList(records), add_project: () => projectForm(records),
      edit_project: () => project ? projectForm(records, project) : unavailable('Choose an existing project to edit.'),
      workspace: () => projectId && !project ? unavailable('The requested project was not found.') : workspace(project, records),
      sales: () => salesPage(records), collections: () => collectionsPage(records), customers: () => customersPage(records),
      buyer: () => buyerPage(records), reports: () => reportsPage(records),
      procurement: () => procurementPage(records), approvals: () => approvalsPage(records),
      view_costs: () => expensePage(records), all_removed_costs: () => expensePage(records, true),
      select_cost_project: () => costProjectPicker(records), add_cost: () => costForm(records), edit_cost: () => costForm(records),
      register: () => teamPage(records), edit_user: () => teamPage(records), dropdown_options: () => settingsPage(records),
      audit_log: () => auditPage(records), all_edited_projects: () => auditPage(records), all_edited_costs: () => auditPage(records),
      profile: profilePage,
      login: () => heading('ConstructFlow', 'Real-estate project management.') + card('Continue', link('Open dashboard', url('index.html'), true)),
      change_password: () => heading('Account security', 'Password management requires a connected authentication service.') + card('Account access', '<p>This installation stores records locally and does not manage passwords.</p>' + link('Account', url('profile.html'))),
      error: () => unavailable('Return to the project register to continue.')
    };
    content.innerHTML = (pages[page] || pages.index)();
    if (['add_cost', 'edit_cost'].includes(page)) updateExpenseTotal();
  }

  function navigate(href) {
    location.href = href;
  }

  function updateExpenseTotal() {
    const costForm = document.querySelector('[data-form="cost"]');
    if (!costForm) return;
    const quantity = Number(costForm.elements.quantity.value);
    const rate = Number(costForm.elements.rate.value);
    document.getElementById('expense-total').textContent = 'Total expense: ' + money(C.round(quantity * rate));
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

  function exportCosts() {
    const records = store.snapshot();
    const voidedOnly = page === 'all_removed_costs';
    const costs = records.costs.filter(cost =>
      Boolean(cost.voidedAt) === voidedOnly &&
      (!projectId || cost.projectId === projectId) &&
      (!params.get('category') || cost.category === params.get('category')) &&
      (!params.get('start') || cost.date >= params.get('start')) &&
      (!params.get('end') || cost.date <= params.get('end'))
    );
    // Prefix spreadsheet formulas so descriptions cannot execute when a CSV is opened.
    const cell = value => '"' + String(value).replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"';
    const rows = [['Date', 'Project', 'Category', 'Description', 'Quantity', 'Rate', 'Total'], ...costs.map(cost => [cost.date, projectOf(records, cost.projectId)?.name, cost.category, cost.description, cost.quantity, cost.rate, C.round(cost.quantity * cost.rate)])];
    download('expenses.csv', rows.map(row => row.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  }

  document.addEventListener('submit', event => {
    const target = event.target.closest('form[data-form]');
    if (!target) return;
    event.preventDefault();
    if (!target.reportValidity()) return;
    const data = Object.fromEntries(new FormData(target));
    const pid = target.dataset.project;
    const recordId = target.dataset.id;
    try {
      switch (target.dataset.form) {
        case 'filter': {
          const query = {role};
          for (const key of ['project', 'sale', 'customer']) if (params.get(key) && !(key in data)) query[key] = params.get(key);
          Object.entries(data).forEach(([key, value]) => {if (value) query[key] = value;});
          navigate(url(page + '.html', query));
          return;
        }
        case 'add-project': navigate(projectUrl(store.addProject(data).id, 'land')); return;
        case 'edit-project': store.editProject(pid, data); navigate(projectUrl(pid)); return;
        case 'landowner': store.addLandowner(pid, data); break;
        case 'jv': store.recordJv(pid, data); break;
        case 'permit': store.addPermit(pid, data); break;
        case 'permit-decision': store.decidePermit(pid, recordId, data); break;
        case 'building': store.defineBuilding(pid, {...data, types: [0, 1, 2].map(index => ({code: data['code' + index], sizeSft: data['size' + index], beds: data['beds' + index]}))}); break;
        case 'allocate': store.allocateLandowner(pid, Object.keys(data).filter(key => key.startsWith('unit_')).map(key => key.slice(5))); break;
        case 'pricing': store.setPricing(pid, data); break;
        case 'customer': {
          const customer = store.addCustomer(data, recordId);
          if (page === 'customers' && !recordId) {navigate(url('customers.html', {customer: customer.id})); return;}
          break;
        }
        case 'booking': navigate(saleUrl(store.bookUnit(pid, data).id)); return;
        case 'receipt': {
          const receipt = store.addReceipt({...data, saleId: recordId});
          render();
          notify(`Money receipt ${receipt.no} issued for ${money(receipt.amount)}.`);
          return;
        }
        case 'agreement': store.signAgreement(pid, recordId, data); break;
        case 'cancel-sale': store.cancelSale(pid, recordId, data); break;
        case 'package': store.addPackage(pid, data); break;
        case 'drawing': store.addDrawing(pid, data); break;
        case 'site-log': store.addLog(pid, data); break;
        case 'rfi-response': store.respondRfi(pid, recordId, data.response); break;
        case 'change': store.addChange(pid, data); break;
        case 'material-request': store.requestMaterials(pid, data); break;
        case 'purchase-order': store.createOrder(pid, data); break;
        case 'cost': store.saveCost({...data, projectId: pid}, recordId); navigate(url('view_costs.html', {project: pid})); return;
        case 'punch': store.addPunch(pid, data); break;
        case 'occupancy': store.recordOccupancy(pid, data); break;
        case 'handover-unit': store.handoverUnit(pid, data.unitId, data); break;
        case 'association': store.formAssociation(pid, data); break;
        case 'user': store.saveUser(data, recordId); break;
        case 'option': store.addOption(data.kind, data.value); break;
        default: return;
      }
      render();
      notify('Record saved. Related totals and lists have been updated.');
    } catch (error) {
      notify(error.message, true);
    }
  });

  function confirmAction(title, action, recordId, pid) {
    const dialog = document.getElementById('confirmation');
    document.getElementById('confirmation-title').textContent = title;
    document.getElementById('confirmation-action').dataset.action = action;
    document.getElementById('confirmation-action').dataset.id = recordId;
    document.getElementById('confirmation-action').dataset.project = pid;
    dialog.showModal();
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('button[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    const recordId = target.dataset.id;
    const pid = target.dataset.project;
    if (action === 'toggle-theme') {
      theme = theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = theme;
      try { localStorage.setItem('constructflow.theme', theme); } catch (_) { /* The theme still applies for this page. */ }
      target.innerHTML = icon(theme === 'light' ? 'moon' : 'sun');
      target.setAttribute('aria-label', 'Switch to ' + (theme === 'light' ? 'dark' : 'light') + ' mode');
      return;
    }
    if (action === 'print') {window.print(); return;}
    const confirmations = {
      'void-cost': ['Void this expense? It remains in the activity history.', 'confirm-void'],
      'cancel-order': ['Cancel this purchase order without receiving it?', 'confirm-cancel-order'],
      advance: ['Move this project to the next stage? Records from the current stage will be locked.', 'confirm-advance']
    };
    if (confirmations[action]) {confirmAction(...confirmations[action], recordId, pid); return;}
    try {
      switch (action) {
        case 'close-dialog': document.getElementById('confirmation').close(); return;
        case 'confirm-advance': store.advance(pid); break;
        case 'approve-drawing': store.approveDrawing(pid, recordId); break;
        case 'rfi': store.raiseRfi(pid, recordId); break;
        case 'approve-change': store.decideChange(pid, recordId, 'Approved'); break;
        case 'reject-change': store.decideChange(pid, recordId, 'Rejected'); break;
        case 'cancel-request': store.cancelRequest(pid, recordId); break;
        case 'receive-order': store.receiveOrder(pid, recordId); break;
        case 'resolve-punch': store.resolvePunch(pid, recordId); break;
        case 'confirm-void': store.voidCost(recordId); break;
        case 'confirm-cancel-order': store.cancelOrder(pid, recordId); break;
        case 'export-costs': exportCosts(); return;
        case 'backup': download('constructflow-backup-' + today() + '.json', JSON.stringify(store.snapshot(), null, 2), 'application/json'); return;
        default: return;
      }
      document.getElementById('confirmation').close();
      render();
      notify('Record updated.');
    } catch (error) {
      document.getElementById('confirmation').close();
      notify(error.message, true);
    }
  });

  document.addEventListener('change', event => {
    const target = event.target;
    if (target.id === 'role-select') {
      const next = new URL(location.href);
      next.searchParams.set('role', target.value);
      navigate(next.href);
      return;
    }
    const siteForm = target.closest?.('[data-form="site-log"]');
    if (siteForm && target.name === 'packageId') {
      const project = store.project(siteForm.dataset.project);
      const drawings = project.drawings.filter(item => item.packageId === target.value && item.approved);
      siteForm.elements.drawingId.innerHTML = '<option value="">No drawing reference</option>' + drawings.map(drawing => `<option value="${escape(drawing.id)}">${escape(drawing.reference)} · Rev ${escape(drawing.revision)}</option>`).join('');
    }
  });

  document.addEventListener('input', event => {
    if (event.target.closest?.('[data-form="cost"]')) updateExpenseTotal();
  });
  window.addEventListener('hashchange', () => {if (store) render();});
  window.addEventListener('storage', event => {if (event.key === C.STORAGE_KEY) location.reload();});

  try {
    store = C.createStore(localStorage, role);
    shell();
    render();
  } catch (error) {
    shell();
    content.innerHTML = heading('Project records unavailable', 'Your records could not be loaded.') + card('Storage issue', '<p>' + escape(error.message) + '</p><p>Allow browser storage and reload this page. Existing records have not been overwritten.</p>');
  }
});
