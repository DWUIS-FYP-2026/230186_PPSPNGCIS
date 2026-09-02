/**
 * Parole Act 1991 — database repository (MySQL).
 */
const { query } = require('../db');
const { jsonParse, jsonStringify, toMysqlDatetime } = require('../mappers');
const { PAROLE_STATUSES, WORKFLOW_VERSION, ROLES } = require('./constants');
const { recalculateEligibility } = require('./eligibility');

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function nextCaseNumber() {
  const rows = await query(
    `SELECT case_number FROM parole_applications
     WHERE case_number REGEXP '^PC-[0-9]+$'
     ORDER BY CAST(SUBSTRING(case_number, 4) AS UNSIGNED) DESC LIMIT 1`
  );
  const last = rows[0]?.case_number;
  const seq = last ? parseInt(last.slice(3), 10) + 1 : 1;
  return `PC-${String(seq).padStart(6, '0')}`;
}

function mapApplicationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    caseNumber: row.case_number,
    prisonerId: row.prisoner_id,
    institutionId: row.institution_id,
    status: row.status,
    eligibilityDate: row.eligibility_date,
    notificationDate: row.notification_date,
    notificationSentAt: row.notification_sent_at,
    prisonerConsent: row.prisoner_consent == null ? null : !!row.prisoner_consent,
    consentRecordedAt: row.consent_recorded_at,
    consentRecordedBy: row.consent_recorded_by,
    hearingDate: row.hearing_date,
    declinedAt: row.declined_at,
    cooldownUntil: row.cooldown_until,
    communitySafetyScore: row.community_safety_score != null ? Number(row.community_safety_score) : null,
    workflowVersion: row.workflow_version,
    formData: jsonParse(row.form_data, {}),
    boardDecision: jsonParse(row.board_decision, null),
    workflowNotes: jsonParse(row.workflow_notes, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getPrisonerById(prisonerId) {
  const rows = await query('SELECT * FROM prisoners WHERE id = ? LIMIT 1', [prisonerId]);
  return rows[0] || null;
}

async function updatePrisonerEligibilityFields(prisonerId, calc) {
  await query(
    `UPDATE prisoners SET
      parole_eligibility_date = ?,
      time_served_days = ?,
      total_sentence_years = COALESCE(total_sentence_years, ?),
      updated_at = NOW()
     WHERE id = ?`,
    [calc.eligibilityDate, calc.timeServedDays, calc.totalSentenceYears, prisonerId]
  );
}

async function getApplicationById(applicationId) {
  const rows = await query(
    'SELECT * FROM parole_applications WHERE id = ? LIMIT 1',
    [applicationId]
  );
  return mapApplicationRow(rows[0]);
}

async function getApplicationWithPrisoner(applicationId) {
  const rows = await query(
    `SELECT a.*, p.*, i.name AS facility_name, i.code AS facility_code, i.province AS facility_province,
            i.address AS facility_address, i.location AS facility_location
     FROM parole_applications a
     INNER JOIN prisoners p ON p.id = a.prisoner_id
     LEFT JOIN institutions i ON i.id = p.institution_id
     WHERE a.id = ? LIMIT 1`,
    [applicationId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  const institution = {
    name: row.facility_name,
    code: row.facility_code,
    province: row.facility_province,
    address: row.facility_address || row.facility_location,
  };
  return {
    application: mapApplicationRow(row),
    prisoner: row,
    institution,
  };
}

async function getApplicationBundleByPrisonerId(prisonerId) {
  const app = await findAct1991ApplicationForPrisoner(prisonerId);
  if (!app) return null;
  return getApplicationWithPrisoner(app.id);
}

async function findAct1991ApplicationForPrisoner(prisonerId) {
  const rows = await query(
    `SELECT * FROM parole_applications
     WHERE prisoner_id = ? AND workflow_version = ?
     ORDER BY created_at DESC LIMIT 1`,
    [prisonerId, WORKFLOW_VERSION]
  );
  return mapApplicationRow(rows[0]);
}

async function createAct1991Application(prisoner, actorId = null) {
  const calc = recalculateEligibility(prisoner);
  await updatePrisonerEligibilityFields(prisoner.id, calc);

  const id = newId('APP');
  const caseNumber = await nextCaseNumber();

  await query(
    `INSERT INTO parole_applications
      (id, case_number, prisoner_id, institution_id, status, eligibility_date, notification_date,
       workflow_version, form_data, workflow_notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      id,
      caseNumber,
      prisoner.id,
      prisoner.institution_id,
      PAROLE_STATUSES.PENDING_ELIGIBILITY,
      calc.eligibilityDate,
      calc.notificationDate,
      WORKFLOW_VERSION,
      jsonStringify({ form1: null }),
      jsonStringify([]),
    ]
  );

  await logTransition(id, null, PAROLE_STATUSES.PENDING_ELIGIBILITY, actorId, 'system', 'Application created — monitoring eligibility');
  return getApplicationById(id);
}

async function updateApplicationStatus(applicationId, toStatus, fields = {}) {
  const sets = ['status = ?', 'updated_at = NOW()'];
  const params = [toStatus];

  const columnMap = {
    notificationSentAt: 'notification_sent_at',
    prisonerConsent: 'prisoner_consent',
    consentRecordedAt: 'consent_recorded_at',
    consentRecordedBy: 'consent_recorded_by',
    hearingDate: 'hearing_date',
    declinedAt: 'declined_at',
    cooldownUntil: 'cooldown_until',
    communitySafetyScore: 'community_safety_score',
  };

  Object.entries(columnMap).forEach(([key, col]) => {
    if (fields[key] !== undefined) {
      sets.push(`${col} = ?`);
      params.push(fields[key]);
    }
  });

  if (fields.eligibilityDate) {
    sets.push('eligibility_date = ?');
    params.push(fields.eligibilityDate);
  }
  if (fields.notificationDate) {
    sets.push('notification_date = ?');
    params.push(fields.notificationDate);
  }
  if (fields.formData) {
    sets.push('form_data = ?');
    params.push(jsonStringify(fields.formData));
  }

  params.push(applicationId);
  await query(`UPDATE parole_applications SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function logTransition(applicationId, fromStatus, toStatus, actorId, actorRole, notes) {
  await query(
    `INSERT INTO parole_state_transitions
      (id, application_id, from_status, to_status, actor_id, actor_role, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [newId('PST'), applicationId, fromStatus || 'NEW', toStatus, actorId, actorRole, notes || null]
  );
}

async function logParoleNotification(applicationId, prisonerId, notificationType, notificationDate, recipientRole) {
  await query(
    `INSERT INTO parole_notification_log
      (id, application_id, prisoner_id, notification_type, notification_date, recipient_role)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [newId('PNL'), applicationId, prisonerId, notificationType, notificationDate, recipientRole]
  );
}

async function hasNotificationLog(applicationId, notificationType) {
  const rows = await query(
    'SELECT id FROM parole_notification_log WHERE application_id = ? AND notification_type = ? LIMIT 1',
    [applicationId, notificationType]
  );
  return rows.length > 0;
}

async function createSystemNotification({ title, message, recipientRole, prisonerId, institutionId, applicationId, type }) {
  await query(
    `INSERT INTO notifications
      (id, type, title, message, recipient_role, institution_id, prisoner_id, is_read, is_resolved, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, NOW())`,
    [
      newId('NOT'),
      type || 'parole',
      title,
      message,
      recipientRole,
      institutionId || null,
      prisonerId || null,
      jsonStringify({ applicationId, linkPanel: 'applications' }),
    ]
  );
}

async function getEligibleList() {
  const rows = await query(
    `SELECT a.*, p.first_name, p.last_name, p.prisoner_number, p.sentence_type,
            p.risk_classification, p.sentence_start_date, p.sentence_end_date
     FROM parole_applications a
     INNER JOIN prisoners p ON p.id = a.prisoner_id
     WHERE a.workflow_version = ? AND a.status IN (?, ?)
     ORDER BY a.eligibility_date ASC`,
    [WORKFLOW_VERSION, PAROLE_STATUSES.ELIGIBLE, PAROLE_STATUSES.AWAITING_PRISONER_CONSENT]
  );
  return rows.map((row) => ({
    ...mapApplicationRow(row),
    prisonerName: `${row.first_name} ${row.last_name}`,
    prisonerNumber: row.prisoner_number,
    sentenceType: row.sentence_type,
    riskClassification: row.risk_classification,
  }));
}

async function getPendingEligibilityApplications(asOfDate) {
  const rows = await query(
    `SELECT a.*, p.*
     FROM parole_applications a
     INNER JOIN prisoners p ON p.id = a.prisoner_id
     WHERE a.workflow_version = ?
       AND a.status = ?
       AND a.notification_date <= ?`,
    [WORKFLOW_VERSION, PAROLE_STATUSES.PENDING_ELIGIBILITY, asOfDate]
  );
  return rows.map((row) => ({
    application: mapApplicationRow(row),
    prisoner: row,
  }));
}

async function upsertDetaineeReport(applicationId, officerId, payload) {
  const existing = await query(
    'SELECT id FROM detainee_assessment_reports WHERE application_id = ? LIMIT 1',
    [applicationId]
  );
  if (existing.length) {
    await query(
      `UPDATE detainee_assessment_reports SET
        risk_level = ?, report_content = ?, institutional_behavior = ?,
        programs_completed = ?, submission_date = NOW(), updated_at = NOW()
       WHERE application_id = ?`,
      [
        payload.riskLevel,
        payload.reportContent,
        payload.institutionalBehavior || null,
        payload.programsCompleted || null,
        applicationId,
      ]
    );
    await query(
      'UPDATE prisoners SET risk_classification = ?, updated_at = NOW() WHERE id = (SELECT prisoner_id FROM parole_applications WHERE id = ?)',
      [payload.riskLevel, applicationId]
    );
    return existing[0].id;
  }

  const id = newId('DAR');
  await query(
    `INSERT INTO detainee_assessment_reports
      (id, application_id, created_by_cs_officer_id, risk_level, report_content,
       institutional_behavior, programs_completed)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id, applicationId, officerId, payload.riskLevel, payload.reportContent,
      payload.institutionalBehavior || null, payload.programsCompleted || null,
    ]
  );
  await query(
    'UPDATE prisoners SET risk_classification = ?, updated_at = NOW() WHERE id = (SELECT prisoner_id FROM parole_applications WHERE id = ?)',
    [payload.riskLevel, applicationId]
  );
  return id;
}

async function upsertPreParoleReport(applicationId, officerId, payload) {
  const existing = await query(
    'SELECT id FROM pre_parole_reports WHERE application_id = ? LIMIT 1',
    [applicationId]
  );
  if (existing.length) {
    await query(
      `UPDATE pre_parole_reports SET
        victim_views = ?, community_perspectives = ?, family_circumstances = ?,
        custom_matters = ?, rehabilitation_plan = ?, community_safety_assessment = ?,
        submission_date = NOW(), updated_at = NOW()
       WHERE application_id = ?`,
      [
        payload.victimViews || null,
        payload.communityPerspectives || null,
        payload.familyCircumstances || null,
        payload.customMatters || null,
        payload.rehabilitationPlan || null,
        payload.communitySafetyAssessment || null,
        applicationId,
      ]
    );
    return existing[0].id;
  }

  const id = newId('PPR');
  await query(
    `INSERT INTO pre_parole_reports
      (id, application_id, created_by_probation_officer_id, victim_views, community_perspectives,
       family_circumstances, custom_matters, rehabilitation_plan, community_safety_assessment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, applicationId, officerId,
      payload.victimViews || null,
      payload.communityPerspectives || null,
      payload.familyCircumstances || null,
      payload.customMatters || null,
      payload.rehabilitationPlan || null,
      payload.communitySafetyAssessment || null,
    ]
  );
  return id;
}

async function getDetaineeReport(applicationId) {
  const rows = await query(
    'SELECT * FROM detainee_assessment_reports WHERE application_id = ? LIMIT 1',
    [applicationId]
  );
  return rows[0] || null;
}

async function getPreParoleReport(applicationId) {
  const rows = await query(
    'SELECT * FROM pre_parole_reports WHERE application_id = ? LIMIT 1',
    [applicationId]
  );
  return rows[0] || null;
}

async function createBoardHearing(applicationId, payload, scheduledBy) {
  const id = newId('BH');
  await query(
    `INSERT INTO board_hearings
      (id, application_id, hearing_date, hearing_time, location, interview_notes,
       chairman_id, doctor_id, cs_commissioner_id, scheduled_by, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled')`,
    [
      id, applicationId, payload.hearingDate, payload.hearingTime || null,
      payload.location || null, payload.interviewNotes || null,
      payload.chairmanId || null, payload.doctorId || null,
      payload.csCommissionerId || null, scheduledBy,
    ]
  );
  return id;
}

async function getBoardHearingByApplication(applicationId) {
  const rows = await query(
    `SELECT * FROM board_hearings WHERE application_id = ? ORDER BY created_at DESC LIMIT 1`,
    [applicationId]
  );
  return rows[0] || null;
}

async function getOrCreateBoardDecision(hearingId, applicationId) {
  const rows = await query('SELECT * FROM board_decisions WHERE hearing_id = ? LIMIT 1', [hearingId]);
  if (rows.length) return rows[0];
  const id = newId('BD');
  await query(
    `INSERT INTO board_decisions (id, hearing_id, application_id) VALUES (?, ?, ?)`,
    [id, hearingId, applicationId]
  );
  const created = await query('SELECT * FROM board_decisions WHERE id = ? LIMIT 1', [id]);
  return created[0];
}

async function updateBoardDecision(decisionId, patch) {
  const sets = [];
  const params = [];
  Object.entries(patch).forEach(([col, val]) => {
    sets.push(`${col} = ?`);
    params.push(val);
  });
  if (!sets.length) return;
  sets.push('updated_at = NOW()');
  params.push(decisionId);
  await query(`UPDATE board_decisions SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function getBoardDecisionByApplication(applicationId) {
  const rows = await query(
    'SELECT * FROM board_decisions WHERE application_id = ? ORDER BY created_at DESC LIMIT 1',
    [applicationId]
  );
  return rows[0] || null;
}

async function createParoleSupervision(applicationId, officerId, payload, orderDocument) {
  const id = newId('PS');
  await query(
    `INSERT INTO parole_supervision
      (id, application_id, assigned_parole_officer_id, supervision_start_date,
       supervision_end_date, compliance_notes, order_document)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id, applicationId, officerId,
      payload.supervisionStartDate,
      payload.supervisionEndDate || null,
      payload.complianceNotes || null,
      jsonStringify(orderDocument),
    ]
  );
  return id;
}

async function insertAudit(user, action, entity, entityId, details) {
  await query(
    `INSERT INTO audit_logs
      (id, user_id, user_name, role, action, entity, entity_id, details, logged_at, success)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)`,
    [
      newId('AUD'),
      user?.id || null,
      user ? `${user.firstName} ${user.lastName}` : 'System',
      user?.role || 'System',
      action,
      entity,
      entityId,
      details,
    ]
  );
}

function mapForm1Row(row) {
  if (!row) return null;
  return {
    id: row.id,
    applicationId: row.application_id,
    sponsorName: row.sponsor_name,
    sponsorRelationship: row.sponsor_relationship,
    sponsorContact: row.sponsor_contact,
    sponsorAddress: row.sponsor_address,
    proposedResidence: row.proposed_residence,
    proposedResidenceProvince: row.proposed_residence_province,
    employmentPlans: row.employment_plans,
    communityServicePlans: row.community_service_plans,
    prisonerConsent: row.prisoner_consent == null ? null : !!row.prisoner_consent,
    consentDate: row.consent_date,
    signature: row.signature_placeholder,
    sectionSnapshot: jsonParse(row.section_snapshot, null),
    generatedDate: row.generated_date,
    printedDate: row.printed_date,
    generatedBy: row.generated_by,
  };
}

async function getForm1Data(applicationId) {
  const rows = await query('SELECT * FROM form1_data WHERE application_id = ? LIMIT 1', [applicationId]);
  return mapForm1Row(rows[0]);
}

async function upsertForm1Data(applicationId, payload, generatedBy) {
  const existing = await getForm1Data(applicationId);
  const snapshot = jsonStringify(payload.sectionSnapshot || payload);

  if (existing) {
    await query(
      `UPDATE form1_data SET
        sponsor_name = ?, sponsor_relationship = ?, sponsor_contact = ?, sponsor_address = ?,
        proposed_residence = ?, proposed_residence_province = ?,
        employment_plans = ?, community_service_plans = ?,
        prisoner_consent = ?, consent_date = ?, signature_placeholder = ?,
        section_snapshot = ?, generated_date = COALESCE(generated_date, NOW()),
        printed_date = ?, generated_by = COALESCE(generated_by, ?), updated_at = NOW()
       WHERE application_id = ?`,
      [
        payload.sponsorName || payload.sponsor_name || null,
        payload.sponsorRelationship || payload.sponsor_relationship || null,
        payload.sponsorContact || payload.sponsor_contact || null,
        payload.sponsorAddress || payload.sponsor_address || null,
        payload.proposedResidence || payload.proposed_residence || null,
        payload.proposedResidenceProvince || payload.proposed_residence_province || null,
        payload.employmentPlans || payload.employment_plans || null,
        payload.communityServicePlans || payload.community_service_plans || null,
        payload.prisonerConsent != null ? (payload.prisonerConsent ? 1 : 0) : null,
        payload.consentDate || payload.consent_date || null,
        payload.signature || payload.signature_placeholder || null,
        snapshot,
        payload.printedDate || null,
        generatedBy,
        applicationId,
      ]
    );
    return getForm1Data(applicationId);
  }

  const id = newId('F1');
  await query(
    `INSERT INTO form1_data
      (id, application_id, sponsor_name, sponsor_relationship, sponsor_contact, sponsor_address,
       proposed_residence, proposed_residence_province, employment_plans, community_service_plans,
       prisoner_consent, consent_date, signature_placeholder, section_snapshot, generated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, applicationId,
      payload.sponsorName || payload.sponsor_name || null,
      payload.sponsorRelationship || payload.sponsor_relationship || null,
      payload.sponsorContact || payload.sponsor_contact || null,
      payload.sponsorAddress || payload.sponsor_address || null,
      payload.proposedResidence || payload.proposed_residence || null,
      payload.proposedResidenceProvince || payload.proposed_residence_province || null,
      payload.employmentPlans || payload.employment_plans || null,
      payload.communityServicePlans || payload.community_service_plans || null,
      payload.prisonerConsent != null ? (payload.prisonerConsent ? 1 : 0) : null,
      payload.consentDate || payload.consent_date || null,
      payload.signature || payload.signature_placeholder || null,
      snapshot,
      generatedBy,
    ]
  );
  return getForm1Data(applicationId);
}

async function markForm1Printed(applicationId) {
  await query('UPDATE form1_data SET printed_date = NOW() WHERE application_id = ?', [applicationId]);
}

async function getBoardHearingById(hearingId) {
  const rows = await query('SELECT * FROM board_hearings WHERE id = ? LIMIT 1', [hearingId]);
  return rows[0] || null;
}

async function getInstitutionById(institutionId) {
  const rows = await query('SELECT * FROM institutions WHERE id = ? LIMIT 1', [institutionId]);
  return rows[0] || null;
}

module.exports = {
  newId,
  mapApplicationRow,
  getPrisonerById,
  updatePrisonerEligibilityFields,
  getApplicationById,
  getApplicationWithPrisoner,
  findAct1991ApplicationForPrisoner,
  createAct1991Application,
  updateApplicationStatus,
  logTransition,
  logParoleNotification,
  hasNotificationLog,
  createSystemNotification,
  getEligibleList,
  getPendingEligibilityApplications,
  upsertDetaineeReport,
  upsertPreParoleReport,
  getDetaineeReport,
  getPreParoleReport,
  createBoardHearing,
  getBoardHearingByApplication,
  getOrCreateBoardDecision,
  updateBoardDecision,
  getBoardDecisionByApplication,
  createParoleSupervision,
  insertAudit,
  getForm1Data,
  upsertForm1Data,
  markForm1Printed,
  getBoardHearingById,
  getInstitutionById,
  getApplicationBundleByPrisonerId,
  mapForm1Row,
};
