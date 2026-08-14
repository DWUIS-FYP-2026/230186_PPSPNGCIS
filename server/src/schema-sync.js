/**
 * Ensures MySQL schema matches the PMS entity model.
 * Creates tables/columns and migrates legacy structures (e.g. old auto-increment prisoners).
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('./config');

const SCHEMA_VERSION = 3;

const EXTRA_COLUMNS = [
  { table: 'prisoners', column: 'parole_eligibility_date', ddl: 'DATE NULL AFTER status' },
  { table: 'prisoners', column: 'status_updated_at', ddl: 'DATETIME NULL AFTER parole_eligibility_date' },
  { table: 'prisoners', column: 'extra_attributes', ddl: 'JSON NULL AFTER documents' },
  { table: 'parole_applications', column: 'form_uploads', ddl: 'JSON NULL AFTER form_data' },
  { table: 'reports', column: 'content', ddl: 'JSON NULL AFTER status' },
];

const EXTRA_TABLES = [
  {
    name: 'prisoner_documents',
    ddl: `CREATE TABLE IF NOT EXISTS prisoner_documents (
      id VARCHAR(32) NOT NULL PRIMARY KEY,
      prisoner_id VARCHAR(32) NOT NULL,
      name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120) NULL,
      file_size INT NULL,
      data_url MEDIUMTEXT NULL,
      uploaded_by VARCHAR(32) NULL,
      uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_prisoner_documents_prisoner (prisoner_id),
      CONSTRAINT fk_prisoner_documents_prisoner
        FOREIGN KEY (prisoner_id) REFERENCES prisoners(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'api_sessions',
    ddl: `CREATE TABLE IF NOT EXISTS api_sessions (
      token VARCHAR(64) NOT NULL PRIMARY KEY,
      user_id VARCHAR(32) NOT NULL,
      role VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      INDEX idx_api_sessions_user (user_id),
      INDEX idx_api_sessions_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
];

async function columnExists(conn, table, column) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [config.db.database, table, column]
  );
  return rows[0].c > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [config.db.database, table]
  );
  return rows[0].c > 0;
}

async function ensureLegacyPrisonersMigrated(conn) {
  if (!(await tableExists(conn, 'prisoners'))) return;

  const [cols] = await conn.execute(
    `SELECT COLUMN_NAME, EXTRA, COLUMN_KEY FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'prisoners'`,
    [config.db.database]
  );

  const idCol = cols.find((c) => c.COLUMN_NAME === 'id');
  const hasExternalId = cols.some((c) => c.COLUMN_NAME === 'prisoner_number');
  const idIsInt = idCol && String(idCol.DATA_TYPE || '').toLowerCase().includes('int');

  if (idIsInt && !hasExternalId) {
    console.log('Migrating legacy prisoners table to external-id schema…');
    await conn.query('DROP TABLE IF EXISTS prisoners');
  }
}

async function ensureExtraColumns(conn) {
  for (const { table, column, ddl } of EXTRA_COLUMNS) {
    if (!(await tableExists(conn, table))) continue;
    if (await columnExists(conn, table, column)) continue;
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
    console.log(`  Added column ${table}.${column}`);
  }

  for (const { name, ddl } of EXTRA_TABLES) {
    if (await tableExists(conn, name)) continue;
    await conn.query(ddl);
    console.log(`  Created table ${name}`);
  }

  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
      version INT NOT NULL DEFAULT 1,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await conn.query(
    `INSERT INTO schema_version (id, version) VALUES (1, ?)
     ON DUPLICATE KEY UPDATE version = GREATEST(version, VALUES(version))`,
    [SCHEMA_VERSION]
  );
}

async function runBaseSchema(conn) {
  const sqlPath = path.join(__dirname, '../../sql/pms_db_schema.sql');
  const script = fs.readFileSync(sqlPath, 'utf8');
  const statements = script.split(';').map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) {
    await conn.query(statement);
  }
}

async function ensureSchema() {
  const { database, ...connOpts } = config.db;
  const conn = await mysql.createConnection({ ...connOpts, multipleStatements: true });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${database}\``);
    await ensureLegacyPrisonersMigrated(conn);
    await runBaseSchema(conn);
    await ensureExtraColumns(conn);
    return { ok: true, version: SCHEMA_VERSION, database };
  } finally {
    await conn.end();
  }
}

module.exports = { ensureSchema, SCHEMA_VERSION };
