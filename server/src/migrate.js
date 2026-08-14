const { ensureSchema } = require('./schema-sync');

ensureSchema()
  .then((result) => {
    console.log(`Schema ready (v${result.version}) on database "${result.database}".`);
    console.log('Run "npm run seed" to load all demo entities, or start the server to auto-seed on first request.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
