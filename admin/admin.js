/* Admin module: team, settings, activity log, and the current role's account page. */
(function () {
  'use strict';

  const {C, params, page, role, store, STOP, url, can, escape, money, today, link, button, input, select, form, table, card, stack, columns, heading, activityRows, unavailable, projectFilter, download} = CF.ui;

  function teamPage(records) {
    if (!can('team')) return unavailable('Only the Managing Director can manage the team.');
    const user = records.users.find(item => item.id === params.get('user'));
    const fields = input('name', 'Name', user?.name, 'text', 'required') + input('email', 'Email', user?.email, 'email') + select('role', 'Role', C.roles.map(key => [key, C.roleNames[key]]), user?.role);
    const rows = records.users.map(item => [escape(item.name), escape(item.email || '—'), escape(C.roleNames[item.role]), link('Edit', url('team', {user: item.id}))]);
    return heading('Team', 'Who does what in the company.') + columns(
      card('Team members', table(['Name', 'Email', 'Role', ''], rows)),
      card(user ? 'Edit team member' : 'Add team member', form('user', fields, 'Save member', true, '', user?.id || ''), 'Records responsibilities. They do not create sign-in accounts.')
    );
  }

  function settingsPage(records) {
    if (!can('team')) return unavailable('Only the Managing Director can change settings.');
    function options(kind, title, singular) {
      const list = '<ul>' + records.settings[kind].map(item => `<li>${escape(item)}</li>`).join('') + '</ul>';
      const fields = `<input type="hidden" name="kind" value="${kind}">` + input('value', 'New ' + singular, '', 'text', 'required');
      return card(title, list + form('option', fields, 'Add ' + singular, true, ''));
    }
    return heading('Settings', 'Expense categories and material units.') + stack(
      columns(options('categories', 'Expense categories', 'category'), options('units', 'Material units', 'unit')),
      card('Data backup', '<p>Records are saved in this browser on this device. Export a backup before clearing browser data.</p>' + button('Export backup', 'backup', '', true))
    );
  }

  function auditPage(records) {
    if (!can('team')) return unavailable('Only the Managing Director can view the activity log.');
    const only = params.get('project');
    let events = records.audit.filter(event => !only || event.projectId === only);
    if (params.get('filter') === 'projects') events = events.filter(event => event.action === 'Project updated');
    if (params.get('filter') === 'costs') events = events.filter(event => event.action === 'Expense updated');
    const historyLinks = link('All activity', url('activity')) + link('Project edits', url('activity', {filter: 'projects'})) + link('Expense edits', url('activity', {filter: 'costs'}));
    return heading('Activity log', 'Every recorded action, with the role that performed it.', historyLinks) +
      card('Recorded activity', projectFilter(records, only) + table(['Date', 'Activity', 'Project', 'Details', 'Role'], activityRows(events, records)));
  }

  function profilePage() {
    const duties = {
      admin: 'Creates projects, records JV agreements, decides permits, approves drawings and budget revisions, cancels sales, and hands over flats.',
      pm: 'Submits permits, plans milestones, records daily site logs, raises RFIs, manages procurement and defects.',
      sales: 'Adds customers, sets the price list, allocates landowner flats, books flats, and records sale agreements.',
      accounts: 'Issues money receipts and records expenses.',
      viewer: 'Read-only access to every page.'
    };
    return heading('Account', 'Current role: ' + C.roleNames[role]) + card('Role responsibilities', `<ul class="checklist">${C.roles.map(key => `<li${key === role ? ' class="done"' : ''}><strong>${escape(C.roleNames[key])}</strong> — ${escape(duties[key])}</li>`).join('')}</ul><p class="status-line">Records are stored on this device. Role views are not authenticated accounts.</p>` + link('Dashboard', url('dashboard')));
  }

  CF.pages.team = records => teamPage(records);
  CF.pages.settings = records => settingsPage(records);
  CF.pages.activity = records => auditPage(records);
  CF.pages.profile = () => profilePage();

  Object.assign(CF.forms, {
    user: (data, pid, id) => {store.saveUser(data, id);},
    option: data => {store.addOption(data.kind, data.value);}
  });

  CF.actions.backup = () => {
    download('constructflow-backup-' + today() + '.json', JSON.stringify(store.snapshot(), null, 2), 'application/json');
    return STOP;
  };
})();
