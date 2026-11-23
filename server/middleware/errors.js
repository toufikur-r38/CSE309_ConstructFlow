/* Not-found and error responses.
   API calls get JSON {error}. Pages get error.html with the right status and a plain explanation.
   Technical details are logged on the server only, never sent to the browser. */
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

const ERROR_PAGE = path.join(config.ROOT, 'error.html');

const API_MESSAGES = {
  400: 'The request could not be processed. Check the form and try again.',
  401: 'You are signed out. Sign in again.',
  403: 'You do not have access to this.',
  404: 'Not found.',
  413: 'The request is too large.',
  429: 'Too many attempts. Wait a few minutes and try again.',
  500: 'Something went wrong on our side. No data was saved. Try again in a minute.',
  503: 'The service is temporarily unavailable. Try again in a minute.'
};

// httpError(): an error with a status; publicMessage is safe to show the user (it reaches the browser).
function httpError(status, publicMessage = '') {
  const error = new Error(publicMessage || API_MESSAGES[status] || 'Error');
  error.status = status;
  if (publicMessage) error.publicMessage = publicMessage;
  return error;
}

const isApi = req => req.path === '/api' || req.path.startsWith('/api/');

let template = null;
function sendErrorPage(res, status) {
  // Read once; the server fills in the code so the page can explain the right problem.
  template ||= fs.readFileSync(ERROR_PAGE, 'utf8');
  res.status(status).type('html').set('Cache-Control', 'no-store').send(template.replace('data-code=""', `data-code="${Number(status)}"`));
}

function sendError(req, res, status, message) {
  if (isApi(req)) res.status(status).json({error: message || API_MESSAGES[status] || API_MESSAGES[500]});
  else sendErrorPage(res, status);
}

// Runs after every route: nothing matched the address.
function notFound(req, res) {
  sendError(req, res, 404);
}

// Express calls this when a route throws or calls next(error).
// eslint-disable-next-line no-unused-vars
function handleErrors(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = Number(error.status || error.statusCode);
  if (status >= 400 && status < 500) {
    // Client mistakes such as invalid JSON or an oversized body. The parser's own text is technical,
    // so only a message our code marked as safe (publicMessage) is shown; otherwise the plain one above.
    return sendError(req, res, status, error.publicMessage || API_MESSAGES[status]);
  }
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, error);
  sendError(req, res, status === 503 ? 503 : 500);
}

module.exports = {notFound, handleErrors, sendErrorPage, isApi, httpError};
