/* Reports module: printable statements, receipts, inventory, collections, and project P&L. */
(function () {
  'use strict';

  const {params, root, projectId, store, url, escape, money, day, today, sft, badge, saleUrl, link, button, input, select, form, table, card, stack, definitionList, heading, customerOf, projectOf, saleForUnit, saleTitle, unavailable, scheduleTable, receiptTable} = CF.ui;

  function reportsPage(records) {
    const type = params.get('type') || '';
    const printButton = `<button type="button" class="button" data-action="print">Print / save PDF</button>`;
    const letterhead = title => `<div class="letterhead"><img src="${root}assets/constructflow-logo.png" alt="ConstructFlow" width="136" height="36"><div><strong>ConstructFlow Properties Ltd.</strong><span>${escape(title)} · Printed ${day(today())}</span></div></div>`;
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
      `<div class="inline-actions">${link('Flat inventory', url('reports', {type: 'inventory', project: item.id}))}${link('Project P&L', url('reports', {type: 'pnl', project: item.id}))}${link('Collections', url('reports', {type: 'collection', project: item.id}))}</div>`]);
    return heading('Reports', 'Printable statements for management, buyers, and the bank.') + stack(
      card('Project reports', table(['Project', 'Stage', ''], rows)),
      card('Buyer documents', '<p>Open a sale to print its statement of account, or a money receipt from the collections list.</p>' + `<div class="actions">${link('Sales register', url('sales'))}${link('Collections', url('collections'))}</div>`)
    );
  }

  CF.pages.reports = records => reportsPage(records);
})();
