/* Customers module: buyer list, profiles, and the read-only buyer view. */
(function () {
  'use strict';

  const {params, page, store, STOP, navigate, url, can, stageLabels, escape, money, short, day, sft, link, button, input, textarea, form, table, card, stack, columns, callout, heading, dashboardStat, customerOf, unitOf, activeSales, saleTitle, saleRows, scheduleTable, receiptTable} = CF.ui;

  function customersPage(records) {
    const customer = customerOf(records, params.get('customer'));
    const fields = existing => `<div class="form-row">${input('name', 'Full name', existing?.name, 'text', 'required')}${input('phone', 'Mobile', existing?.phone, 'tel', 'required placeholder="01XXXXXXXXX"')}</div>
      <div class="form-row">${input('nid', 'NID number', existing?.nid, 'text', 'required inputmode="numeric"')}${input('email', 'Email (optional)', existing?.email, 'email')}</div>` + textarea('address', 'Present address', existing?.address);
    if (customer) {
      const sales = records.sales.filter(sale => sale.customerId === customer.id);
      return heading(customer.name, `${customer.phone} · NID ${customer.nid}`, link('Buyer view', url('buyer', {customer: customer.id})) + link('All customers', url('customers'))) +
        columns(card('Purchases', table(['Sale', 'Flat', 'Buyer', 'Price', 'Paid', 'Balance', 'Status', ''], saleRows(records, sales), 'No purchases yet.')),
          card('Customer details', form('customer', fields(customer), 'Save customer', can('sales'), '', customer.id)));
    }
    const search = (params.get('q') || '').toLowerCase();
    const rows = records.customers.filter(item => `${item.name} ${item.phone} ${item.nid}`.toLowerCase().includes(search)).sort((a, b) => a.name.localeCompare(b.name)).map(item => {
      const sales = activeSales(records).filter(sale => sale.customerId === item.id);
      return [`<a href="${url('customers', {customer: item.id})}">${escape(item.name)}</a><small>${escape(item.address)}</small>`, escape(item.phone), sales.map(sale => escape(saleTitle(records, sale))).join('<br>') || '<span class="muted">No purchase</span>', link('Open', url('customers', {customer: item.id}))];
    });
    return heading('Customers', 'Flat buyers and prospects.') + columns(
      card('Customer list', `<form class="filters" data-form="filter">${input('q', 'Search name, mobile, or NID', params.get('q') || '', 'search')}<button class="button" type="submit">Search</button></form>` + table(['Name', 'Mobile', 'Flats', ''], rows, 'No customers found.')),
      card('Add customer', form('customer', fields(null), 'Add customer', can('sales'), ''))
    );
  }

  function buyerPage(records) {
    const customer = customerOf(records, params.get('customer'));
    if (!customer) {
      return heading('Buyer view', 'Preview what a buyer sees about their flat, payments, and construction progress.') +
        card('Choose a buyer', table(['Buyer', 'Flats', ''], records.customers.filter(item => activeSales(records).some(sale => sale.customerId === item.id)).map(item => [escape(item.name), escape(activeSales(records).filter(sale => sale.customerId === item.id).map(sale => saleTitle(records, sale)).join(', ')), link('Open buyer view', url('buyer', {customer: item.id}))])));
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

  CF.pages.customers = records => customersPage(records);
  CF.pages.buyer = records => buyerPage(records);

  CF.forms.customer = (data, pid, id) => {
    const customer = store.addCustomer(data, id);
    if (page === 'customers' && !id) {
      navigate(url('customers', {customer: customer.id}));
      return STOP;
    }
  };
})();
