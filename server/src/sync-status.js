const { pool } = require('./db');

const ENTITY_TABLES = [
  { key: 'institutions', table: 'institutions' },
  { key: 'users', table: 'users' },
  { key: 'credentials', table: 'user_credentials' },
  { key: 'prisoners', table: 'prisoners' },
  { key: 'applications', table: 'parole_applications' },
  { key: 'hearings', table: 'hearings' },
  { key: 'notifications', table: 'notifications' },
  { key: 'auditLogs', table: 'audit_logs' },
  { key: 'reports', table: 'reports' },
];

async function getEntityCounts() {
  const counts = {};
  for (const { key, table } of ENTITY_TABLES) {
    const [rows] = await pool.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
    counts[key] = rows[0].c;
  }
  const [settings] = await pool.query('SELECT COUNT(*) AS c FROM system_settings WHERE id = 1');
  const [counters] = await pool.query('SELECT COUNT(*) AS c FROM id_counters WHERE id = 1');
  counts.settings = settings[0].c;
  counts.idCounters = counters[0].c;
  return counts;
}

module.exports = { getEntityCounts, ENTITY_TABLES };
