/* Page context shared by every script: the route table, current page, and signed-in user. */
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

  // The app is always served over http by the Express server (npm start), so each page is its own file.
  const params = new URLSearchParams(location.search);
  const root = document.body.dataset.root || '';
  const page = document.body.dataset.page || 'dashboard';

  // The signed-in user. app.js fills it from the server (GET /api/auth/me) before the first render,
  // so modules read user.role at render time. It only decides what to show; the server checks every action.
  const user = {id: '', name: '', email: '', role: 'viewer', projects: []};

  // Modules read the store at call time; app.js creates it once the page has loaded.
  let current = null;
  const store = new Proxy({}, {get: (_, key) => current[key]});

  globalThis.CF = {
    ctx: {C: ConstructFlow, routes, params, page, user, root, projectId: params.get('project') || '', store, setStore: value => {current = value;}},
    ui: {}, pages: {}, tabs: {}, forms: {}, actions: {}, afterRender: {}
  };
})();
