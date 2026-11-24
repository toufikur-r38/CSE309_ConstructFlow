/* The whole REST API in one table: each store write method, its HTTP route, and who may call it.
   The server registers its routes from this table; the browser (day 4) builds its requests from it.

   args lists the method's arguments in order, and where each one travels:
     'projectId'      a path parameter (":projectId")
     'body'           the whole JSON body
     'body.unitIds'   one field of the JSON body
   need is the permission from core/store.js the signed-in role must hold.
   project says which project the call touches, so the server can check the user is assigned to it.
   Routes with :projectId in the path use it. The others say so explicitly:
     'body.projectId'     a field of the body
     'sale:body.saleId'   the project of the sale named in the body
     'cost:costId'        the project of the expense named in the path
     'none'               not tied to a project (new projects, customers, settings) */
(function (root) {
  'use strict';

  const P = '/api/projects/:projectId';

  const routes = {
    // Project, land and stage (MD)
    addProject:        {method: 'POST', path: '/api/projects', args: ['body'], need: 'project', project: 'none'},
    editProject:       {method: 'PUT',  path: P, args: ['projectId', 'body'], need: 'project'},
    addLandowner:      {method: 'POST', path: P + '/landowners', args: ['projectId', 'body'], need: 'project'},
    recordJv:          {method: 'PUT',  path: P + '/jv', args: ['projectId', 'body'], need: 'project'},
    advance:           {method: 'POST', path: P + '/advance', args: ['projectId'], need: 'project'},

    // Approvals
    addPermit:         {method: 'POST', path: P + '/permits', args: ['projectId', 'body'], need: 'permit'},
    decidePermit:      {method: 'POST', path: P + '/permits/:permitId/decision', args: ['projectId', 'permitId', 'body'], need: 'decide'},

    // Building, flats and prices
    defineBuilding:    {method: 'PUT',  path: P + '/building', args: ['projectId', 'body'], need: 'units'},
    allocateLandowner: {method: 'PUT',  path: P + '/landowner-units', args: ['projectId', 'body.unitIds'], need: 'units'},
    setPricing:        {method: 'PUT',  path: P + '/pricing', args: ['projectId', 'body'], need: 'units'},

    // Customers and sales
    addCustomer:       {method: 'POST', path: '/api/customers{/:customerId}', args: ['body', 'customerId'], need: 'sales', project: 'none'},
    bookUnit:          {method: 'POST', path: P + '/sales', args: ['projectId', 'body'], need: 'sales'},
    signAgreement:     {method: 'POST', path: P + '/sales/:saleId/agreement', args: ['projectId', 'saleId', 'body'], need: 'sales'},
    cancelSale:        {method: 'POST', path: P + '/sales/:saleId/cancel', args: ['projectId', 'saleId', 'body'], need: 'decide'},

    // Collections
    addReceipt:        {method: 'POST', path: '/api/receipts', args: ['body'], need: 'receipts', project: 'sale:body.saleId'},

    // Construction
    addPackage:        {method: 'POST', path: P + '/milestones', args: ['projectId', 'body'], need: 'site'},
    addDrawing:        {method: 'POST', path: P + '/drawings', args: ['projectId', 'body'], need: 'site'},
    approveDrawing:    {method: 'POST', path: P + '/drawings/:drawingId/approve', args: ['projectId', 'drawingId'], need: 'decide'},
    addLog:            {method: 'POST', path: P + '/logs', args: ['projectId', 'body'], need: 'site'},
    raiseRfi:          {method: 'POST', path: P + '/logs/:logId/rfi', args: ['projectId', 'logId'], need: 'site'},
    respondRfi:        {method: 'POST', path: P + '/rfis/:rfiId/response', args: ['projectId', 'rfiId', 'body.response'], need: 'decide'},
    addChange:         {method: 'POST', path: P + '/changes', args: ['projectId', 'body'], need: 'site'},
    decideChange:      {method: 'POST', path: P + '/changes/:changeId/decision', args: ['projectId', 'changeId', 'body.decision'], need: 'decide'},

    // Procurement
    requestMaterials:  {method: 'POST', path: P + '/requests', args: ['projectId', 'body'], need: 'procurement'},
    cancelRequest:     {method: 'POST', path: P + '/requests/:requestId/cancel', args: ['projectId', 'requestId'], need: 'procurement'},
    createOrder:       {method: 'POST', path: P + '/orders', args: ['projectId', 'body'], need: 'procurement'},
    receiveOrder:      {method: 'POST', path: P + '/orders/:orderId/receive', args: ['projectId', 'orderId'], need: 'procurement'},
    cancelOrder:       {method: 'POST', path: P + '/orders/:orderId/cancel', args: ['projectId', 'orderId'], need: 'decide'},

    // Expenses
    saveCost:          {method: 'POST', path: '/api/expenses{/:costId}', args: ['body', 'costId'], need: 'costs', project: 'body.projectId'},
    voidCost:          {method: 'POST', path: '/api/expenses/:costId/void', args: ['costId'], need: 'decide', project: 'cost:costId'},

    // Handover
    addPunch:          {method: 'POST', path: P + '/defects', args: ['projectId', 'body'], need: 'site'},
    resolvePunch:      {method: 'POST', path: P + '/defects/:punchId/resolve', args: ['projectId', 'punchId'], need: 'site'},
    recordOccupancy:   {method: 'PUT',  path: P + '/occupancy', args: ['projectId', 'body'], need: 'decide'},
    handoverUnit:      {method: 'POST', path: P + '/units/:unitId/handover', args: ['projectId', 'unitId', 'body'], need: 'decide'},
    formAssociation:   {method: 'PUT',  path: P + '/association', args: ['projectId', 'body'], need: 'decide'},

    // Settings (Administrator)
    addOption:         {method: 'POST', path: '/api/settings/:kind', args: ['kind', 'body.value'], need: 'settings', project: 'none'}
  };

  // buildRequest(): the browser side. Turns store.bookUnit('p1', {...}) into {method, url, body}.
  function buildRequest(name, args) {
    const route = routes[name];
    if (!route) throw new Error('Unknown action: ' + name);
    const params = {};
    let body;
    route.args.forEach((arg, index) => {
      const value = args[index];
      if (arg === 'body') body = {...body, ...value};
      else if (arg.startsWith('body.')) body = {...body, [arg.slice(5)]: value};
      else params[arg] = value == null ? '' : String(value);
    });
    const url = route.path
      // Optional segment such as {/:customerId}: present only when the id is given.
      .replace(/\{\/:(\w+)\}/g, (match, key) => params[key] ? '/' + encodeURIComponent(params[key]) : '')
      .replace(/:(\w+)/g, (match, key) => encodeURIComponent(params[key]));
    return {method: route.method, url, body: body || {}};
  }

  // argsFrom(): the server side. Turns the request back into the method's argument list.
  function argsFrom(name, params, body) {
    return routes[name].args.map(arg => {
      if (arg === 'body') return body;
      if (arg.startsWith('body.')) return body[arg.slice(5)];
      return params[arg] ?? '';
    });
  }

  const api = {routes, buildRequest, argsFrom};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ConstructFlowRoutes = api;
})(globalThis);
