/* Settings, read once from the environment: the .env file locally, the host's settings in production.
   A missing required setting stops the server at start-up with a message saying what to fix. */
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
require('dotenv').config({path: path.join(ROOT, '.env'), quiet: true});

function required(name) {
  const value = (process.env[name] || '').trim();
  if (!value) throw new Error(`Missing setting ${name}. Copy .env.example to .env and fill it in (on the host, add it to the environment variables).`);
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be a whole number between 0 and 65535.');

// In production the public address must be stated; it is used for the Origin check on writes and in links.
const appOrigin = (isProduction ? required('APP_ORIGIN') : process.env.APP_ORIGIN || `http://localhost:${port}`).replace(/\/+$/, '');

// Optional: Supabase's CA certificate, so the server can verify it is talking to the real database.
const caFile = (process.env.DATABASE_CA_FILE || '').trim();

module.exports = Object.freeze({
  ROOT,
  isProduction,
  port,
  appOrigin,
  databaseUrl: required('DATABASE_URL'),
  databaseCaFile: caFile ? path.resolve(ROOT, caFile) : ''
});
