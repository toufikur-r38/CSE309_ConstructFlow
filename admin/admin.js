/* Admin module: team accounts and project assignments, settings, activity log, and the signed-in user's account page. */
(function () {
  'use strict';

  const {C, params, user, store, STOP, url, can, api, escape, today, link, button, input, select, form, table, card, stack, columns, heading, badge, callout, activityRows, unavailable, projectFilter, download} = CF.ui;

  // Accounts come from the server (GET /api/users), not from the local records. null means not loaded yet.
  let team = null;
  let teamError = '';
  let loading = false;

  // loadTeam(): fetches the account list; a failure is shown on the page instead of the table.
  async function loadTeam() {
    try {
      team = (await api('GET', '/api/users')).users;
      teamError = '';
    } catch (error) {
      teamError = error.message;
    }
  }

  // projectNames(): the projects an account works on, as text for the table.
  function projectNames(records, account) {
    if (!C.scopedRoles.includes(account.role)) return 'All projects';
    const names = account.projects.map(id => records.projects.find(project => project.id === id)?.name || id);
    return names.length ? names.join(', ') : 'None yet';
  }

  // accountForm(): the Administrator's form to create an account, or to edit the chosen one.
  function accountForm(account) {
    const roleOptions = C.roles.map(key => [key, C.roleNames[key]]);
    if (!account) {
      const fields = input('name', 'Full name', '', 'text', 'required maxlength="100"') +
        input('email', 'Email (used to sign in)', '', 'email', 'required maxlength="254" autocomplete="off"') +
        select('role', 'Role', roleOptions, 'viewer') +
        input('password', 'Temporary password', '', 'password', 'required minlength="8" maxlength="72" autocomplete="new-password"');
      return card('Create an account', form('new-user', fields, 'Create account', true, ''), 'Give the person their email and temporary password. Accounts cannot be created any other way.');
    }
    const fields = input('name', 'Full name', account.name, 'text', 'required maxlength="100"') +
      select('role', 'Role', roleOptions, account.role) +
      select('active', 'Status', [['true', 'Active: can sign in'], ['false', 'Deactivated: cannot sign in']], String(account.active));
    const passwordFields = input('password', 'New password', '', 'password', 'required minlength="8" maxlength="72" autocomplete="new-password"');
    return card('Edit ' + account.name, form('edit-user', fields, 'Save account', true, '', account.id) + '<h3>Reset password</h3>' + form('password', passwordFields, 'Set new password', true, '', account.id), account.email);
  }

  // assignForm(): tick the projects this staff member works on. Only for roles limited to their projects.
  function assignForm(records, account) {
    if (!C.scopedRoles.includes(account.role)) return card('Projects', '<p>The ' + escape(C.roleNames[account.role]) + ' sees every project, so there is nothing to assign.</p>');
    const boxes = records.projects.map(project => `<label><input type="checkbox" name="project_${escape(project.id)}"${account.projects.includes(project.id) ? ' checked' : ''}> ${escape(project.name)}</label>`).join('');
    return card('Projects for ' + account.name, form('assign', `<div class="unit-checks">${boxes || '<p class="empty">No projects yet.</p>'}</div>`, 'Save projects', true, '', account.id), 'They see only the ticked projects, with their sales, payments and expenses.');
  }

  function teamPage(records) {
    if (!can('accounts') && !can('assign')) return unavailable('Only the Administrator and the Managing Director manage the team.');
    const intro = can('accounts') ? 'Sign-in accounts, roles and project assignments.' : 'Choose which projects each staff member works on.';
    if (teamError) return heading('Team', intro) + card('Accounts unavailable', '<p>' + escape(teamError) + '</p>' + link('Try again', url('team')));
    if (!team) return heading('Team', intro) + '<p class="status-line">Loading accounts…</p>';

    const account = team.find(item => item.id === params.get('user'));
    const rows = team.map(item => [
      escape(item.name) + (item.id === user.id ? ' <small>(you)</small>' : ''), escape(item.email), escape(C.roleNames[item.role] || item.role),
      badge(item.active ? 'Active' : 'Deactivated'), escape(projectNames(records, item)),
      link(can('accounts') ? 'Edit' : 'Assign', url('team', {user: item.id}))
    ]);
    const side = account
      ? stack(can('accounts') ? accountForm(account) : '', assignForm(records, account), link('Back to the list', url('team')))
      : can('accounts') ? accountForm(null) : card('Assign projects', callout('Choose a person', 'Press Assign next to a staff member to choose their projects.'));
    return heading('Team', intro) + columns(card('Accounts', table(['Name', 'Email', 'Role', 'Status', 'Projects', ''], rows, 'No accounts yet.')), side);
  }

  function settingsPage(records) {
    if (!can('settings')) return unavailable('Only the Administrator can change settings.');
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
    if (!can('activity')) return unavailable('Only the Administrator and the Managing Director can view the activity log.');
    const only = params.get('project');
    let events = records.audit.filter(event => !only || event.projectId === only);
    if (params.get('filter') === 'projects') events = events.filter(event => event.action === 'Project updated');
    if (params.get('filter') === 'costs') events = events.filter(event => event.action === 'Expense updated');
    const historyLinks = link('All activity', url('activity')) + link('Project edits', url('activity', {filter: 'projects'})) + link('Expense edits', url('activity', {filter: 'costs'}));
    return heading('Activity log', 'Every recorded action, with the person who performed it.', historyLinks) +
      card('Recorded activity', projectFilter(records, only) + table(['Date', 'Activity', 'Project', 'Details', 'By'], activityRows(events, records)));
  }

  function profilePage(records) {
    const duties = {
      administrator: 'Creates and deactivates sign-in accounts, sets roles, assigns staff to projects, and manages settings. Does no project or sales work.',
      md: 'Creates projects, records JV agreements, decides permits, approves drawings and budget revisions, cancels sales, hands over flats, and assigns staff to projects.',
      pm: 'Submits permits, plans milestones, records daily site logs, raises RFIs, manages procurement and defects.',
      sales: 'Adds customers, sets the price list, allocates landowner flats, books flats, and records sale agreements.',
      accounts: 'Issues money receipts and records expenses.',
      viewer: 'Read-only access to the assigned projects.'
    };
    const details = `<dl class="totals"><dt>Name</dt><dd>${escape(user.name)}</dd><dt>Email</dt><dd>${escape(user.email)}</dd><dt>Role</dt><dd>${escape(C.roleNames[user.role])}</dd><dt>Projects</dt><dd>${escape(projectNames(records, user))}</dd></dl>`;
    const roleList = `<ul class="checklist">${C.roles.map(key => `<li${key === user.role ? ' class="done"' : ''}><strong>${escape(C.roleNames[key])}</strong> — ${escape(duties[key])}</li>`).join('')}</ul>`;
    return heading('Account', 'Signed in as ' + user.name) + columns(
      card('Your account', details + '<p class="status-line">To change your name, role, password or projects, ask the Administrator.</p><div class="actions"><button class="button secondary" type="button" data-action="sign-out">Sign out</button></div>'),
      card('What each role does', roleList)
    );
  }

  CF.pages.team = records => teamPage(records);
  CF.pages.settings = records => settingsPage(records);
  CF.pages.activity = records => auditPage(records);
  CF.pages.profile = records => profilePage(records);

  // The team list loads after the first draw, then the page draws again with it.
  CF.afterRender.team = () => {
    if (team || teamError || loading || (!can('accounts') && !can('assign'))) return;
    loading = true;
    loadTeam().finally(() => {
      loading = false;
      CF.render();
    });
  };

  Object.assign(CF.forms, {
    // Creates the account at Supabase with its profile; the person can sign in straight away.
    'new-user': async data => {
      await api('POST', '/api/users', {name: data.name, email: data.email, role: data.role, password: data.password});
      await loadTeam();
      return `Account created for ${data.name}. They can sign in now with the temporary password.`;
    },
    // Saves name, role and status. Deactivating signs the person out on their next request.
    'edit-user': async (data, pid, id) => {
      await api('PATCH', '/api/users/' + encodeURIComponent(id), {name: data.name, role: data.role, active: data.active === 'true'});
      await loadTeam();
      return 'Account saved.';
    },
    // Sets a new password chosen by the Administrator.
    password: async (data, pid, id) => {
      await api('POST', '/api/users/' + encodeURIComponent(id) + '/password', {password: data.password});
      return 'Password changed. Give the person the new password.';
    },
    // Replaces the person's projects with the ticked ones.
    assign: async (data, pid, id) => {
      const projects = Object.keys(data).filter(key => key.startsWith('project_')).map(key => key.slice('project_'.length));
      await api('PUT', '/api/users/' + encodeURIComponent(id) + '/projects', {projects});
      await loadTeam();
      return 'Projects saved.';
    },
    option: data => {store.addOption(data.kind, data.value);}
  });

  CF.actions.backup = () => {
    download('constructflow-backup-' + today() + '.json', JSON.stringify(store.snapshot(), null, 2), 'application/json');
    return STOP;
  };
})();
