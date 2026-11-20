/* Dashboard: portfolio totals, quick actions, overdue buyers, and recent activity. */
(function () {
  'use strict';

  const {C, role, store, url, can, stageLabels, money, short, day, today, isOpen, link, form, table, card, columns, heading, metric, dashboardStat, actionTile, projectRows, activityRows, overdueRows, dueSoonRows} = CF.ui;

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
      can('project') ? actionTile('Start a project', 'Register land and a landowner', url('project-form'), 'folder', 'warning') : '',
      can('sales') ? actionTile('Book a flat', 'Choose a project and flat', url('sales'), 'building', 'primary') : '',
      can('sales') ? actionTile('Customers', 'Add or find a buyer', url('customers'), 'users', 'info') : '',
      can('receipts') ? actionTile('Receive payment', 'Issue a money receipt', url('collections'), 'cash', 'success') : '',
      can('site') ? actionTile('Site progress', 'Record the daily site log', url('projects'), 'helmet', 'warning') : '',
      can('costs') ? actionTile('Record expense', 'Materials, labour, and services', url('expense-form'), 'invoice', 'danger') : '',
      can('procurement') ? actionTile('Procurement', 'Requests, orders, deliveries', url('procurement'), 'truck', 'info') : '',
      can('decide') ? actionTile('Approvals', pendingDecisions + ' decisions waiting', url('approvals'), 'check', 'primary') : '',
      actionTile('Reports', 'Statements, collections, P&L', url('reports'), 'chart', 'success')
    ].filter(Boolean).slice(0, 6).join('\n');
    return heading(C.roleNames[role] + ' dashboard', 'Portfolio status · ' + day(today()), can('project') ? link('Start a project', url('project-form'), true) : '') +
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

  CF.pages.dashboard = records => dashboard(records);
})();
