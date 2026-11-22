/* Approvals module: every decision waiting for the Managing Director. */
(function () {
  'use strict';

  const {projectId, store, SITE_STAGES, escape, day, badge, isOpen, projectUrl, saleUrl, link, table, card, stack, columns, heading, customerOf, saleTitle, changeTable, readiness, projectFilter} = CF.ui;

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

  CF.pages.approvals = records => approvalsPage(records);
})();
