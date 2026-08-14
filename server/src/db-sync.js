const { pool } = require('./db');
const { buildSeedData } = require('./seed-data');
const {
  jsonStringify,
  toMysqlDatetime,
  mapInstitutionRow,
  mapUserRow,
  mapPrisonerRow,
  mapApplicationRow,
  mapHearingRow,
  mapNotificationRow,
  mapAuditRow,
  mapReportRow,
  mapDocumentRow,
  jsonParse,
  prisonerExtraAttributes,
} = require('./mappers');

async function countInstitutions(conn) {
  const [rows] = await conn.execute('SELECT COUNT(*) AS c FROM institutions');
  return rows[0].c;
}

async function loadAll() {
  const [
    institutions,
    users,
    credentials,
    prisoners,
    prisonerDocuments,
    applications,
    hearings,
    notifications,
    auditLogs,
    reports,
    settingsRows,
    counterRows,
  ] = await Promise.all([
    pool.query('SELECT * FROM institutions ORDER BY id'),
    pool.query('SELECT * FROM users ORDER BY id'),
    pool.query('SELECT username, password FROM user_credentials'),
    pool.query('SELECT * FROM prisoners ORDER BY id'),
    pool.query('SELECT * FROM prisoner_documents ORDER BY uploaded_at').catch(() => [[], []]),
    pool.query('SELECT * FROM parole_applications ORDER BY created_at'),
    pool.query('SELECT * FROM hearings ORDER BY id'),
    pool.query('SELECT * FROM notifications ORDER BY created_at DESC'),
    pool.query('SELECT * FROM audit_logs ORDER BY logged_at DESC'),
    pool.query('SELECT * FROM reports ORDER BY created_at DESC'),
    pool.query('SELECT settings FROM system_settings WHERE id = 1'),
    pool.query('SELECT counters FROM id_counters WHERE id = 1'),
  ]);

  const demoPasswords = {};
  credentials[0].forEach((row) => { demoPasswords[row.username] = row.password; });

  const settings = settingsRows[0][0]?.settings
    ? jsonParse(settingsRows[0][0].settings, buildSeedData().seed.settings)
    : buildSeedData().seed.settings;

  const idCounters = counterRows[0][0]?.counters
    ? jsonParse(counterRows[0][0].counters, {})
    : {};

  const docsByPrisoner = {};
  prisonerDocuments[0].forEach((row) => {
    if (!docsByPrisoner[row.prisoner_id]) docsByPrisoner[row.prisoner_id] = [];
    docsByPrisoner[row.prisoner_id].push(mapDocumentRow(row));
  });

  return {
    settings,
    institutions: institutions[0].map(mapInstitutionRow),
    users: users[0].map(mapUserRow),
    prisoners: prisoners[0].map((row) => {
      const tableDocs = docsByPrisoner[row.id] || [];
      const legacyDocs = jsonParse(row.documents, []);
      const mergedDocs = tableDocs.length ? tableDocs : legacyDocs;
      return mapPrisonerRow(row, mergedDocs);
    }),
    applications: applications[0].map(mapApplicationRow),
    hearings: hearings[0].map(mapHearingRow),
    notifications: notifications[0].map(mapNotificationRow),
    auditLogs: auditLogs[0].map(mapAuditRow),
    reports: reports[0].map(mapReportRow),
    idCounters,
    demoPasswords,
  };
}

