/* What each signed-in user may see. Filtering happens on the server, so data a role must not
   see never reaches the browser at all (hiding it in the page would not be enough).
     MD                  everything
     PM, Sales, Accounts, Viewer   only assigned projects, and only those projects' sales,
                         receipts, expenses and activity. Sales sees every customer; the others
                         see only customers who bought in one of their projects.
     Administrator       project names (for assigning staff), settings and the activity log */
const {scopedRoles} = require('../core/store.js');

// seesAllProjects(): the MD and the Administrator are not limited to assigned projects.
const seesAllProjects = user => !scopedRoles.includes(user.role);

// canUseProject(): may this user work on (or read) this project at all?
function canUseProject(user, projectId) {
  return seesAllProjects(user) || user.projects.includes(projectId);
}

// filterRecords(): the records object the pages render, cut down to what this user may see.
function filterRecords(records, user) {
  if (user.role === 'md') return records;

  if (user.role === 'administrator') {
    return {
      ...records,
      projects: records.projects.map(project => ({id: project.id, name: project.name})),
      customers: [], sales: [], receipts: [], costs: []
    };
  }

  const mine = new Set(user.projects);
  const inMine = row => mine.has(row.projectId);
  const sales = records.sales.filter(inMine);
  const buyers = new Set(sales.map(sale => sale.customerId));
  return {
    ...records,
    projects: records.projects.filter(project => mine.has(project.id)),
    customers: user.role === 'sales' ? records.customers : records.customers.filter(customer => buyers.has(customer.id)),
    sales,
    receipts: records.receipts.filter(inMine),
    costs: records.costs.filter(inMine),
    audit: records.audit.filter(inMine)
  };
}

module.exports = {filterRecords, canUseProject, seesAllProjects};
