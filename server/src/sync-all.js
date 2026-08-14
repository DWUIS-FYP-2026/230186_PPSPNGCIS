require('dotenv').config();
const { ensureSchema } = require('./schema-sync');
const { seedIfEmpty, loadAll } = require('./db-sync');
const { getEntityCounts } = require('./sync-status');

async function syncAll() {
  console.log('Ensuring schema…');
  const schema = await ensureSchema();
  console.log(`Schema v${schema.version} on ${schema.database}`);

  console.log('Seeding if empty…');
  const seedResult = await seedIfEmpty(false);
  console.log(seedResult.message);
  if (seedResult.seeded && seedResult.counts) {
    console.log('Seed counts:', seedResult.counts);
  }

  const counts = await getEntityCounts();
  const data = await loadAll();

  console.log('\nDatabase entity counts:');
  console.table(counts);

  console.log('\nBootstrap payload counts:');
  console.table({
    institutions: data.institutions.length,
    users: data.users.length,
    prisoners: data.prisoners.length,
    applications: data.applications.length,
    hearings: data.hearings.length,
    notifications: data.notifications.length,
    auditLogs: data.auditLogs.length,
    reports: data.reports.length,
    settings: data.settings ? 1 : 0,
    idCounterKeys: Object.keys(data.idCounters || {}).length,
    credentials: Object.keys(data.demoPasswords || {}).length,
  });

  if (data.institutions.length !== 19) {
    console.warn(`Expected 19 institutions, found ${data.institutions.length}. Run: npm run seed`);
    process.exit(1);
  }

  console.log('\nAll entities synchronized.');
}

syncAll().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
