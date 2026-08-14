const path = require('path');
const { exec } = require('child_process');

const express = require('express');

const cors = require('cors');

const config = require('./config');

const { ping } = require('./db');

const { ensureSchema } = require('./schema-sync');

const authRouter = require('./routes/auth');

const bootstrapRouter = require('./routes/bootstrap');

const institutionsRouter = require('./routes/institutions');

const prisonersRouter = require('./routes/prisoners');

const documentsRouter = require('./routes/documents');
const applicationsRouter = require('./routes/applications');



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

  } catch (err) {

    console.warn('Schema check failed (run npm run migrate):', err.message);

  }



  app.listen(config.port, () => {

    const base = `http://localhost:${config.port}`;

    console.log(`PMS is running.`);

    console.log(`  Login:   ${base}/  (sign-in page — open this first)`);

    console.log(`  Health:  ${base}/api/health`);

    console.log(`  Auth:    POST ${base}/api/auth/login`);

    console.log(`  Bootstrap GET ${base}/api/bootstrap`);

    console.log(`  Auth required: ${config.authRequired}`);

    openLoginPage(config.port);

  });

}



start();


