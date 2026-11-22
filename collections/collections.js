/* Collections module: installments due, overdue buyers, and money receipts. */
(function () {
  'use strict';

  const {projectId, store, url, can, SALE_STAGES, escape, money, short, day, today, saleUrl, link, table, card, columns, heading, dashboardStat, customerOf, projectOf, activeSales, saleTitle, overdueRows, dueSoonRows, projectFilter} = CF.ui;

  function collectionsPage(records) {
    const projects = projectId ? records.projects.filter(project => project.id === projectId) : records.projects;
    const ids = new Set(projects.map(project => project.id));
    const finances = projects.map(project => store.finance(project));
    const add = key => finances.reduce((value, item) => value + item[key], 0);
    const receipts = records.receipts.filter(receipt => ids.has(receipt.projectId)).sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
    const month = today().slice(0, 7);
    const receiptRows = receipts.slice(0, 15).map(receipt => {
      const sale = records.sales.find(item => item.id === receipt.saleId);
      return [`<a href="${url('reports', {type: 'receipt', receipt: receipt.id})}">${escape(receipt.no)}</a>`, day(receipt.date), `<a href="${saleUrl(sale.id)}">${escape(customerOf(records, sale.customerId)?.name)}</a>`, escape(saleTitle(records, sale)), escape(receipt.method), money(receipt.amount)];
    });
    const payable = activeSales(records).filter(sale => ids.has(sale.projectId) && store.statement(sale.id).balance > 0 && SALE_STAGES.includes(projectOf(records, sale.projectId).status));
    const payForm = can('receipts') ? card('Receive payment', table(['Buyer', 'Flat', 'Balance', ''], payable.map(sale => [escape(customerOf(records, sale.customerId)?.name), escape(saleTitle(records, sale)), money(store.statement(sale.id).balance), link('Receive', saleUrl(sale.id), true)]), 'No balances outstanding.')) : '';
    return heading('Collections', 'Installments due, overdue buyers, and money receipts.', link('Collection report', url('reports', {type: 'collection', ...(projectId ? {project: projectId} : {})}))) +
      `<div class="dashboard-metrics">
        ${dashboardStat('Collected this month', short(receipts.filter(receipt => receipt.date.slice(0, 7) === month).reduce((value, receipt) => value + receipt.amount, 0)), 'cash', 'success')}
        ${dashboardStat('Due in 30 days', short(add('dueSoon')), 'calendar', 'info')}
        ${dashboardStat('Overdue', short(add('overdue')), 'alert', add('overdue') ? 'danger' : 'success')}
        ${dashboardStat('Total receivable', short(add('receivable')), 'invoice', 'primary')}
      </div>` +
      card('Filter', projectFilter(records, projectId)) +
      `<div class="section-gap">${columns(card('Overdue buyers', table(['Buyer', 'Flat', 'Overdue', 'Late by', ''], overdueRows(records, projects), 'No overdue installments.')), card('Due in the next 30 days', table(['Due', 'Buyer', 'Flat', 'Installment', 'Amount'], dueSoonRows(records, projects), 'Nothing falls due in the next 30 days.')))}</div>` +
      `<div class="section-gap">${columns(card('Recent money receipts', table(['MR no.', 'Date', 'Buyer', 'Flat', 'Method', 'Amount'], receiptRows, 'No receipts yet.')), payForm)}</div>`;
  }

  CF.pages.collections = records => collectionsPage(records);
})();
