/* Builds the Express app: security headers, the API, the public pages, and error handling.
   Kept separate from index.js so tests can start it on a random port. */
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const config = require('./config');
const db = require('./db');
const {notFound, handleErrors} = require('./middleware/errors');

// Only these folders and files are public. Server code, .env, db/, tests/, docs/ and
// node_modules/ are never served, because express.static is pointed at each folder by name.
const PUBLIC_FOLDERS = ['admin', 'approvals', 'assets', 'collections', 'core', 'customers', 'dashboard', 'expenses', 'procurement', 'projects', 'reports', 'sales'];
const PUBLIC_FILES = ['index.html', 'error.html'];

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // On Render the app sits behind a proxy; this lets Express see the real https address and client IP.
  if (config.isProduction) app.set('trust proxy', 1);

  // Security headers. The pages have no inline scripts, styles or event handlers, so a strict policy works.
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'script-src-attr': ["'none'"],
        'style-src': ["'self'"],
        'img-src': ["'self'"],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        // Locally the site is plain http, so requests must not be upgraded to https there.
        ...(config.isProduction ? {'upgrade-insecure-requests': []} : {})
      }
    },
    // HSTS only makes sense once the site is served over https.
    strictTransportSecurity: config.isProduction
  }));

  /* ---------- API ---------- */
  const api = express.Router();
  // API answers are never cached, including errors, so the browser always sees current data.
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  // Reads JSON request bodies; anything over 100kb is refused with 413.
  api.use(express.json({limit: '100kb'}));

  // Is the server up, and can it reach the database?
  api.get('/health', async (req, res) => {
    try {
      await db.query('select 1');
      res.json({ok: true, database: 'connected'});
    } catch (error) {
      console.error('Health check: database unreachable:', error.message);
      res.status(503).json({ok: false, database: 'unreachable'});
    }
  });

  app.use('/api', api);

  /* ---------- Pages ---------- */
  const staticOptions = {dotfiles: 'ignore', redirect: false};
  for (const folder of PUBLIC_FOLDERS) app.use('/' + folder, express.static(path.join(config.ROOT, folder), staticOptions));
  for (const file of PUBLIC_FILES) app.get('/' + file, (req, res) => res.sendFile(path.join(config.ROOT, file)));
  app.get('/', (req, res) => res.sendFile(path.join(config.ROOT, 'index.html')));

  /* ---------- Not found and errors (always last) ---------- */
  app.use(notFound);
  app.use(handleErrors);
  return app;
}

module.exports = {createApp, PUBLIC_FOLDERS, PUBLIC_FILES};
