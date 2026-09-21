function jsonParse(val, fallback = null) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function jsonStringify(val) {
  return val == null ? null : JSON.stringify(val);
}

function toMysqlDatetime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function mapInstitutionRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    province: row.province || '',
    address: row.address || '',
    location: row.location || row.address || '',
    status: row.status,
    commanderId: row.commander_id,
    capacity: row.capacity,
    phone: row.phone || '',
    email: row.email || '',
  };
}

function mapUserRow(row) {
  return {
    id: row.id,
    officerId: row.officer_id,
    employeeNumber: row.employee_number,
    username: row.username,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    rank: row.rank,
    institutionId: row.institution_id,
    province: row.province || '',
    position: row.position,
    phone: row.phone || '',
    employmentStatus: row.employment_status,
    accountStatus: row.account_status,
    boardPosition: row.board_position,
    status: row.status,
    dateAppointed: row.date_appointed,
    lastLogin: row.last_login ? new Date(row.last_login).toISOString() : null,
    profilePhoto: row.profile_photo,
  };
}

function mapDocumentRow(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.mime_type,
    size: row.file_size,
    dataUrl: row.data_url,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at ? new Date(row.uploaded_at).toISOString() : null,
  };
}

function mapPrisonerRow(row, documents = null) {
  const extra = jsonParse(row.extra_attributes, {});
  const docs = documents != null ? documents : jsonParse(row.documents, []);
  return {
    id: row.id,
    prisonerNumber: row.prisoner_number,
    institutionId: row.institution_id,
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    offense: row.offense,
    sentenceStartDate: row.sentence_start_date,
    sentenceEndDate: row.sentence_end_date,
    status: row.status,
    paroleEligibilityDate: row.parole_eligibility_date || extra.paroleEligibilityDate || null,
    statusUpdatedAt: row.status_updated_at ? new Date(row.status_updated_at).toISOString() : extra.statusUpdatedAt || null,
    sentenceDurationMonths: extra.sentenceDurationMonths ?? null,
    sentenceServedPercent: extra.sentenceServedPercent ?? null,
    computedStatus: extra.computedStatus ?? null,
    documents: docs,
    extraAttributes: extra,
    ...extra,
  };
}

function mapApplicationRow(row) {
  const formData = jsonParse(row.form_data, {}) || {};
  const sidecar = formData.__pmsAppState && typeof formData.__pmsAppState === 'object' ? formData.__pmsAppState : {};
  const packedRelease = sidecar.releaseInfo || formData.__pmsReleaseInfo || null;
  const packedReview = sidecar.commanderReview || formData.__pmsCommanderReview || null;
  const releasedOnParole = sidecar.status === 'Released on Parole' || packedRelease?.releasedOnParoleAt;
  const released = sidecar.status === 'Released' || packedRelease?.authorizedAt;
  let status = row.status || sidecar.status || 'Draft';
  if (releasedOnParole && status !== 'Released on Parole') status = 'Released on Parole';
  else if (released && status !== 'Released' && status !== 'Released on Parole') status = 'Released';
  return {
    id: row.id,
    prisonerId: row.prisoner_id,
    institutionId: row.institution_id,
    status,
    submittedAt: row.submitted_at,
    submittedBy: row.submitted_by,
    formData,
    forms: jsonParse(row.form_uploads, null),
    boardDecision: jsonParse(row.board_decision, null) || sidecar.boardDecision || null,
    workflowNotes: jsonParse(row.workflow_notes, []) || sidecar.workflowNotes || [],
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    caseNumber: sidecar.caseNumber || null,
    archived: sidecar.archived != null ? !!sidecar.archived : !!formData.__pmsAppState?.archived,
    archivedAt: sidecar.archivedAt || null,
    archivedBy: sidecar.archivedBy || null,
    archiveReason: sidecar.archiveReason || null,
    commanderReview: packedReview,
    commanderVerificationDraft: sidecar.commanderVerificationDraft || null,
    hearingSchedulingAt: sidecar.hearingSchedulingAt || null,
    releaseInfo: packedRelease,
    approvalSteps: sidecar.approvalSteps || formData.__pmsApprovalSteps || [],
    guarantors: sidecar.guarantors || [],
    boardAssessments: sidecar.boardAssessments || formData.__pmsBoardAssessments || [],
    hearingSession: sidecar.hearingSession || formData.__pmsHearingSession || null,
    preParoleReport: sidecar.preParoleReport || null,
    paroleScore: sidecar.paroleScore || null,
    demoStage: sidecar.demoStage || null,
    lastModifiedForm: sidecar.lastModifiedForm || null,
    lastModifiedLabel: sidecar.lastModifiedLabel || null,
    updatedAt: sidecar.updatedAt || null,
  };
}

function normalizeHearingDateFromDb(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}

function mapHearingRow(row) {
  let notes = row.notes || '';
  let extra = {};
  if (typeof notes === 'string' && notes.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(notes);
      if (parsed && parsed.__pmsHearing === true) {
        notes = parsed.notes || '';
        extra = parsed.extra && typeof parsed.extra === 'object' ? parsed.extra : {};
      }
    } catch (_) { /* plain-text notes */ }
  }
  return {
    id: row.id,
    applicationId: row.application_id,
    prisonerId: row.prisoner_id,
    institutionId: row.institution_id,
    scheduledDate: normalizeHearingDateFromDb(row.scheduled_date),
    scheduledTime: row.scheduled_time,
    location: row.location,
    notes,
    status: row.status,
    ...extra,
  };
}

function mapNotificationRow(row) {
  const meta = jsonParse(row.meta, {});
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    recipientRole: row.recipient_role,
    recipientUserId: row.recipient_user_id,
    institutionId: row.institution_id,
    prisonerId: row.prisoner_id,
    eligibleDate: row.eligible_date,
    read: !!row.is_read,
    resolved: !!row.is_resolved,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    ...meta,
  };
}

function mapAuditRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    role: row.role,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    details: row.details,
    timestamp: row.logged_at ? new Date(row.logged_at).toISOString() : null,
    ipAddress: row.ip_address,
    previousValues: jsonParse(row.previous_values, null),
    newValues: jsonParse(row.new_values, null),
    denied: !!row.denied,
    success: row.success !== 0,
  };
}

function mapReportRow(row) {
  const content = jsonParse(row.content, {});
  return {
    id: row.id,
    institutionId: row.institution_id,
    type: row.type,
    title: row.title,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    ...content,
  };
}

function prisonerExtraAttributes(p) {
  const skip = new Set([
    'id', 'prisonerNumber', 'institutionId', 'firstName', 'lastName', 'dateOfBirth', 'gender',
    'offense', 'sentenceStartDate', 'sentenceEndDate', 'status', 'paroleEligibilityDate',
    'statusUpdatedAt', 'documents', 'extraAttributes',
  ]);
  const extra = { ...(p.extraAttributes && typeof p.extraAttributes === 'object' ? p.extraAttributes : {}) };
  Object.keys(p || {}).forEach((key) => {
    if (skip.has(key) || p[key] == null) return;
    extra[key] = p[key];
  });
  if (p.sentenceDurationMonths != null) extra.sentenceDurationMonths = p.sentenceDurationMonths;
  if (p.sentenceServedPercent != null) extra.sentenceServedPercent = p.sentenceServedPercent;
  if (p.computedStatus) extra.computedStatus = p.computedStatus;
  return Object.keys(extra).length ? extra : null;
}

module.exports = {
  jsonParse,
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
  prisonerExtraAttributes,
};
