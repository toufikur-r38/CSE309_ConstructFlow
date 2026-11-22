/* Page context shared by every script: the route table, current page, and role. */
(function () {
  'use strict';

  const routes = {
    dashboard: 'index.html',
    projects: 'projects/index.html', 'project-form': 'projects/form.html', project: 'projects/workspace.html',
    sales: 'sales/index.html', customers: 'customers/index.html', buyer: 'customers/buyer.html',
    collections: 'collections/index.html', procurement: 'procurement/index.html',
    expenses: 'expenses/index.html', 'expense-form': 'expenses/form.html',
    approvals: 'approvals/index.html', reports: 'reports/index.html',
    team: 'admin/team.html', settings: 'admin/settings.html', activity: 'admin/activity.html', profile: 'admin/profile.html'
  };

  const params = new URLSearchParams(location.search);
  const fileMode = location.protocol === 'file:';
  const root = document.body.dataset.root || '';
  const page = (fileMode && params.get('page')) || document.body.dataset.page || 'dashboard';

  let savedRole;
  try { savedRole = sessionStorage.getItem('constructflow.role'); } catch (_) { /* URL preserves role when session storage is disabled. */ }
  const requestedRole = params.get('role') || savedRole || 'admin';
  const role = ConstructFlow.roles.includes(requestedRole) ? requestedRole : 'viewer';
  try { sessionStorage.setItem('constructflow.role', role); } catch (_) { /* Optional preference. */ }

  // File URLs can isolate storage per HTML file. Keep direct-file navigation on
  // the root index.html so every module uses the same records, just as it does on HTTP.
  const redirecting = fileMode && root !== '';
  if (redirecting) {
    params.set('page', page);
    location.replace(root + 'index.html?' + params + location.hash);
  }

  // Modules read the store at call time; app.js creates it once the page has loaded.
  let current = null;
  const store = new Proxy({}, {get: (_, key) => current[key]});

  globalThis.CF = {
    ctx: {C: ConstructFlow, routes, params, page, role, fileMode, root, redirecting, projectId: params.get('project') || '', store, setStore: value => {current = value;}},
    ui: {}, pages: {}, tabs: {}, forms: {}, actions: {}, afterRender: {}
  };
})();
