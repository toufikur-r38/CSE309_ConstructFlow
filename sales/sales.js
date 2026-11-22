/* Sales module: booking a flat, the sales register, and each sale's schedule, receipts, agreement, and cancellation. */
(function () {
  'use strict';

  const {C, params, projectId, store, STOP, navigate, url, can, SALE_STAGES, escape, money, day, today, sft, badge, projectUrl, saleUrl, link, button, input, textarea, select, form, table, card, stack, columns, definitionList, callout, heading, customerOf, unitOf, saleTitle, unavailable, saleRows, scheduleTable, receiptTable} = CF.ui;

  function bookingForm(project, records) {
    if (!can('sales')) return '';
    const ready = project.permits.some(item => item.type === 'Building plan approval' && item.status === 'Approved');
    if (!SALE_STAGES.includes(project.status)) return callout('Sales not open', project.status === 'Land' ? 'Sales open after the JV agreement and building plan approval.' : 'This project is closed.');
    if (!ready) return callout('Sales blocked', `Flats can be sold only after the ${project.authority} building plan approval is recorded under Permits.`);
    if (!project.pricing.ratePerSft) return callout('Price list missing', 'Set the rate per sft under Flats before booking.');
    const available = project.units.filter(unit => unit.owner === 'Developer' && unit.status === 'Available');
    if (!available.length) return '<p class="empty">All developer flats are sold or booked.</p>';
    const fields = select('unitId', 'Flat', available.map(unit => [unit.id, `${unit.label} · ${sft(unit.sizeSft)} · ${money(store.unitPrice(project, unit, 1))}`]), params.get('unit') || '') +
      select('customerId', 'Buyer', records.customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map(customer => [customer.id, `${customer.name} · ${customer.phone}`])) +
      `<p class="status-line">New buyer? <a href="${url('customers')}">Add the customer first</a>.</p>
      <div class="form-row three">${input('date', 'Booking date', today(), 'date', 'required')}${input('rate', 'Rate per sft (BDT)', project.pricing.ratePerSft, 'number', 'min="1" step="1" required')}${select('parking', 'Car parking', [['1', '1 slot'], ['0', 'None'], ['2', '2 slots']])}</div>
      <div class="form-row three">${input('bookingMoney', 'Booking money (BDT)', 500000, 'number', 'min="1" step="1" required')}${input('downPayment', 'Down payment (BDT)', 3000000, 'number', 'min="0" step="1"')}${input('discount', 'Discount (BDT)', 0, 'number', 'min="0" step="1"')}</div>
      <div class="form-row three">${select('planType', 'Payment plan', [['monthly', 'Monthly installments'], ['milestone', 'Construction-linked (per milestone)']])}${input('installments', 'Number of installments', 24, 'number', 'min="1" max="120" step="1"')}${input('firstDue', 'First installment due', C.addDays(today(), 30), 'date')}</div>
      <p class="status-line">Price = size × rate + parking + utility charge (${money(project.pricing.utilityCharge)}) − discount. Construction-linked installments fall due ${C.MILESTONE_GRACE_DAYS} days after each remaining milestone is completed.</p>`;
    return form('booking', fields, 'Book flat', can('sales'), project.id);
  }

  function salesTab(project, records) {
    const sales = records.sales.filter(sale => sale.projectId === project.id);
    return stack(
      card('Book a flat', bookingForm(project, records)),
      card('Sales register', table(['Sale', 'Flat', 'Buyer', 'Price', 'Paid', 'Balance', 'Status', ''], saleRows(records, sales), 'No flats sold yet.'))
    );
  }

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
    if (open && statement.balance > 0) actions.push(card('Receive payment', form('receipt', receiptFields, 'Issue money receipt', can('receipts'), project.id, sale.id), 'The payment is applied to the oldest unpaid installment first.'));
    if (open && sale.status === 'Booked') actions.push(card('Sale agreement', form('agreement', input('date', 'Agreement date', today(), 'date', 'required'), 'Record signed agreement', can('sales') && statement.upfrontPaid, project.id, sale.id) + `<p class="status-line">${statement.upfrontPaid ? 'Booking money and down payment are received.' : 'Collect the booking money and down payment before signing.'}</p>`));
    if (open && unit?.status !== 'Handed over') actions.push(card('Cancel booking', form('cancel-sale', `<div class="form-row">${input('deductionPct', 'Deduction (%)', 10, 'number', 'min="0" max="100" step="0.5" required')}${input('date', 'Date', today(), 'date', 'required')}</div>` + textarea('reason', 'Reason'), 'Cancel and refund', can('decide'), project.id, sale.id), `Refund = paid amount minus the deduction. The flat returns to stock. Paid so far: ${money(statement.paid)}.`));
    return heading('Sale ' + sale.no, saleTitle(records, sale), link('Statement', url('reports', {type: 'statement', sale: sale.id})) + link('Buyer view', url('buyer', {customer: sale.customerId})) + link('Project sales', projectUrl(project.id, 'sales'))) +
      `<p>${badge(sale.status)} ${statement.overdue ? badge('Overdue') : ''}</p>` +
      columns(stack(card('Payment schedule', scheduleTable(statement)), card('Money receipts', receiptTable(statement))), stack(card('Sale details', facts), ...actions));
  }

  CF.pages.sales = records => salesPage(records);
  CF.tabs.sales = salesTab;

  Object.assign(CF.forms, {
    booking: (data, pid) => {
      navigate(saleUrl(store.bookUnit(pid, data).id));
      return STOP;
    },
    receipt: (data, pid, id) => {
      const receipt = store.addReceipt({...data, saleId: id});
      return `Money receipt ${receipt.no} issued for ${money(receipt.amount)}.`;
    },
    agreement: (data, pid, id) => {store.signAgreement(pid, id, data);},
    'cancel-sale': (data, pid, id) => {store.cancelSale(pid, id, data);}
  });
})();