async function saveAll(payload, demoPasswords = {}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute('DELETE FROM audit_logs');
    await conn.execute('DELETE FROM notifications');
    await conn.execute('DELETE FROM hearings');
    await conn.execute('DELETE FROM parole_applications');
    await conn.execute('DELETE FROM reports');
    await conn.execute('DELETE FROM prisoner_documents');
    await conn.execute('DELETE FROM prisoners');
    await conn.execute('DELETE FROM user_credentials');
    await conn.execute('DELETE FROM users');
    await conn.execute('DELETE FROM institutions');

    for (const inst of payload.institutions || []) {
      await conn.execute(
        `INSERT INTO institutions
          (id, code, name, province, address, location, status, commander_id, capacity, phone, email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          inst.id, inst.code || inst.id, inst.name, inst.province || null,
          inst.address || null, inst.location || inst.address || null,
          inst.status || 'Active', inst.commanderId || null, inst.capacity ?? null,
          inst.phone || '', inst.email || '',
        ]
      );
    }

    for (const user of payload.users || []) {
      await conn.execute(
        `INSERT INTO users
          (id, officer_id, employee_number, username, email, first_name, last_name, role, \`rank\`,
           institution_id, province, position, phone, employment_status, account_status,
           board_position, status, date_appointed, last_login, profile_photo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id, user.officerId || null, user.employeeNumber || null, user.username,
          user.email || null, user.firstName, user.lastName, user.role, user.rank || null,
          user.institutionId || null, user.province || null, user.position || null,
          user.phone || null, user.employmentStatus || null, user.accountStatus || null,
          user.boardPosition || null, user.status || 'Active', user.dateAppointed || null,
          user.lastLogin ? toMysqlDatetime(user.lastLogin) : null, user.profilePhoto || null,
        ]
      );
    }

    const passwords = { ...(payload.demoPasswords || {}), ...demoPasswords };
    for (const user of payload.users || []) {
      const password = passwords[user.username];
      if (password) {
        await conn.execute(
          'INSERT INTO user_credentials (username, password) VALUES (?, ?)',
          [user.username, password]
        );
      }
    }

    for (const p of payload.prisoners || []) {
      await conn.execute(
        `INSERT INTO prisoners
          (id, prisoner_number, institution_id, first_name, last_name, date_of_birth, gender,
           offense, sentence_start_date, sentence_end_date, status, parole_eligibility_date,
           status_updated_at, documents, extra_attributes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id, p.prisonerNumber || p.id, p.institutionId, p.firstName, p.lastName,
          p.dateOfBirth || null, p.gender || null, p.offense || null,
          p.sentenceStartDate, p.sentenceEndDate, p.status || 'Awaiting Eligibility',
          p.paroleEligibilityDate || null,
          p.statusUpdatedAt ? toMysqlDatetime(p.statusUpdatedAt) : null,
          jsonStringify([]),
          jsonStringify(prisonerExtraAttributes(p)),
        ]
      );

      for (const doc of p.documents || []) {
        await conn.execute(
          `INSERT INTO prisoner_documents
            (id, prisoner_id, name, mime_type, file_size, data_url, uploaded_by, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            doc.id,
            p.id,
            doc.name,
            doc.type || doc.mimeType || null,
            doc.size || doc.fileSize || null,
            doc.dataUrl || null,
            doc.uploadedBy || null,
            doc.uploadedAt ? toMysqlDatetime(doc.uploadedAt) : toMysqlDatetime(new Date().toISOString()),
          ]
        );
      }
    }

    for (const app of payload.applications || []) {
      await conn.execute(
        `INSERT INTO parole_applications
          (id, prisoner_id, institution_id, status, submitted_at, submitted_by,
           form_data, form_uploads, board_decision, workflow_notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          app.id, app.prisonerId, app.institutionId, app.status || 'Draft',
          app.submittedAt || null, app.submittedBy || null,
          jsonStringify(app.formData || {}),
          jsonStringify(app.forms || null),
          jsonStringify(app.boardDecision),
          jsonStringify(app.workflowNotes || []),
          toMysqlDatetime(app.createdAt || new Date().toISOString()),
        ]
      );
    }

    for (const h of payload.hearings || []) {
      await conn.execute(
        `INSERT INTO hearings
          (id, application_id, prisoner_id, institution_id, scheduled_date, scheduled_time,
           location, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          h.id, h.applicationId, h.prisonerId, h.institutionId,
          h.scheduledDate || null, h.scheduledTime || null, h.location || null,
          h.notes || null, h.status || null,
        ]
      );
    }

    for (const n of payload.notifications || []) {
      const { id, type, title, message, recipientRole, recipientUserId, institutionId,
        prisonerId, eligibleDate, read, resolved, createdAt, ...meta } = n;
      await conn.execute(
        `INSERT INTO notifications
          (id, type, title, message, recipient_role, recipient_user_id, institution_id,
           prisoner_id, eligible_date, is_read, is_resolved, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, type || null, title, message, recipientRole || null, recipientUserId || null,
          institutionId || null, prisonerId || null, eligibleDate || null,
          read ? 1 : 0, resolved ? 1 : 0, jsonStringify(Object.keys(meta).length ? meta : null),
          toMysqlDatetime(createdAt || new Date().toISOString()),
        ]
      );
    }

    for (const log of payload.auditLogs || []) {
      await conn.execute(
        `INSERT INTO audit_logs
          (id, user_id, user_name, role, action, entity, entity_id, details, logged_at,
           ip_address, previous_values, new_values, denied, success)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          log.id, log.userId || null, log.userName || null, log.role || null, log.action,
          log.entity || null, log.entityId || null, log.details || null,
          toMysqlDatetime(log.timestamp || new Date().toISOString()),
          log.ipAddress || '127.0.0.1',
          jsonStringify(log.previousValues), jsonStringify(log.newValues),
          log.denied ? 1 : 0, log.success === false ? 0 : 1,
        ]
      );
    }

    for (const r of payload.reports || []) {
      const { id, institutionId, type, title, status, createdBy, createdAt, ...content } = r;
      await conn.execute(
        `INSERT INTO reports (id, institution_id, type, title, status, content, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, institutionId || null, type || null, title, status || null,
          jsonStringify(Object.keys(content).length ? content : null),
          createdBy || null, toMysqlDatetime(createdAt || new Date().toISOString()),
        ]
      );
    }

    await conn.execute(
      `INSERT INTO system_settings (id, settings) VALUES (1, ?)
       ON DUPLICATE KEY UPDATE settings = VALUES(settings)`,
      [jsonStringify(payload.settings || buildSeedData().seed.settings)]
    );

    await conn.execute(
      `INSERT INTO id_counters (id, counters) VALUES (1, ?)
       ON DUPLICATE KEY UPDATE counters = VALUES(counters)`,
      [jsonStringify(payload.idCounters || {})]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function seedIfEmpty(force = false) {
  const conn = await pool.getConnection();
  try {
    const count = await countInstitutions(conn);
    if (!force && count > 0) {
      return { seeded: false, message: 'Database already contains data.' };
    }
    const { seed, demoPasswords } = buildSeedData();
    await saveAll({ ...seed, demoPasswords }, demoPasswords);
    return {
      seeded: true,
      message: `Seeded ${seed.institutions.length} institutions and related records.`,
      counts: {
        institutions: seed.institutions.length,
        users: seed.users.length,
        prisoners: seed.prisoners.length,
        applications: seed.applications.length,
        hearings: seed.hearings.length,
        notifications: seed.notifications.length,
        auditLogs: seed.auditLogs.length,
        reports: seed.reports.length,
      },
    };
  } finally {
    conn.release();
  }
}

module.exports = { loadAll, saveAll, seedIfEmpty, countInstitutions };
