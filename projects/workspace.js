/* Project workspace: stage overview, land & JV, permits, flats, construction, budget, and handover tabs. */
(function () {
  'use strict';

  const {C, params, page, user, projectId, store, assetUrl, url, can, tabs, tabLabels, stageLabels, SALE_STAGES, SITE_STAGES, extraPermits, escape, money, short, day, today, sft, badge, disabled, isOpen, projectUrl, saleUrl, link, button, input, textarea, select, form, table, card, stack, columns, definitionList, callout, heading, metric, customerOf, unitOf, projectOf, saleForUnit, soldCount, stepper, unavailable, milestoneTable, changeTable, readiness} = CF.ui;

  function workspace(project, records) {
    if (!project) return CF.pages.projects(records, 'Select a project');
    const summary = store.summary(project);
    const finance = store.finance(project);
    const requested = location.hash.slice(1);
    const tab = tabs.includes(requested) ? requested : 'overview';
    const actions = link('Reports', url('reports', {project: project.id})) +
      (can('project') && isOpen(project) ? link('Edit details', url('project-form', {project: project.id})) : '');
    const header = heading(project.name, `${project.location} · ${project.authority}`, actions) +
      `<section class="project-header"><div class="project-heading"><div>${badge(project.status)} <span class="muted">${day(project.start)} – ${day(project.end)}</span> <span class="muted">· Signed in as ${escape(C.roleNames[user.role])}: actions for other roles are hidden.</span></div><a href="${url('projects')}">All projects</a></div>
      ${stepper(project)}
      <div class="summary-grid">${metric('Construction', summary.progress + '%')}${metric('Flats sold', `${soldCount(project)} / ${summary.developerUnits}`)}${metric('Collected', short(finance.collected))}${metric('Spent / budget', `${short(summary.spending)} / ${short(summary.budget)}`)}</div></section>
      <nav class="tabs" aria-label="Project sections">${tabs.map(key => `<a href="${projectUrl(project.id, key)}"${tab === key ? ' aria-current="page"' : ''}>${tabLabels[key]}</a>`).join('')}</nav>`;
    const views = {overview: overviewTab, land: landTab, permits: permitsTab, units: unitsTab, construction: constructionTab, costs: costsTab, handover: handoverTab, ...CF.tabs};
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
      card('Joint-venture agreement', project.status === 'Land' ? form('jv', jvFields, 'Save agreement', editable, project.id) : '<p class="status-line">The agreement is locked after the Land stage.</p>',
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
        card('Submit application', project.status === 'Approval' ? form('permit', fields, 'Record submission', editable, project.id) : `<p class="status-line">${project.status === 'Land' ? 'Applications open after the JV agreement.' : 'The approvals stage is complete.'}</p>`)
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
      return card('Define the building', project.status === 'Approval' ? form('building', fields, 'Generate flats', can('units'), project.id) : '<p class="empty">The building is defined at the Approvals stage, after the JV agreement.</p>',
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
      columns(card('Flats by floor', unitGrid(project, records, selected?.id)), stack(card(selected ? 'Flat ' + selected.label : 'Flat details', detail), card('Price list', definitionList([['Rate per sft', money(pricing.ratePerSft)], ['Car parking', money(pricing.parkingPrice)], ['Utility & connection', money(pricing.utilityCharge)]]) + form('pricing', pricingFields, 'Save price list', SALE_STAGES.includes(project.status), project.id)))),
      card('Landowner share', allocation)
    );
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
      (drawing.url ? `<a href="${escape(assetUrl(drawing.url))}" target="_blank" rel="noopener noreferrer">Open</a> ` : '') +
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
        card('Daily site log', project.status === 'Construction' ? form('site-log', logFields, 'Save site log', onSite && project.packages.length > 0, project.id) : `<p class="status-line">Site logs are recorded during the Construction stage.</p>`),
        stack(card('Recent site records', logs || '<p class="empty">No site activity recorded.</p>'), card('Requests for information', rfis || '<p class="empty">No RFIs. Raise one from a site log blocker.</p>'))
      ),
      columns(
        card('Plan milestone', form('package', packageFields, 'Add milestone', planning, project.id), 'Milestones drive construction progress and construction-linked installments.'),
        card('Register drawing', form('drawing', drawingFields, 'Register revision', planning && project.packages.length > 0, project.id), 'Approving a revision supersedes the previous approved revision.')
      ),
      card('Drawing register', table(['Drawing', 'Rev', 'Milestone', 'Status', ''], drawingRows))
    );
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
      <div class="actions">${link('Expense ledger', url('expenses', {project: project.id}))}${can('costs') && isOpen(project) ? link('Record expense', url('expense-form', {project: project.id}), true) : ''}</div>`;
    return stack(
      columns(card('Construction budget', budget), card('Submit budget revision', form('change', fields, 'Submit for approval', editable, project.id))),
      card('Budget revisions', changeTable([project]))
    );
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
          project.status === 'Handover' ? card('Hand over a flat', ready.length ? form('handover-unit', handoverFields, 'Record handover', decide, project.id) : '<p class="empty">No flats are ready. Clear the blockers in the register.</p>') : ''),
        stack(card('Occupancy certificate', occupancy), card('Defects (punch list)', punch), card("Owners' association", association))
      )
    );
  }

  CF.pages.project = records => {
    const project = projectOf(records, projectId);
    return projectId && !project ? unavailable('The requested project was not found.') : workspace(project, records);
  };

  Object.assign(CF.forms, {
    landowner: (data, pid) => {store.addLandowner(pid, data);},
    jv: (data, pid) => {store.recordJv(pid, data);},
    permit: (data, pid) => {store.addPermit(pid, data);},
    'permit-decision': (data, pid, id) => {store.decidePermit(pid, id, data);},
    building: (data, pid) => {
      store.defineBuilding(pid, {...data, types: [0, 1, 2].map(index => ({code: data['code' + index], sizeSft: data['size' + index], beds: data['beds' + index]}))});
    },
    allocate: (data, pid) => {store.allocateLandowner(pid, Object.keys(data).filter(key => key.startsWith('unit_')).map(key => key.slice(5)));},
    pricing: (data, pid) => {store.setPricing(pid, data);},
    package: (data, pid) => {store.addPackage(pid, data);},
    drawing: (data, pid) => {store.addDrawing(pid, data);},
    'site-log': (data, pid) => {store.addLog(pid, data);},
    'rfi-response': (data, pid, id) => {store.respondRfi(pid, id, data.response);},
    change: (data, pid) => {store.addChange(pid, data);},
    punch: (data, pid) => {store.addPunch(pid, data);},
    occupancy: (data, pid) => {store.recordOccupancy(pid, data);},
    'handover-unit': (data, pid) => {store.handoverUnit(pid, data.unitId, data);},
    association: (data, pid) => {store.formAssociation(pid, data);}
  });

  Object.assign(CF.actions, {
    'confirm-advance': pid => {store.advance(pid);},
    'approve-drawing': (pid, id) => {store.approveDrawing(pid, id);},
    rfi: (pid, id) => {store.raiseRfi(pid, id);},
    'approve-change': (pid, id) => {store.decideChange(pid, id, 'Approved');},
    'reject-change': (pid, id) => {store.decideChange(pid, id, 'Rejected');},
    'resolve-punch': (pid, id) => {store.resolvePunch(pid, id);}
  });
})();
