const path = require('path');
const { exec } = require('child_process');

const express = require('express');

const cors = require('cors');

const config = require('./config');

const { ping } = require('./db');

const { ensureSchema } = require('./schema-sync');
const { syncMissingSeedUsers } = require('./db-sync');

const authRouter = require('./routes/auth');

const bootstrapRouter = require('./routes/bootstrap');

const institutionsRouter = require('./routes/institutions');

const prisonersRouter = require('./routes/prisoners');

const documentsRouter = require('./routes/documents');
const applicationsRouter = require('./routes/applications');
const paroleRouter = require('./routes/parole');
const calendarRouter = require('./routes/calendar');
const { startParoleEligibilityJob } = require('./jobs/parole-eligibility-job');



const app = express();



app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin }));

app.use(express.json({ limit: '5mb' }));



app.get('/api/health', async (_req, res) => {

  try {

    await ping();

    res.json({

      success: true,

      status: 'ok',

      database: config.db.database,

      authRequired: config.authRequired,

    });

  } catch (err) {

    res.status(503).json({ success: false, status: 'error', error: err.message });

  }

});



app.use('/api/auth', authRouter);

app.use('/api/bootstrap', bootstrapRouter);

app.use('/api/institutions', institutionsRouter);

app.use('/api/prisoners', prisonersRouter);

app.use('/api/prisoners/:prisonerId/documents', documentsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/parole', paroleRouter);
app.use('/api/calendar', calendarRouter);

const webRoot = path.join(__dirname, '../..');

app.get('/', (_req, res) => {
  res.sendFile(path.join(webRoot, 'index.html'));
});

app.use(express.static(webRoot));



app.use((err, _req, res, _next) => {

  console.error(err);

  res.status(500).json({ success: false, error: 'Internal server error.' });

});



function openLoginPage(port) {
  if (process.env.OPEN_BROWSER === 'false') return;

  const loginUrl = `http://localhost:${port}/`;
  const cmd = process.platform === 'win32'
    ? `cmd /c start "" "${loginUrl}"`
    : process.platform === 'darwin'
      ? `open "${loginUrl}"`
      : `xdg-open "${loginUrl}"`;

  exec(cmd, (err) => {
    if (err) console.warn('Could not open browser automatically. Open the login URL manually.');
  });
}

async function start() {

  try {

    await ensureSchema();

    console.log('Database schema verified.');

    try {
      const sync = await syncMissingSeedUsers();
      if (sync.added) console.log(sync.message);
    } catch (syncErr) {
      console.warn('Seed user sync skipped:', syncErr.message);
    }

  } catch (err) {
    const detail = err.message || err.code || String(err);
    console.warn('Schema check failed (run npm run migrate):', detail);
  }

  const server = app.listen(config.port, () => {

    const base = `http://localhost:${config.port}`;

    console.log(`PMS is running.`);

    console.log(`  Login:   ${base}/  (sign-in page — open this first)`);

    console.log(`  Health:  ${base}/api/health`);

    console.log(`  Auth:    POST ${base}/api/auth/login`);

    console.log(`  Bootstrap GET ${base}/api/bootstrap`);

    console.log(`  Auth required: ${config.authRequired}`);

    console.log(`  Parole:  POST ${base}/api/parole/applications/:id/submit-consent`);

    openLoginPage(config.port);
    startParoleEligibilityJob({ runOnStart: true });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use. Stop the other PMS process or set PORT in server/.env`);
      process.exit(1);
    }
    throw err;
  });
}



start();


