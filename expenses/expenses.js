/* Expenses module: the expenditure ledger, voided expenses, and the expense form. */
(function () {
  'use strict';

  const {C, params, projectId, store, STOP, navigate, url, can, escape, money, day, today, isOpen, projectUrl, link, button, input, select, form, table, card, callout, heading, projectOf, unavailable, download} = CF.ui;

  function expensePage(records, voidedOnly = false) {
    const category = params.get('category') || '';
    const start = params.get('start') || '';
    const end = params.get('end') || '';
    const costs = records.costs.filter(cost => Boolean(cost.voidedAt) === voidedOnly && (!projectId || cost.projectId === projectId) && (!category || cost.category === category) && (!start || cost.date >= start) && (!end || cost.date <= end));
    const filters = `<form class="filters" data-form="filter">${select('project', 'Project', records.projects.map(project => [project.id, project.name]), projectId, 'All projects')}${select('category', 'Category', records.settings.categories, category, 'All categories')}${input('start', 'From', start, 'date')}${input('end', 'To', end, 'date')}<button class="button" type="submit">Apply</button></form>`;
    const rows = costs.slice().sort((a, b) => b.date.localeCompare(a.date)).map(cost => {
      const project = projectOf(records, cost.projectId);
      return [day(cost.date), `<a href="${projectUrl(cost.projectId, 'costs')}">${escape(project?.name)}</a>`, `${escape(cost.description)}<small>${escape(cost.category)}</small>`, cost.quantity, money(cost.rate), money(cost.quantity * cost.rate),
        !voidedOnly && can('costs') && isOpen(project) ? `<div class="inline-actions">${link('Edit', url('expense-form', {project: cost.projectId, cost: cost.id}))}${button('Void', 'void-cost', cost.id, can('decide'), cost.projectId)}</div>` : (cost.voidedAt ? 'Voided ' + day(cost.voidedAt) : '')];
    });
    const actions = (voidedOnly ? link('Active expenses', url('expenses', projectId ? {project: projectId} : {})) :
      (can('costs') ? link('Record expense', url('expense-form', projectId ? {project: projectId} : {}), true) : '')) +
      (!voidedOnly && can('decide') ? link('Voided expenses', url('expenses', {voided: '1', ...(projectId ? {project: projectId} : {})})) : '');
    return heading(voidedOnly ? 'Voided expenses' : 'Expenses', 'Supplier bills, labour, and services charged to each project.', actions) +
      card('Expenditure ledger', filters + table(['Date', 'Project', 'Description', 'Qty', 'Rate', 'Total', ''], rows, 'No expenses match these filters.') + `<p class="total-line">Total: <strong>${money(ConstructFlow.total(costs))}</strong></p><div class="actions">${button('Export CSV', 'export-costs', '', true)}</div>`);
  }

  function costProjectPicker(records) {
    const open = records.projects.filter(isOpen);
    return heading('Record expense', 'Choose the project this expense belongs to.') +
      card('Open projects', table(['Project', 'Spent / budget', ''], open.map(project => {
        const summary = store.summary(project);
        return [escape(project.name), `${money(summary.spending)} / ${money(summary.budget)}`, link('Select project', url('expense-form', {project: project.id}), true)];
      }), 'No open projects.'));
  }

  function costForm(records) {
    if (!can('costs')) return unavailable('Only Accounts or the Managing Director can record expenses.');
    const existing = records.costs.find(cost => cost.id === params.get('cost'));
    if (params.get('cost') && !existing) return unavailable('The requested expense could not be found.');
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
    return heading(existing ? 'Edit expense' : 'Record expense', project.name, link('Back to ledger', url('expenses', {project: project.id}))) + card('Expense details', form('cost', fields, 'Save expense', true, project.id, existing?.id || ''));
  }

  function updateExpenseTotal() {
    const costForm = document.querySelector('[data-form="cost"]');
    if (!costForm) return;
    const quantity = Number(costForm.elements.quantity.value);
    const rate = Number(costForm.elements.rate.value);
    document.getElementById('expense-total').textContent = 'Total expense: ' + money(C.round(quantity * rate));
  }

  function exportCosts() {
    const records = store.snapshot();
    const voidedOnly = params.get('voided') === '1';
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

  CF.pages.expenses = records => expensePage(records, params.get('voided') === '1');
  CF.pages['expense-form'] = records => costForm(records);
  CF.afterRender['expense-form'] = updateExpenseTotal;

  CF.forms.cost = (data, pid, id) => {
    store.saveCost({...data, projectId: pid}, id);
    navigate(url('expenses', {project: pid}));
    return STOP;
  };

  Object.assign(CF.actions, {
    'confirm-void': (pid, id) => {store.voidCost(id);},
    'export-costs': () => {
      exportCosts();
      return STOP;
    }
  });
})();
