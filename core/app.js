/* Application shell: header, page rendering, and the shared form/button listeners.
   Each module registers its own pages, tabs, form handlers, and actions on CF. */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const {C, page, user, root, store, STOP, url, notify, navigate, escape, icon, params, api} = CF.ui;
  // Pages each role sees in the menu. This only hides links; the server enforces access.
  const navAllowed = {
    administrator: ['dashboard', 'team', 'activity', 'settings'],
    md: ['dashboard', 'projects', 'sales', 'collections', 'customers', 'approvals', 'reports', 'procurement', 'expenses', 'buyer', 'team', 'activity'],
    pm: ['dashboard', 'projects', 'procurement', 'reports'],
    sales: ['dashboard', 'projects', 'sales', 'collections', 'customers', 'reports', 'buyer'],
    accounts: ['dashboard', 'projects', 'collections', 'expenses', 'procurement', 'reports'],
    viewer: ['dashboard', 'projects', 'sales', 'collections', 'customers', 'approvals', 'reports', 'procurement', 'expenses', 'buyer']
  };
  // Actions that ask "Are you sure?" first: [question, action to run after confirming].
  const confirmations = {
    'void-cost': ['Void this expense? It remains in the activity history.', 'confirm-void'],
    'cancel-order': ['Cancel this purchase order without receiving it?', 'confirm-cancel-order'],
    advance: ['Move this project to the next stage? Records from the current stage will be locked.', 'confirm-advance']
  };
  const content = document.getElementById('content');
  // Light or dark theme, remembered on this device.
  let theme = 'light';
  try { theme = localStorage.getItem('constructflow.theme') === 'dark' ? 'dark' : 'light'; } catch (_) { /* Use the light theme when preferences are unavailable. */ }
  document.documentElement.dataset.theme = theme;

  // shell(): draws the header: logo, menu links for this role, theme switch, and account badge.
  function shell() {
    const visible = key => (navAllowed[user.role] || []).includes(key);
    const navigation = [['dashboard', 'Dashboard'], ['projects', 'Projects'], ['sales', 'Sales'], ['collections', 'Collections'],
      ['customers', 'Customers'], ['approvals', 'Approvals'], ['reports', 'Reports']].filter(([key]) => visible(key));
    const more = [['procurement', 'Procurement'], ['expenses', 'Expenses'], ['buyer', 'Buyer view'],
      ['team', 'Team'], ['activity', 'Activity log'], ['settings', 'Settings']].filter(([key]) => visible(key));
    const current = key => key === page || (key === 'projects' && ['project', 'project-form'].includes(page)) || (key === 'expenses' && page === 'expense-form');
    document.getElementById('header').innerHTML = `
      <a class="brand" href="${url('dashboard')}"><img src="${root}assets/constructflow-logo.png" alt="ConstructFlow — Project Management" width="181" height="48"></a>
      <nav aria-label="Main navigation">${navigation.map(([key, label]) => `<a href="${url(key)}"${current(key) ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
      ${more.length ? `<details><summary>More</summary><div>${more.map(([key, label]) => `<a href="${url(key)}"${current(key) ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</div></details>` : ''}</nav>
      <div class="account">
        <button class="theme-toggle" type="button" data-action="toggle-theme" aria-label="Switch to ${theme === 'light' ? 'dark' : 'light'} mode">${icon(theme === 'light' ? 'moon' : 'sun')}</button>
        <a class="user-badge" href="${url('profile')}" title="Your account"><span class="user-avatar">${icon('user')}</span><span class="user-name">${escape(user.name)}<small>${escape(C.roleNames[user.role])}</small></span></a>
        <button class="sign-out" type="button" data-action="sign-out">Sign out</button>
      </div>`;
  }

  // The Administrator runs the system only: these pages, never project or sales records.
  const ADMINISTRATOR_PAGES = ['dashboard', 'team', 'settings', 'activity', 'profile'];

  // render(): draws the current page from the records, then runs that page's after-render hook.
  function render() {
    if (user.role === 'administrator' && !ADMINISTRATOR_PAGES.includes(page)) {
      content.innerHTML = CF.ui.unavailable('The Administrator account manages accounts, roles and settings only. Business records are for staff accounts.');
      return;
    }
    content.innerHTML = (CF.pages[page] || CF.pages.dashboard)(store.snapshot());
    CF.afterRender[page]?.();
  }
  // Modules that load data from the server after the first draw call this to draw again.
  CF.render = render;

  /* Handlers return nothing (show the default message), a message string, or STOP when they navigated away.
     A handler that talks to the server returns a promise; the page re-renders once it has finished. */
  function run(handler, args, fallback) {
    const finish = result => {
      if (result === STOP) return;
      render();
      notify(typeof result === 'string' ? result : fallback);
    };
    const result = handler(...args);
    if (result && typeof result.then === 'function') return result.then(finish).catch(error => notify(error.message, true));
    finish(result);
  }

  // Every form submit: filter forms change the address; other forms go to their CF.forms handler.
  document.addEventListener('submit', event => {
    const target = event.target.closest('form[data-form]');
    if (!target) return;
    event.preventDefault();
    if (!target.reportValidity()) return;
    const data = Object.fromEntries(new FormData(target));
    if (target.dataset.form === 'filter') {
      const query = {};
      for (const key of ['project', 'sale', 'customer', 'voided', 'filter']) if (params.get(key) && !(key in data)) query[key] = params.get(key);
      Object.entries(data).forEach(([key, value]) => {if (value) query[key] = value;});
      navigate(url(page, query));
      return;
    }
    const handler = CF.forms[target.dataset.form];
    if (!handler) return;
    try {
      run(handler, [data, target.dataset.project, target.dataset.id], 'Record saved. Related totals and lists have been updated.');
    } catch (error) {
      notify(error.message, true);
    }
  });

  // confirmAction(): opens the confirmation dialog and remembers which action to run on Confirm.
  function confirmAction(title, action, recordId, pid) {
    document.getElementById('confirmation-title').textContent = title;
    Object.assign(document.getElementById('confirmation-action').dataset, {action, id: recordId, project: pid});
    document.getElementById('confirmation').showModal();
  }

  // Every button click with data-action: theme, print, dialogs, confirmations, or a CF.actions handler.
  document.addEventListener('click', event => {
    const target = event.target.closest('button[data-action]');
    if (!target || target.disabled) return;
    const {action, id: recordId, project: pid} = target.dataset;
    if (action === 'toggle-theme') {
      theme = theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = theme;
      try { localStorage.setItem('constructflow.theme', theme); } catch (_) { /* The theme still applies for this page. */ }
      target.innerHTML = icon(theme === 'light' ? 'moon' : 'sun');
      target.setAttribute('aria-label', 'Switch to ' + (theme === 'light' ? 'dark' : 'light') + ' mode');
      return;
    }
    if (action === 'print') {window.print(); return;}
    if (action === 'sign-out') {
      api('POST', '/api/auth/logout').then(() => location.replace(root + 'auth/login.html'), error => notify(error.message, true));
      return;
    }
    if (action === 'close-dialog') {document.getElementById('confirmation').close(); return;}
    if (confirmations[action]) {confirmAction(...confirmations[action], recordId, pid); return;}
    const handler = CF.actions[action];
    if (!handler) return;
    try {
      document.getElementById('confirmation').close();
      run(handler, [pid, recordId], 'Record updated.');
    } catch (error) {
      notify(error.message, true);
    }
  });

  // Dropdown changes: the drawing list that follows the chosen milestone.
  document.addEventListener('change', event => {
    const target = event.target;
    const siteForm = target.closest?.('[data-form="site-log"]');
    if (siteForm && target.name === 'packageId') {
      const project = store.project(siteForm.dataset.project);
      const drawings = project.drawings.filter(item => item.packageId === target.value && item.approved);
      siteForm.elements.drawingId.innerHTML = '<option value="">No drawing reference</option>' + drawings.map(drawing => `<option value="${escape(drawing.id)}">${escape(drawing.reference)} · Rev ${escape(drawing.revision)}</option>`).join('');
    }
  });

  // Typing in the expense form updates its live total.
  document.addEventListener('input', event => {
    if (event.target.closest?.('[data-form="cost"]')) CF.afterRender['expense-form']();
  });
  // Re-render when the #tab changes, and reload when another browser tab changed the records.
  let ready = false;
  window.addEventListener('hashchange', () => {if (ready) render();});
  window.addEventListener('storage', event => {if (event.key === C.STORAGE_KEY) location.reload();});

  const here = () => encodeURIComponent(location.pathname + location.search + location.hash);

  /* Start-up: ask the server who is signed in, then load the records and draw the header and page.
     Not signed in: go to the login page, which brings the user back here. Server unreachable: the error page. */
  async function start() {
    try {
      Object.assign(user, (await api('GET', '/api/auth/me')).user);
    } catch (error) {
      if (error.status === 401) location.replace(root + 'auth/login.html?from=' + here());
      else location.replace(root + 'error.html?code=' + (error.status >= 500 && error.status !== 503 ? 500 : 503) + '&from=' + here());
      return;
    }
    try {
      CF.ctx.setStore(C.createStore(localStorage, user));
      shell();
      render();
      ready = true;
    } catch (error) {
      shell();
      content.innerHTML = CF.ui.heading('Project records unavailable', 'Your records could not be loaded.') + CF.ui.card('Storage issue', '<p>' + escape(error.message) + '</p><p>Allow browser storage and reload this page. Existing records have not been overwritten.</p>');
    }
  }
  CF.ready = start();
});
