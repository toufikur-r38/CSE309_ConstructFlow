/* Shared page rendering. Project changes go through app-store.js. */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const fileMode = location.protocol === 'file:';
  const entryPage = location.pathname.replace(/\/+$/, '').split('/').pop()?.replace(/\.html$/, '') || 'index';
  const page = fileMode ? params.get('page') || entryPage : entryPage;
  let savedRole;
  try { savedRole = sessionStorage.getItem('constructflow.role'); } catch (_) { /* URL preserves role when session storage is disabled. */ }
  const requestedRole = params.get('role') || savedRole || 'admin';
  const role = ['admin', 'operator', 'viewer'].includes(requestedRole) ? requestedRole : 'viewer';
  try { sessionStorage.setItem('constructflow.role', role); } catch (_) { /* Optional preference. */ }

  // File URLs can isolate storage per HTML file. Keep direct-file navigation on
  // index.html so every section uses the same records, just as it does on HTTP.
  if (fileMode && entryPage !== 'index') {
    params.set('page', page);
    location.replace('index.html?' + params + location.hash);
    return;
  }
  const canWrite = role !== 'viewer';
  const isAdmin = role === 'admin';
  const projectId = params.get('project') || '';
  const content = document.getElementById('content');
  const message = document.getElementById('message');
  const tabs = ['overview', 'contract', 'planning', 'site', 'procurement', 'changes', 'handover'];
  let store;
  let theme = 'light';
  try { theme = localStorage.getItem('constructflow.theme') === 'dark' ? 'dark' : 'light'; } catch (_) { /* Use the light theme when preferences are unavailable. */ }
  document.documentElement.dataset.theme = theme;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const money = value => 'BDT ' + Number(value).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const day = value => value ? new Date(value.length === 10 ? value + 'T00:00:00Z' : value).toLocaleDateString('en-GB', {timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric'}) : '—';
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  const badge = value => `<span class="badge ${['Active', 'Approved', 'Received', 'Fulfilled', 'Handed over', 'Resolved'].includes(value) ? 'success' : ['Pending', 'Tender', 'Requested', 'Ordered'].includes(value) ? 'warning' : ''}">${escape(value)}</span>`;
  const disabled = condition => condition ? ' disabled' : '';

  function url(file, query = {}, tab = '') {
    const values = new URLSearchParams({role, ...query});
    if (fileMode) values.set('page', file.replace(/\.html$/, ''));
    return (fileMode ? 'index.html' : file) + '?' + values + (tab ? '#' + tab : '');
  }

  function projectUrl(id, tab = 'overview') {
    return url('workspace.html', {project: id}, tab);
  }

  function link(label, href, primary = false) {
    return `<a class="button ${primary ? '' : 'secondary'}" href="${escape(href)}">${escape(label)}</a>`;
  }

  function button(label, action, recordId = '', allowed = canWrite, pid = projectId) {
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

  function form(name, fields, submit, allowed = canWrite, pid = projectId, recordId = '') {
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

  function heading(title, description, actions = '') {
    document.title = title + ' - ConstructFlow';
    return `<div class="page-heading"><div><h1>${escape(title)}</h1><p>${escape(description)}</p></div><div class="actions">${actions}</div></div>`;
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
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>'
    };
    return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.list}</svg>`;
  }

  function dashboardStat(label, value, symbol, color) {
    return `<article class="stat-card accent-${color}">
      <div><span class="metric-label">${escape(label)}</span><strong class="metric-value">${escape(value)}</strong></div>
      <span class="stat-icon">${icon(symbol)}</span>
    </article>`;
  }

  function actionTile(title, description, file, symbol, color) {
    return `<a class="action-card accent-${color}" href="${url(file)}">
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
      ['procurement', 'Procurement', 'procurement.html'], ['view_costs', 'Expenses', 'view_costs.html'],
      ['approvals', 'Approvals', 'approvals.html']
    ];
    document.getElementById('header').innerHTML = `
      <a class="brand" href="${url('index.html')}"><img src="assets/constructflow-logo.png" alt="ConstructFlow — Project Management" width="181" height="48"></a>
      <nav aria-label="Main navigation">${navigation.map(([key, label, file]) => `<a href="${url(file)}"${(key === page || (key === 'view_projects' && ['workspace', 'add_project', 'edit_project'].includes(page))) ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
      ${isAdmin ? `<details><summary>Management</summary><div><a href="${url('register.html')}">Team</a><a href="${url('audit_log.html')}">Activity log</a><a href="${url('dropdown_options.html')}">Settings</a></div></details>` : ''}</nav>
      <div class="account">
        <button class="theme-toggle" type="button" data-action="toggle-theme" aria-label="Switch to ${theme === 'light' ? 'dark' : 'light'} mode">${icon(theme === 'light' ? 'moon' : 'sun')}</button>
        <a class="user-badge" href="${url('profile.html')}"><span class="user-avatar">${icon('user')}</span>${escape(role[0].toUpperCase() + role.slice(1))}</a>
        <label class="role-label">View as<select id="role-select" aria-label="View as role"><option value="admin">Admin</option><option value="operator">Operator</option><option value="viewer">Viewer</option></select></label>
      </div>`;
    document.getElementById('role-select').value = role;
  }

  function nextStep(project) {
    if (project.status === 'Tender') return ['Review contract', 'contract'];
    if (project.status === 'Lost') return ['View tender outcome', 'contract'];
    if (project.status === 'Handed over') return ['View handover', 'handover'];
    if (!project.packages.length) return ['Plan work packages', 'planning'];
    const summary = store.summary(project);
    if (summary.pending) return ['Review pending changes', 'changes'];
    if (project.rfis.some(rfi => !rfi.response)) return ['Respond to open RFIs', 'changes'];
    if (summary.progress < 100) return ['Record site progress', 'site'];
    return ['Review handover checks', 'handover'];
  }

  function projectRows(projects) {
    return projects.map(project => {
      const summary = store.summary(project);
      const [next, tab] = nextStep(project);
      return [
        `<a class="project-name" href="${projectUrl(project.id)}">${escape(project.name)}</a><small>${escape(project.client)} · ${escape(project.location)}</small>`,
        badge(project.status),
        `${summary.progress}%<progress max="100" value="${summary.progress}" aria-label="${escape(project.name)} progress"></progress>`,
        project.originalBudget ? money(summary.budget) : `<span class="muted">Estimate ${money(project.boq.length ? ConstructFlow.total(project.boq) : project.estimate)}</span>`,
        money(summary.spending),
        `<a href="${projectUrl(project.id, tab)}">${escape(next)} →</a>`
      ];
    });
  }

  function activityRows(events, records) {
    return events.map(event => {
      const project = records.projects.find(item => item.id === event.projectId);
      return [day(event.at), escape(event.action), project ? `<a href="${projectUrl(project.id)}">${escape(project.name)}</a>` : 'Organisation', escape(event.description), escape(event.role)];
    });
  }

  function dashboard(records) {
    const summaries = records.projects.map(project => ({project, ...store.summary(project)}));
    const active = records.projects.filter(project => project.status === 'Active');
    const pending = summaries.reduce((sum, row) => sum + row.pending, 0);
    const committed = summaries.filter(row => row.project.originalBudget > 0);
    const allBudget = committed.reduce((sum, row) => sum + row.budget, 0);
    const allSpending = summaries.reduce((sum, row) => sum + row.spending, 0);
    const currentDay = today();
    const expenses = records.costs.filter(cost => !cost.voidedAt);
    const monthSpending = ConstructFlow.total(expenses.filter(cost => cost.date.slice(0, 7) === currentDay.slice(0, 7)));
    const todaySpending = ConstructFlow.total(expenses.filter(cost => cost.date === currentDay));
    const budgetAlerts = summaries.filter(row => row.project.status === 'Active' && row.remaining < 0).length;
    const pendingRows = records.projects.flatMap(project =>
      project.changes.filter(change => change.status === 'Pending').map(change => [
        escape(project.name), escape(change.title), money(change.amount),
        link('Review', projectUrl(project.id, 'changes'))
      ])
    );
    const workflow = `
      <ol class="workflow">
        <li>Add project and confirm contract</li>
        <li>Plan work packages and drawings</li>
        <li>Record site progress and procure materials</li>
        <li>Track expenses and approve changes when needed</li>
        <li>Complete checks and hand over</li>
      </ol>
      <div class="actions">
        ${link('All projects', url('view_projects.html'))}
        ${link('Approvals', url('approvals.html'))}
      </div>`;
    const quickActions = [
      canWrite ? actionTile('Add New Project', 'Register a project or tender', 'add_project.html', 'folder', 'warning') : '',
      actionTile('Project Ledger', 'View all project details', 'view_projects.html', 'list', 'primary'),
      canWrite ? actionTile('Daily Cost Entry', 'Record materials and expenses', 'select_cost_project.html', 'invoice', 'danger') : '',
      actionTile('Financial Reports', 'View categorized spending', 'view_costs.html', 'chart', 'success'),
      actionTile('Procurement', 'Track orders and deliveries', 'procurement.html', 'truck', 'info'),
      actionTile('Approvals', 'Review contracts and changes', 'approvals.html', 'check', 'primary')
    ].join('\n');
    return heading(role[0].toUpperCase() + role.slice(1) + ' Dashboard', 'Project and financial status · ' + day(currentDay), canWrite ? link('Add project', url('add_project.html'), true) : '') +
      `<div class="dashboard-metrics">
        ${dashboardStat('Running Projects', active.length, 'helmet', 'primary')}
        ${dashboardStat('Expenses This Month', money(monthSpending), 'calendar', 'info')}
        ${dashboardStat('Expenses Today', money(todaySpending), 'bolt', 'warning')}
        ${dashboardStat('Budget Alerts', budgetAlerts, 'alert', budgetAlerts ? 'danger' : 'success')}
      </div>
      <div class="portfolio-summary" aria-label="Portfolio totals">
        ${metric('Tender review', records.projects.filter(project => project.status === 'Tender').length)}
        ${metric('Handed over', records.projects.filter(project => project.status === 'Handed over').length)}
        ${metric('Pending changes', pending)}
        ${metric('Approved budgets', money(allBudget))}
        ${metric('Actual spending', money(allSpending))}
      </div>
      <section class="quick-actions"><h2>Quick Actions</h2><div class="action-grid">${quickActions}</div></section>` +
      card('Active Projects Breakdown', table(['Project', 'Status', 'Progress¹', 'Revised budget', 'Actual spending', 'Next action'], projectRows(records.projects.filter(project => ['Tender', 'Active'].includes(project.status))), 'No open projects. Add a project to begin.')) +
      `<p class="status-line">¹ Progress is the average completion of planned work packages. Spending is calculated from recorded expenses.</p>` +
      columns(
        card('Pending decisions', table(['Project', 'Change', 'Amount', ''], pendingRows), 'Only approved changes affect the revised budget.'),
        card('Project workflow', workflow)
      ) +
      `<div class="section-gap">${card('Recent activity', table(['Date', 'Activity', 'Project', 'Details', 'Role'], activityRows(records.audit.slice(0, 6), records)))}</div>`;
  }

  function projectList(records, title = 'Projects') {
    const search = (params.get('q') || '').toLowerCase();
    const status = params.get('status') || '';
    const projects = records.projects.filter(project => (!status || project.status === status) && `${project.name} ${project.client} ${project.location}`.toLowerCase().includes(search));
    const filters = `<form class="filters" data-form="filter">${input('q', 'Search', params.get('q') || '', 'search')}${select('status', 'Status', ['Tender', 'Active', 'Lost', 'Handed over'], status, 'All statuses')}<button class="button" type="submit">Apply filters</button></form>`;
    return heading(title, 'Select a project to view its plan, site records, procurement, and costs.', canWrite ? link('Add project', url('add_project.html'), true) : '') +
      card('Project register', filters + table(['Project', 'Status', 'Progress', 'Budget', 'Spending', 'Next action'], projectRows(projects), 'No projects match these filters.'));
  }

  function projectForm(records, project = null) {
    if (!canWrite) return unavailable('Your role can view projects but cannot change them.');
    if (project?.status === 'Handed over') return unavailable('This project has been handed over and is closed.');
    const contractFields = project
      ? '<p class="status-line">The original contract amount is preserved. Submit a priced change to revise the approved budget.</p>'
      : `<div class="form-row">
          ${select('stage', 'Starting stage', [['awarded', 'Already awarded'], ['tender', 'Tender stage']])}
          ${input('budget', 'Contract budget / tender estimate (BDT)', '', 'number', 'min="0.01" step="0.01" required')}
        </div>
        <p class="status-line">Already awarded projects begin with an approved contract budget. Tender projects stay in review until the contract is awarded.</p>`;
    const fields = `<div class="form-row">${input('name', 'Project name', project?.name, 'text', 'required maxlength="150"')}${input('client', 'Client', project?.client, 'text', 'required maxlength="150"')}</div>
      <div class="form-row">${input('location', 'Location', project?.location, 'text', 'required')}${select('sector', 'Sector', [...new Set([...records.settings.sectors, ...(project ? [project.sector] : [])])], project?.sector)}</div>
      <div class="form-row">${input('start', 'Start date', project?.start || today(), 'date', 'required')}${input('end', 'Planned completion', project?.end, 'date', 'required')}</div>
      ${contractFields}`;
    return heading(project ? 'Edit project' : 'Add project', project ? project.name : 'Create the project once. All subsequent records will be linked to it.', link('Back to projects', url('view_projects.html'))) +
      card('Project details', form(project ? 'edit-project' : 'add-project', fields, project ? 'Save changes' : 'Create project', true, project?.id || ''));
  }

  function unavailable(reason) {
    return heading('Record unavailable', reason, link('View projects', url('view_projects.html')));
  }

  function workspace(project, records) {
    if (!project) return projectList(records, 'Select a project');
    const summary = store.summary(project);
    const requested = location.hash.slice(1);
    const tab = tabs.includes(requested) ? requested : 'overview';
    const labels = {overview: 'Overview', contract: 'Contract', planning: 'Planning', site: 'Site logs', procurement: 'Procurement', changes: 'Changes & costs', handover: 'Handover'};
    const actions = link('Expense ledger', url('view_costs.html', {project: project.id})) +
      (canWrite && project.status !== 'Handed over' ? link('Edit details', url('edit_project.html', {project: project.id})) : '');
    const header = heading(project.name, `${project.client} · ${project.location} · ${project.sector}`, actions) +
      `<section class="project-header"><div class="project-heading"><div>${badge(project.status)} <span class="muted">${day(project.start)} – ${day(project.end)}</span></div><a href="${url('view_projects.html')}">All projects</a></div><div class="summary-grid">${metric('Progress', summary.progress + '%')}${metric('Original budget', money(project.originalBudget))}${metric('Revised budget', money(summary.budget))}${metric('Actual spending', money(summary.spending))}</div></section>
      <nav class="tabs" aria-label="Project sections">${tabs.map(key => `<a href="${projectUrl(project.id, key)}"${tab === key ? ' aria-current="page"' : ''}>${labels[key]}</a>`).join('')}</nav>`;
    const views = {overview: overviewTab, contract: contractTab, planning: planningTab, site: siteTab, procurement: procurementTab, changes: changesTab, handover: handoverTab};
    if (!['overview', 'contract'].includes(tab) && ['Tender', 'Lost'].includes(project.status)) {
      return header + card('Contract confirmation required', `<p>${project.status === 'Lost' ? 'This tender was unsuccessful. No site activity or costs can be recorded.' : 'Award the contract before planning and recording project activity.'}</p>${link('Review contract', projectUrl(project.id, 'contract'), true)}`);
    }
    return header + views[tab](project, records);
  }

  function overviewTab(project, records) {
    const summary = store.summary(project);
    const [next, tab] = nextStep(project);
    const expenses = records.costs.filter(cost => cost.projectId === project.id && !cost.voidedAt).slice(-5).reverse();
    const totals = definitionList([
      ['Approved changes', money(summary.approvedChanges)], ['Budget remaining', money(summary.remaining)],
      ['Open RFIs', project.rfis.filter(rfi => !rfi.response).length], ['Pending changes', summary.pending],
      ['Open purchase orders', project.orders.filter(order => order.status === 'Ordered').length]
    ]);
    const expenseRows = expenses.map(cost => [day(cost.date), escape(cost.description), money(cost.quantity * cost.rate)]);
    const expenseAction = project.status === 'Active' && canWrite
      ? link('Record expense', url('add_cost.html', {project: project.id})) : '';
    return columns(
      stack(card('Next action', `<p>${escape(next)}.</p>${link(next, projectUrl(project.id, tab), true)}`), card('Work progress', packageTable(project))),
      stack(card('Project totals', totals), card('Recent expenses', table(['Date', 'Description', 'Amount'], expenseRows) + `<div class="actions">${expenseAction}</div>`))
    );
  }

  function contractTab(project) {
    const tender = project.status === 'Tender';
    const rows = project.boq.map(item => [escape(item.name), `${item.quantity} ${escape(item.unit)}`, money(item.rate), money(item.quantity * item.rate), tender ? button('Remove', 'remove-boq', item.id) : '']);
    const boq = table(['Work item', 'Quantity', 'Rate', 'Amount', ''], rows, 'No bill of quantities has been entered. You may award using the agreed contract amount.') +
      (rows.length ? `<p class="total-line">BOQ total: <strong>${money(ConstructFlow.total(project.boq))}</strong></p>` : '');
    const itemForm = tender ? card('Add estimate item', form('boq', input('name', 'Work item', '', 'text', 'required') + `<div class="form-row">${input('quantity', 'Quantity', '', 'number', 'min="0.01" step="0.01" required')}${input('unit', 'Unit', '', 'text', 'required placeholder="m³, bags, days…"')}</div>` + input('rate', 'Unit rate (BDT)', '', 'number', 'min="0.01" step="0.01" required'), 'Add item', canWrite)) : '';
    const awardFields = (project.boq.length
      ? `<p>The BOQ total of <strong>${money(ConstructFlow.total(project.boq))}</strong> will become the original budget.</p>`
      : input('amount', 'Agreed contract amount (BDT)', project.estimate, 'number', 'min="0.01" step="0.01" required')) +
      '<p class="status-line">Awarding the contract unlocks planning, procurement, and expenses.</p>';
    const contract = tender
      ? form('award', awardFields, 'Award contract', isAdmin) + `<div class="actions">${button('Mark unsuccessful', 'lose-tender', '', isAdmin)}</div>` :
      `<p>Status: ${badge(project.status)}</p><p>Original contract: <strong>${money(project.originalBudget)}</strong><br>Awarded: ${day(project.awardedAt)}</p><p class="status-line">Approved changes are recorded separately and preserve the original contract amount.</p>`;
    return `<div class="two-column"><div class="stack">${card('Bill of quantities', boq)}${itemForm}</div>${card('Contract status', contract)}</div>`;
  }

  function packageTable(project) {
    return table(['Work package', 'Schedule', 'Completed quantity', 'Progress'], project.packages.map(item => {
      const completed = project.logs.filter(log => log.packageId === item.id).reduce((sum, log) => sum + log.quantity, 0);
      return [escape(item.name), `${day(item.start)}<br>${day(item.end)}`, `${ConstructFlow.round(completed)} / ${item.quantity} ${escape(item.unit)}`, `${Math.round(store.packageProgress(project, item))}%`];
    }), 'No work packages planned yet.');
  }

  function planningTab(project) {
    const editable = canWrite && project.status === 'Active';
    const packageFields = input('name', 'Work package', '', 'text', 'required placeholder="Foundation"') +
      `<div class="form-row">${input('quantity', 'Planned quantity', '', 'number', 'min="0.01" step="0.01" required')}${input('unit', 'Unit', '', 'text', 'required')}</div>` +
      `<div class="form-row">${input('start', 'Start date', project.start, 'date', `required min="${project.start}" max="${project.end}"`)}${input('end', 'Completion date', project.end, 'date', `required min="${project.start}" max="${project.end}"`)}</div>`;
    const drawingRows = project.drawings.map(drawing => [
      `${escape(drawing.reference)}<small>${escape(drawing.title)}</small>`, escape(drawing.revision), escape(project.packages.find(item => item.id === drawing.packageId)?.name),
      badge(drawing.approved ? 'Approved' : drawing.superseded ? 'Superseded' : 'Pending'),
      (drawing.url ? `<a href="${escape(drawing.url)}" target="_blank" rel="noopener noreferrer">Open document</a> ` : '<span class="muted">No document link</span> ') +
      (!drawing.approved ? button('Approve revision', 'approve-drawing', drawing.id, isAdmin && project.status === 'Active') : '')
    ]);
    const drawingFields = select('packageId', 'Work package', project.packages.map(item => [item.id, item.name])) +
      `<div class="form-row">${input('reference', 'Drawing reference', '', 'text', 'required')}${input('revision', 'Revision', '', 'text', 'required')}</div>` + input('title', 'Drawing title', '', 'text', 'required') + input('url', 'Document link (optional)', '', 'url');
    return stack(
      card('Work packages', packageTable(project)),
      columns(
        card('Plan work package', form('package', packageFields, 'Add work package', editable)),
        card('Register drawing', form('drawing', drawingFields, 'Register revision', editable && project.packages.length > 0), 'Approving a revision supersedes the previous approved revision of the same drawing.')
      ),
      card('Drawing register', table(['Drawing', 'Revision', 'Work package', 'Status', 'Document / action'], drawingRows))
    );
  }

  function siteTab(project) {
    const selected = project.packages[0];
    const drawings = project.drawings.filter(drawing => drawing.packageId === selected?.id && drawing.approved);
    const fields = select('packageId', 'Work package', project.packages.map(item => [item.id, `${item.name} (${item.unit})`])) +
      `<div class="form-row">${input('date', 'Date', today(), 'date', 'required')}${input('quantity', 'Quantity completed', '', 'number', 'min="0" step="0.01" required')}</div>` +
      select('drawingId', 'Approved drawing reference', drawings.map(drawing => [drawing.id, drawing.reference + ' · Rev ' + drawing.revision]), '', 'No drawing reference') +
      textarea('notes', 'Progress notes') + textarea('blocker', 'Blocker / clarification needed (optional)', '', false);
    const logs = project.logs.slice().reverse().map(log => {
      const item = project.packages.find(pkg => pkg.id === log.packageId);
      const rfi = project.rfis.find(record => record.logId === log.id);
      const rfiAction = rfi ? link('View linked RFI', projectUrl(project.id, 'changes'))
        : button('Raise RFI', 'rfi', log.id, canWrite && project.status === 'Active');
      return `<article class="record">
        <div class="section-heading">
          <h3>${escape(item?.name)} · ${log.quantity} ${escape(item?.unit)}</h3>
          <span class="muted">${day(log.date)}</span>
        </div>
        <p>${escape(log.notes)}</p>
        ${log.drawingReference ? `<p class="status-line">Drawing: ${escape(log.drawingReference)}</p>` : ''}
        ${log.blocker ? `<div class="callout"><strong>Blocker:</strong> ${escape(log.blocker)}</div>${rfiAction}` : ''}
      </article>`;
    }).join('');
    return `<div class="two-column">${card('Record site activity', form('site-log', fields, 'Save daily log', canWrite && project.status === 'Active' && project.packages.length > 0), 'Completed quantities update the work package and dashboard progress. A zero quantity can record a blocked day.')}<div class="stack">${card('Site records', logs || '<p class="empty">No site activity recorded.</p>')}${card('Work progress', packageTable(project))}</div></div>`;
  }

  function procurementTab(project) {
    const editable = canWrite && project.status === 'Active';
    const requests = project.requests.filter(request => request.status === 'Requested');
    const requestFields = select('packageId', 'Work package (optional)', project.packages.map(item => [item.id, item.name]), '', 'Project-wide') + input('item', 'Material', '', 'text', 'required') +
      `<div class="form-row">${input('quantity', 'Quantity', '', 'number', 'min="0.01" step="0.01" required')}${input('unit', 'Unit', '', 'text', 'required')}</div>`;
    const orderFields = select('requestId', 'Material request', requests.map(request => [request.id, `${request.item} · ${request.quantity} ${request.unit}`])) + input('supplier', 'Supplier', '', 'text', 'required') +
      `<div class="form-row">${input('rate', 'Unit rate (BDT)', '', 'number', 'min="0.01" step="0.01" required')}${input('expected', 'Expected delivery', today(), 'date', 'required')}</div>`;
    const requestRows = project.requests.map(request => [escape(request.item), `${request.quantity} ${escape(request.unit)}`, escape(project.packages.find(item => item.id === request.packageId)?.name || 'Project-wide'), badge(request.status), request.status === 'Requested' ? button('Cancel request', 'cancel-request', request.id, editable) : '']);
    return stack(
      columns(
        card('Request materials', form('material-request', requestFields, 'Save request', editable)),
        card('Issue purchase order', form('purchase-order', orderFields, 'Create purchase order', editable && requests.length > 0), 'Purchase orders track commitments and delivery. They do not create expenses.')
      ),
      card('Material requests', table(['Material', 'Quantity', 'Work package', 'Status', 'Action'], requestRows)),
      card('Purchase orders', orderTable([project]))
    );
  }

  function orderTable(projects) {
    const rows = projects.flatMap(project => project.orders.map(order => [
      `<a href="${projectUrl(project.id, 'procurement')}">${escape(project.name)}</a><small>${escape(order.supplier)}</small>`,
      `${escape(order.item)}<small>${order.quantity} ${escape(order.unit)}</small>`, money(order.quantity * order.rate),
      order.receivedAt ? day(order.receivedAt) : day(order.expected), badge(order.status),
      order.status === 'Ordered' ? `<div class="inline-actions">${button('Receive delivery', 'receive-order', order.id, canWrite && project.status === 'Active', project.id)}${button('Cancel', 'cancel-order', order.id, isAdmin && project.status === 'Active', project.id)}</div>` :
      order.status === 'Received' && project.status === 'Active' && canWrite ? link('Record expense', url('add_cost.html', {project: project.id, order: order.id})) : ''
    ]));
    return table(['Project / supplier', 'Material', 'Order value', 'Delivery', 'Status', 'Actions'], rows, 'No purchase orders yet. Open a project to request materials.');
  }

  function changesTab(project) {
    const summary = store.summary(project);
    const editable = canWrite && project.status === 'Active';
    const rfis = project.rfis.map((rfi, index) => {
      const item = project.packages.find(pkg => pkg.id === rfi.packageId);
      const response = rfi.response
        ? `<div class="callout"><strong>Design response</strong><p>${escape(rfi.response)}</p></div>`
        : form('rfi-response', textarea('response', 'Design response'), 'Record response', isAdmin && project.status === 'Active', project.id, rfi.id);
      return `<article class="record">
        <h3>RFI ${index + 1} · ${escape(item?.name)}</h3>
        <p>${escape(rfi.question)}</p>
        <p class="status-line">Raised ${day(rfi.at)} · ${escape(rfi.drawingReference || 'No drawing reference')} · Linked to site log</p>
        ${response}
      </article>`;
    }).join('');
    const fields = input('title', 'Change title', '', 'text', 'required') + textarea('reason', 'Reason / scope') +
      select('rfiId', 'Related RFI (optional)', project.rfis.filter(rfi => rfi.response).map((rfi, index) => [rfi.id, rfi.question.slice(0, 80)]), '', 'Direct scope change') +
      input('amount', 'Budget adjustment (BDT)', '', 'number', 'step="0.01" required') + '<p class="status-line">Use a positive amount for additions or a negative amount for savings. Changes affect the budget after approval.</p>';
    const budget = `<div class="cost-grid">
        ${metric('Original contract', money(project.originalBudget))}
        ${metric('Approved changes', money(summary.approvedChanges))}
        ${metric('Revised budget', money(summary.budget))}
        ${metric('Actual spending', money(summary.spending))}
      </div>
      <p>Budget remaining: <strong>${money(summary.remaining)}</strong></p>
      <div class="actions">
        ${link('Expense ledger', url('view_costs.html', {project: project.id}))}
        ${editable ? link('Record expense', url('add_cost.html', {project: project.id})) : ''}
      </div>`;
    return stack(
      columns(
        card('Requests for information', rfis || '<p class="empty">No RFIs. Raise one from a site log when clarification is needed.</p>'),
        card('Budget and spending', budget)
      ),
      card('Change register', changeTable([project])),
      card('Submit priced change', form('change', fields, 'Submit for approval', editable), 'A change can follow an RFI or a direct client instruction. It is not required for every project.')
    );
  }

  function changeTable(projects, pendingOnly = false) {
    const rows = projects.flatMap(project => project.changes.filter(change => !pendingOnly || change.status === 'Pending').map(change => [
      `<a href="${projectUrl(project.id, 'changes')}">${escape(project.name)}</a>`,
      `${escape(change.title)}<small>${escape(change.reason)}</small>`, money(change.amount), badge(change.status),
      change.status === 'Pending' ? `<div class="inline-actions">${button('Approve', 'approve-change', change.id, isAdmin && project.status === 'Active', project.id)}${button('Reject', 'reject-change', change.id, isAdmin && project.status === 'Active', project.id)}</div>` : day(change.decidedAt)
    ]));
    return table(['Project', 'Change', 'Adjustment', 'Status', 'Decision'], rows, pendingOnly ? 'No changes awaiting a decision.' : 'No changes recorded.');
  }

  function handoverTab(project) {
    const editable = canWrite && project.status === 'Active';
    const checks = store.handoverChecks(project);
    const summary = store.summary(project);
    const punch = table(['Item', 'Status', 'Action'], project.punch.map(item => [escape(item.description), badge(item.resolvedAt ? 'Resolved' : 'Open'), item.resolvedAt ? day(item.resolvedAt) : button('Resolve', 'resolve-punch', item.id, editable)]), 'No open defects recorded.');
    const documents = [['drawings', 'Approved as-built drawings'], ['certificates', 'Inspection and completion certificates'], ['manual', 'Operations and maintenance manual']].map(([key, label]) => `<label class="check-row"><input type="checkbox" data-document="${key}" data-project="${escape(project.id)}"${project.documents[key] ? ' checked' : ''}${disabled(!editable)}><span>${label}</span></label>`).join('');
    const finalSummary = definitionList([
      ['Award date', day(project.awardedAt)], ['Handover date', day(project.signedAt)],
      ['Approved changes', money(summary.approvedChanges)], ['Final budget', money(summary.budget)],
      ['Recorded spending at handover', money(summary.spending)]
    ]);
    const acceptance = project.signedAt
      ? `<div class="callout"><strong>Client acceptance recorded</strong><p>${escape(project.signedBy)} · ${day(project.signedAt)}</p></div>${finalSummary}` :
      `<ul class="checklist">${checks.map(check => `<li>${check.done ? '✓' : '○'} ${escape(check.label)}</li>`).join('')}</ul>` + form('sign-off', input('representative', 'Client representative', '', 'text', 'required'), 'Record client acceptance', isAdmin && checks.every(check => check.done)) + '<p class="status-line">Recording acceptance closes project activity. Complete all checks before signing off.</p>';
    return `<div class="two-column"><div class="stack">${card('Punch list', punch + (editable ? form('punch', input('description', 'Defect / outstanding item', '', 'text', 'required'), 'Add item') : ''))}${card('Handover documents', documents)}</div>${card('Client sign-off', acceptance)}</div>`;
  }

  function procurementPage(records) {
    const selected = records.projects.find(project => project.id === projectId);
    const projects = selected ? [selected] : records.projects;
    return heading('Procurement', 'Material requests and purchase orders across your projects.', selected ? link('Open project procurement', projectUrl(selected.id, 'procurement'), true) : link('Select project', url('view_projects.html'))) +
      card('Purchase orders', projectFilter(records, projectId) + orderTable(projects)) +
      `<div class="section-gap">${card('Outstanding material requests', table(['Project', 'Material', 'Quantity', ''], projects.flatMap(project => project.requests.filter(request => request.status === 'Requested').map(request => [escape(project.name), escape(request.item), `${request.quantity} ${escape(request.unit)}`, link('Issue order', projectUrl(project.id, 'procurement'))]))))}</div>`;
  }

  function projectFilter(records, selected = '', activeOnly = false) {
    const projects = activeOnly ? records.projects.filter(project => project.status === 'Active') : records.projects;
    return `<form class="filters" data-form="filter">${select('project', 'Project', projects.map(project => [project.id, project.name]), selected, 'All projects')}<button type="submit" class="button">Apply</button></form>`;
  }

  function expensePage(records, voidedOnly = false) {
    const category = params.get('category') || '';
    const start = params.get('start') || '';
    const end = params.get('end') || '';
    const costs = records.costs.filter(cost => Boolean(cost.voidedAt) === voidedOnly && (!projectId || cost.projectId === projectId) && (!category || cost.category === category) && (!start || cost.date >= start) && (!end || cost.date <= end));
    const filters = `<form class="filters" data-form="filter">${select('project', 'Project', records.projects.map(project => [project.id, project.name]), projectId, 'All projects')}${select('category', 'Category', records.settings.categories, category, 'All categories')}${input('start', 'From', start, 'date')}${input('end', 'To', end, 'date')}<button class="button" type="submit">Apply</button></form>`;
    const rows = costs.slice().sort((a, b) => b.date.localeCompare(a.date)).map(cost => {
      const project = records.projects.find(item => item.id === cost.projectId);
      return [day(cost.date), `<a href="${projectUrl(cost.projectId, 'changes')}">${escape(project?.name)}</a>`, `${escape(cost.description)}<small>${escape(cost.category)}</small>`, cost.quantity, money(cost.rate), money(cost.quantity * cost.rate),
        !voidedOnly && canWrite && project?.status === 'Active' ? `<div class="inline-actions">${link('Edit', url('edit_cost.html', {project: cost.projectId, cost: cost.id}))}${button('Void', 'void-cost', cost.id, isAdmin, cost.projectId)}</div>` : (cost.voidedAt ? 'Voided ' + day(cost.voidedAt) : '')];
    });
    const actions = (voidedOnly ? link('Active expenses', url('view_costs.html', projectId ? {project: projectId} : {})) :
      (canWrite ? link('Record expense', url(projectId ? 'add_cost.html' : 'select_cost_project.html', projectId ? {project: projectId} : {}), true) : '')) +
      (!voidedOnly && isAdmin ? link('Voided expenses', url('all_removed_costs.html', projectId ? {project: projectId} : {})) : '');
    return heading(voidedOnly ? 'Voided expenses' : 'Expenses', 'Recorded expenses update project spending and dashboard totals.', actions) +
      card('Expenditure ledger', filters + table(['Date', 'Project', 'Description', 'Quantity', 'Unit rate', 'Total', 'Actions'], rows, 'No expenses match these filters.') + `<p class="total-line">Total: <strong>${money(ConstructFlow.total(costs))}</strong></p><div class="actions">${button('Export CSV', 'export-costs', '', true)}</div>`);
  }

  function costProjectPicker(records) {
    const active = records.projects.filter(project => project.status === 'Active');
    return heading('Record expense', 'Choose the project this expense belongs to.') +
      card('Active projects', table(['Project', 'Spending / budget', ''], active.map(project => {
        const summary = store.summary(project);
        return [escape(project.name), `${money(summary.spending)} / ${money(summary.budget)}`, link('Select project', url('add_cost.html', {project: project.id}), true)];
      }), 'No active projects. Add an awarded project or award an existing tender.'));
  }

  function costForm(records) {
    if (!canWrite) return unavailable('Your role cannot record expenses.');
    const existing = records.costs.find(cost => cost.id === params.get('cost'));
    if (page === 'edit_cost' && !existing) return unavailable('The requested expense could not be found.');
    const project = records.projects.find(item => item.id === (existing?.projectId || projectId));
    if (!project) return costProjectPicker(records);
    if (project.status !== 'Active' || existing?.voidedAt) return unavailable('Expenses can only be recorded for active projects.');
    const order = project.orders.find(item => item.id === params.get('order'));
    const fields = `<p><strong>Project:</strong> <a href="${projectUrl(project.id, 'changes')}">${escape(project.name)}</a></p>` +
      `<div class="form-row">${input('date', 'Date', existing?.date || today(), 'date', 'required')}${select('category', 'Category', [...new Set([...records.settings.categories, ...(existing ? [existing.category] : [])])], existing?.category || (order ? 'Materials' : ''))}</div>` +
      input('description', 'Description', existing?.description || order?.item, 'text', 'required') +
      `<div class="form-row">${input('quantity', 'Quantity', existing?.quantity || order?.quantity || 1, 'number', 'min="0.01" step="0.01" required')}${input('rate', 'Unit rate (BDT)', existing?.rate || order?.rate || '', 'number', 'min="0.01" step="0.01" required')}</div>` +
      select('orderId', 'Related purchase order (optional)', project.orders.filter(item => item.status !== 'Cancelled').map(item => [item.id, item.item + ' · ' + item.supplier]), existing?.orderId || order?.id, 'No purchase order') +
      (order && !existing && records.costs.some(cost => cost.orderId === order.id && !cost.voidedAt) ? '<div class="callout">This order already has recorded expenses. Check the ledger before adding another invoice.</div>' : '') +
      '<p class="status-line" id="expense-total">Enter quantity and unit rate to calculate the total.</p>';
    return heading(existing ? 'Edit expense' : 'Record expense', project.name, link('Back to ledger', url('view_costs.html', {project: project.id}))) + card('Expense details', form('cost', fields, 'Save expense', true, project.id, existing?.id || ''));
  }

  function approvalsPage(records) {
    const projects = projectId ? records.projects.filter(project => project.id === projectId) : records.projects;
    const tenders = projects.filter(project => project.status === 'Tender').map(project => [
      escape(project.name),
      money(project.boq.length ? ConstructFlow.total(project.boq) : project.estimate),
      link('Review contract', projectUrl(project.id, 'contract'))
    ]);
    const rfis = projects.flatMap(project =>
      project.rfis.filter(rfi => !rfi.response).map(rfi => [
        escape(project.name), escape(rfi.question),
        link('Review RFI', projectUrl(project.id, 'changes'))
      ])
    );
    const drawings = projects.filter(project => project.status === 'Active').flatMap(project =>
      project.drawings.filter(drawing => !drawing.approved && !drawing.superseded).map(drawing => [
        escape(project.name), escape(drawing.reference), escape(drawing.revision),
        link('Review drawings', projectUrl(project.id, 'planning'))
      ])
    );
    return heading('Approvals', 'Review contract awards, drawing revisions, RFIs, and priced changes.') +
      `<div class="stack">
        ${card('Pending changes', projectFilter(records, projectId) + changeTable(projects, true))}
        ${card('Tenders awaiting award', table(['Project', 'Estimate', ''], tenders))}
        ${card('RFIs awaiting response', table(['Project', 'Question', ''], rfis))}
        ${card('Drawings awaiting approval', table(['Project', 'Drawing', 'Revision', ''], drawings))}
      </div>`;
  }

  function teamPage(records) {
    if (!isAdmin) return unavailable('Only administrators can manage team records.');
    const user = records.users.find(item => item.id === params.get('user'));
    const fields = input('name', 'Name', user?.name, 'text', 'required') + input('email', 'Email', user?.email, 'email') + select('role', 'Role', ['admin', 'operator', 'viewer'], user?.role);
    const rows = records.users.map(item => [
      escape(item.name), escape(item.email || '—'), escape(item.role),
      link('Edit', url('edit_user.html', {user: item.id}))
    ]);
    return heading('Team', 'Maintain team contact details and responsibilities.') + columns(
      card('Team members', table(['Name', 'Email', 'Role', ''], rows)),
      card(user ? 'Edit team member' : 'Add team member', form('user', fields, 'Save member', true, '', user?.id || ''), 'These records track responsibilities. They do not create sign-in accounts.')
    );
  }

  function settingsPage(records) {
    if (!isAdmin) return unavailable('Only administrators can change settings.');
    function options(kind, title, singular) {
      const list = '<ul>' + records.settings[kind].map(item => `<li>${escape(item)}</li>`).join('') + '</ul>';
      const fields = `<input type="hidden" name="kind" value="${kind}">` + input('value', 'New ' + singular, '', 'text', 'required');
      return card(title, list + form('option', fields, 'Add ' + singular, true, ''));
    }
    return heading('Settings', 'Project classifications and expense categories.') + stack(
      columns(options('sectors', 'Project sectors', 'sector'), options('categories', 'Expense categories', 'category')),
      card('Data backup', '<p>Records are saved in this browser on this device. Export a backup before clearing browser data.</p>' + button('Export backup', 'backup', '', true))
    );
  }

  function auditPage(records) {
    if (!isAdmin) return unavailable('Only administrators can view the activity log.');
    const only = params.get('project');
    let events = records.audit.filter(event => !only || event.projectId === only);
    if (page === 'all_edited_projects') events = events.filter(event => event.action === 'Project updated');
    if (page === 'all_edited_costs') events = events.filter(event => event.action === 'Expense updated');
    const historyLinks = link('All activity', url('audit_log.html')) +
      link('Project edits', url('all_edited_projects.html')) + link('Expense edits', url('all_edited_costs.html'));
    return heading('Activity log', 'Project and expense actions recorded across the application.', historyLinks) +
      card('Recorded activity', projectFilter(records, only) + table(['Date', 'Activity', 'Project', 'Details', 'Role'], activityRows(events, records)));
  }

  function render() {
    const records = store.snapshot();
    const project = records.projects.find(item => item.id === projectId);
    const pages = {
      index: () => dashboard(records), modules: () => dashboard(records),
      view_projects: () => projectList(records), add_project: () => projectForm(records),
      edit_project: () => project ? projectForm(records, project) : unavailable('Choose an existing project to edit.'),
      workspace: () => projectId && !project ? unavailable('The requested project was not found.') : workspace(project, records),
      procurement: () => procurementPage(records), approvals: () => approvalsPage(records),
      view_costs: () => expensePage(records), all_removed_costs: () => expensePage(records, true),
      select_cost_project: () => costProjectPicker(records), add_cost: () => costForm(records), edit_cost: () => costForm(records),
      register: () => teamPage(records), edit_user: () => teamPage(records), dropdown_options: () => settingsPage(records),
      audit_log: () => auditPage(records), all_edited_projects: () => auditPage(records), all_edited_costs: () => auditPage(records),
      all_removed_projects: () => projectList(records),
      profile: () => heading('Account', 'Current application role: ' + role) + card('Role access', '<p>Administrators approve contracts, drawings, changes, and handovers. Operators record project activity and expenses. Viewers have read access.</p><p>Records are stored on this device. Role views are not authenticated accounts.</p>' + link('Dashboard', url('index.html'))),
      login: () => heading('ConstructFlow', 'Continue to your project dashboard.') + card('Project management', link('Open dashboard', url('index.html'), true)),
      change_password: () => heading('Account security', 'Password management requires a connected authentication service.') + card('Account access', '<p>This installation stores project records locally and does not manage passwords.</p>' + link('Account', url('profile.html'))),
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
    document.getElementById('expense-total').textContent = 'Total expense: ' + money(ConstructFlow.round(quantity * rate));
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
    const rows = [['Date', 'Project', 'Category', 'Description', 'Quantity', 'Rate', 'Total'], ...costs.map(cost => [cost.date, records.projects.find(project => project.id === cost.projectId)?.name, cost.category, cost.description, cost.quantity, cost.rate, ConstructFlow.round(cost.quantity * cost.rate)])];
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
          Object.entries(data).forEach(([key, value]) => {if (value) query[key] = value;});
          navigate(url(page + '.html', query));
          return;
        }
        case 'add-project': {
          const created = store.addProject(data);
          navigate(projectUrl(created.id, created.status === 'Tender' ? 'contract' : 'overview'));
          return;
        }
        case 'edit-project': store.editProject(pid, data); navigate(projectUrl(pid)); return;
        case 'boq': store.addBoq(pid, data); break;
        case 'award': store.award(pid, data.amount); break;
        case 'package': store.addPackage(pid, data); break;
        case 'drawing': store.addDrawing(pid, data); break;
        case 'site-log': store.addLog(pid, data); break;
        case 'rfi-response': store.respondRfi(pid, recordId, data.response); break;
        case 'change': store.addChange(pid, data); break;
        case 'material-request': store.requestMaterials(pid, data); break;
        case 'purchase-order': store.createOrder(pid, data); break;
        case 'cost': store.saveCost({...data, projectId: pid}, recordId); navigate(url('view_costs.html', {project: pid})); return;
        case 'punch': store.addPunch(pid, data.description); break;
        case 'sign-off': store.signOff(pid, data.representative); break;
        case 'user': store.saveUser(data, recordId); break;
        case 'option': store.addOption(data.kind, data.value); break;
        default: return;
      }
      render();
      notify('Record saved. Related project totals and lists have been updated.');
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
    const confirmations = {'void-cost': ['Void this expense? It remains in the activity history.', 'confirm-void'], 'lose-tender': ['Mark this tender unsuccessful?', 'confirm-lose'], 'cancel-order': ['Cancel this purchase order without receiving it?', 'confirm-cancel-order']};
    if (confirmations[action]) {confirmAction(...confirmations[action], recordId, pid); return;}
    try {
      switch (action) {
        case 'close-dialog': document.getElementById('confirmation').close(); return;
        case 'remove-boq': store.removeBoq(pid, recordId); break;
        case 'approve-drawing': store.approveDrawing(pid, recordId); break;
        case 'rfi': store.raiseRfi(pid, recordId); location.hash = 'changes'; break;
        case 'approve-change': store.decideChange(pid, recordId, 'Approved'); break;
        case 'reject-change': store.decideChange(pid, recordId, 'Rejected'); break;
        case 'cancel-request': store.cancelRequest(pid, recordId); break;
        case 'receive-order': store.receiveOrder(pid, recordId); break;
        case 'resolve-punch': store.resolvePunch(pid, recordId); break;
        case 'confirm-void': store.voidCost(recordId); break;
        case 'confirm-lose': store.loseTender(pid); break;
        case 'confirm-cancel-order': store.cancelOrder(pid, recordId); break;
        case 'export-costs': exportCosts(); return;
        case 'backup': download('constructflow-backup-' + today() + '.json', JSON.stringify(store.snapshot(), null, 2), 'application/json'); return;
        default: return;
      }
      document.getElementById('confirmation').close();
      render();
      notify('Record updated.');
    } catch (error) {
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
    if (target.dataset.document) {
      try {
        store.setDocument(target.dataset.project, target.dataset.document, target.checked);
        const key = target.dataset.document;
        render();
        document.querySelector(`[data-document="${key}"]`)?.focus();
        notify('Handover checklist updated.');
      } catch (error) {target.checked = !target.checked; notify(error.message, true);}
    }
    const siteForm = target.closest('[data-form="site-log"]');
    if (siteForm && target.name === 'packageId') {
      const project = store.project(siteForm.dataset.project);
      const drawings = project.drawings.filter(item => item.packageId === target.value && item.approved);
      siteForm.elements.drawingId.innerHTML = '<option value="">No drawing reference</option>' + drawings.map(drawing => `<option value="${escape(drawing.id)}">${escape(drawing.reference)} · Rev ${escape(drawing.revision)}</option>`).join('');
    }
  });

  document.addEventListener('input', event => {
    if (event.target.closest('[data-form="cost"]')) updateExpenseTotal();
  });
  window.addEventListener('hashchange', () => {if (store) render();});
  window.addEventListener('storage', event => {if (event.key === ConstructFlow.STORAGE_KEY) location.reload();});

  try {
    store = ConstructFlow.createStore(localStorage, role);
    shell();
    render();
  } catch (error) {
    shell();
    content.innerHTML = heading('Project records unavailable', 'Your records could not be loaded.') + card('Storage issue', '<p>' + escape(error.message) + '</p><p>Allow browser storage and reload this page. Existing records have not been overwritten.</p>');
  }
});
