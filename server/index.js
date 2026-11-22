/* Starts the server: npm start (or npm run dev to restart on every file change). */
let config;
try {
  config = require('./config');
} catch (error) {
  console.error('ConstructFlow cannot start: ' + error.message);
  process.exit(1);
}

const {createApp} = require('./app');
const db = require('./db');

const server = createApp().listen(config.port, () => {
  console.log(`ConstructFlow is running at http://localhost:${server.address().port}`);
  console.log(`Database check: http://localhost:${server.address().port}/api/health`);
});

// Hosts such as Render stop the app with SIGTERM: finish open requests, then close the database pool.
function shutdown(signal) {
  console.log(`${signal} received, shutting down.`);
  server.close(() => db.pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
