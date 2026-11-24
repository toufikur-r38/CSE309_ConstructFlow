/* The business API: GET /api/records, plus one write route per store method (core/routes.js).
   Every write goes through the same four checks, in this order:
     1. signed in                       (authenticate)            → 401
     2. the role holds the permission   (route.need)              → 403
     3. assigned to the project         (route.project, scope.js) → 403
     4. the business rules              (core/store.js)           → 400, or 404 for an unknown record */
const express = require('express');
const {routes, argsFrom} = require('../../core/routes.js');
const {permissions} = require('../../core/store.js');
const {httpError} = require('../middleware/errors');
const {authenticate: realAuthenticate} = require('../middleware/auth');
const {need} = require('../middleware/access');
const {filterRecords, canUseProject} = require('../scope');
const realState = require('../state');

const NO_PROJECT = 'You are not assigned to this project. Ask the Managing Director to add you to it.';
const BAD_REQUEST = 'The request could not be processed. Check the form and try again.';

// projectOf(): which project this call touches, read from the path, the body, or a sale or expense.
// undefined means "not tied to a project"; null means the sale or expense does not exist.
function projectOf(route, params, body, records) {
  const source = route.project || 'path';
  if (source === 'none') return undefined;
  if (source === 'path') return params.projectId;
  if (source === 'body.projectId') return String(body.projectId ?? '');
  if (source === 'sale:body.saleId') return records.sales.find(sale => sale.id === body.saleId)?.projectId ?? null;
  if (source === 'cost:costId') return records.costs.find(cost => cost.id === params.costId)?.projectId ?? null;
  throw new Error('Unknown project source: ' + source);
}

// checkTable(): refuses to start if a route is missing its permission or project source,
// so a new route can never slip in without an assignment check.
function checkTable() {
  for (const [name, route] of Object.entries(routes)) {
    if (!permissions[route.need]) throw new Error(`Route ${name}: unknown permission ${route.need}`);
    if (!route.project && !route.path.includes(':projectId')) throw new Error(`Route ${name}: say which project it touches`);
  }
}

// ruleError(): turns a store error into an HTTP answer. Store rules throw a plain Error with a
// message written for the user; anything else (TypeError and so on) is a bug and stays a 500.
function ruleError(error) {
  if (error.status) return error;
  if (error.constructor !== Error) return error;
  if (/ not found\.$/.test(error.message)) return httpError(404, error.message);
  return httpError(400, error.message);
}

/* apiRoutes(): authenticate and state can be swapped for fakes in tests;
   the real app always uses the real ones. Authentication is added per route (not router.use),
   so an unknown /api address still answers 404 instead of 401. */
function apiRoutes({authenticate = realAuthenticate, state = realState} = {}) {
  checkTable();
  const router = express.Router();

  // GET /api/records: everything the pages render, filtered for this user.
  router.get('/records', authenticate, async (req, res) => {
    res.json({records: filterRecords(await state.readState(), req.user)});
  });

  for (const [name, route] of Object.entries(routes)) {
    const path = route.path.replace(/^\/api/, '');
    router[route.method.toLowerCase()](path, authenticate, need(route.need), async (req, res) => {
      const body = req.body ?? {};
      if (typeof body !== 'object' || Array.isArray(body)) throw httpError(400, BAD_REQUEST);
      const actor = {id: req.user.id, name: req.user.name, role: req.user.role};

      const result = await state.withState(actor, (store, records) => {
        const projectId = projectOf(route, req.params, body, records);
        // A scoped user hears "not assigned" for any project they are not on, even one that does
        // not exist, so the answer never reveals which project ids exist.
        if (projectId !== undefined && !canUseProject(req.user, projectId)) throw httpError(403, NO_PROJECT);
        if (projectId === null) throw httpError(404, 'Not found.');
        try {
          return store[name](...argsFrom(name, req.params, body));
        } catch (error) {
          throw ruleError(error);
        }
      });
      res.json({result});
    });
  }

  return router;
}

module.exports = {apiRoutes, projectOf, ruleError};
