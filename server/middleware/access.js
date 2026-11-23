/* Authorization and request-forgery checks, run on the server for every API call.
   The page's can() only hides buttons; these checks are the ones that actually protect the data. */
const {permissions} = require('../../core/store.js');
const config = require('../config');
const {httpError} = require('./errors');

// need('accounts', 'assign'): the signed-in user's role must hold at least one of these permissions.
function need(...names) {
  for (const name of names) if (!permissions[name]) throw new Error('Unknown permission: ' + name);
  return (req, res, next) => {
    if (!req.user || !names.some(name => permissions[name].includes(req.user.role))) throw httpError(403);
    next();
  };
}

/* CSRF protection for every request that changes something (anything but GET and HEAD):
   it must come from our own site (Origin header) and carry JSON, which a plain HTML form on
   another site cannot send. Together with SameSite=Strict cookies this blocks forged requests. */
function sameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.get('origin') !== config.appOrigin) throw httpError(403, 'This request did not come from the ConstructFlow site, so it was refused.');
  if (!req.is('application/json')) throw httpError(403, 'Changes must be sent as JSON, so this request was refused.');
  next();
}

module.exports = {need, sameOrigin};
