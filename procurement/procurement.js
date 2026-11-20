/* Procurement module: material requests, purchase orders, and deliveries. */
(function () {
  'use strict';

  const {projectId, store, url, can, escape, money, day, today, badge, isOpen, projectUrl, link, button, input, select, form, table, card, stack, columns, heading, projectOf, projectFilter} = CF.ui;

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
        card('Request materials', form('material-request', requestFields, 'Save request', editable, project.id)),
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
      order.status === 'Received' && isOpen(project) && can('costs') ? link('Record bill', url('expense-form', {project: project.id, order: order.id})) : ''
    ]));
    return table(['Project / supplier', 'Material', 'Order value', 'Delivery', 'Status', ''], rows, 'No purchase orders yet.');
  }

  function procurementPage(records) {
    const selected = projectOf(records, projectId);
    const projects = selected ? [selected] : records.projects;
    return heading('Procurement', 'Material requests and purchase orders across projects.', selected ? link('Open project procurement', projectUrl(selected.id, 'procurement'), true) : '') +
      card('Purchase orders', projectFilter(records, projectId) + orderTable(projects)) +
      `<div class="section-gap">${card('Outstanding material requests', table(['Project', 'Material', 'Quantity', ''], projects.flatMap(project => project.requests.filter(request => request.status === 'Requested').map(request => [escape(project.name), escape(request.item), `${request.quantity} ${escape(request.unit)}`, link('Issue order', projectUrl(project.id, 'procurement'))]))))}</div>`;
  }

  CF.pages.procurement = records => procurementPage(records);
  CF.tabs.procurement = procurementTab;

  Object.assign(CF.forms, {
    'material-request': (data, pid) => {store.requestMaterials(pid, data);},
    'purchase-order': (data, pid) => {store.createOrder(pid, data);}
  });

  Object.assign(CF.actions, {
    'cancel-request': (pid, id) => {store.cancelRequest(pid, id);},
    'receive-order': (pid, id) => {store.receiveOrder(pid, id);},
    'confirm-cancel-order': (pid, id) => {store.cancelOrder(pid, id);}
  });
})();
