/**
 * PMS Storage — in-memory data layer with MySQL sync via /api/bootstrap.
 * Falls back to localStorage when the API server is unavailable.
 */
const PMSStorage = (() => {
  const LS_KEY = 'pms_mock_data_v5';
  const SESSION_KEY = 'pms_session';
  const API_BASE_KEY = 'pms_api_base';
  const API_TOKEN_KEY = 'pms_api_token';

  const DEMO_PASSWORDS = {
    admin: 'admin123',
    'john.dole@cs.gov.pg': 'Password123!',
    'mary.kila@djag.gov.pg': 'Password123!',
    'officer.tau@cs.gov.pg': 'Password123!',
    'secretary.morris@djag.gov.pg': 'Password123!',
    'dr.sine@health.gov.pg': 'Password123!',
    'commissioner.bain@cs.gov.pg': 'Password123!',
    'pkoroma@cs.gov.pg': 'Password123!',
  };

  function hashPassword(password) {
    let h = 5381;
    for (let i = 0; i < password.length; i += 1) {
      h = ((h << 5) + h) ^ password.charCodeAt(i);
    }
    return `sha1:${(h >>> 0).toString(16)}`;
  }

  function verifyPassword(stored, password) {
    if (!stored) return false;
    if (stored.startsWith('sha1:')) return stored === hashPassword(password);
    return stored === password;
  }

  function setUserPassword(username, password) {
    DEMO_PASSWORDS[username] = hashPassword(password);
  }

  const USER_ROLES = [
    'System Administrator', 'CS Parole Officer', 'PNGCS Parole Clerk', 'Jail Commander',
    'DJAG Parole Clerk', 'DJAG Secretary', 'Doctor', 'CS Commissioner', 'Parole Board Member',
  ];
  const OFFICER_ROLES = USER_ROLES.filter((r) => r !== 'System Administrator');
  const BOARD_POSITIONS = ['Chairperson', 'Commissioner PNGCS', 'Medical Member', 'DJAG Secretary'];
  const PAROLE_APPROVAL_THRESHOLD = 80;
  const HEARING_DEADLINE_DAYS = 14;
  const BOARD_ASSESSOR_ROLES = Object.freeze(['Doctor', 'CS Commissioner', 'DJAG Secretary', 'Parole Board Member']);
  const BOARD_VOTING_ROLES = BOARD_ASSESSOR_ROLES;

  function normalizeBoardVote(vote) {
    const map = {
      Approved: 'Approved', Approve: 'Approved', Grant: 'Approved',
      Refused: 'Refused', Refuse: 'Refused', Deny: 'Refused', Denied: 'Refused',
      Deferred: 'Deferred', Defer: 'Deferred',
    };
    return map[vote] || vote;
  }
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCKOUT_MINUTES = 15;
  const loginAttempts = {};
  const PAROLE_FORMS = [
    { number: 1, name: 'Form 1 — Parole Eligibility Screening' },
    { number: 2, name: 'Form 2 — Assessment Records (DDR & PPR)' },
    { number: 3, name: 'Form 3 — Institutional Report' },
    { number: 4, name: 'Form 4 — Parole Granted' },
    { number: 5, name: 'Form 5 — Parole Refused' },
  ];
  const APPLICATION_STATUSES = [
    'Draft', 'Submitted', 'Under DJAG Review', 'Returned for Correction',
    'Pending Commander Review', 'Pre-Parole Report Prepared', 'Hearing Scheduled',
    'Pending Board Review', 'Parole Granted', 'Parole Refused', 'Pending Approval',
    'Approved', 'Deferred', 'Refused', 'Released',
  ];
  const HEARING_STATUSES = ['Pending', 'Scheduled', 'Upcoming', 'In Progress', 'Completed', 'Cancelled', 'Rescheduled'];
  const APPROVAL_DECISIONS = ['Pending Approval', 'Approved', 'Rejected', 'Returned for Correction'];
  const BOARD_CONTRACT_YEARS = 5;
  const CONTRACT_REMINDER_DAYS = [90, 30, 7];
  const DOCUMENT_CATEGORIES = ['Form', 'Assessment', 'Report', 'Supporting Document', 'Identification', 'Medical', 'Court', 'Other'];
  const PRISONER_STATUSES = [
    'Not Eligible',
    'Awaiting Eligibility',
    'Eligible for Parole Application',
    'Case Started',
    'Assessment in Progress',
    'Hearing Pending',
    'Hearing Scheduled',
    'Board Review',
    'Approved',
    'Refused',
    'Rejected',
    'Released on Parole',
    'Released',
    'Sentence Completed',
  ];
  const DEFAULT_SETTINGS = {
    paroleEligibilityFraction: 1 / 3,
    paroleEligibilityLabel: 'One-third (1/3) of total sentence',
    systemName: 'Parole Management System',
  };

  let data = null;
  let session = null;
  let loaded = false;
  let loadPromise = null;
  let dbSyncEnabled = false;
  let syncTimer = null;

  function getApiBaseUrl() {
    if (typeof window !== 'undefined' && window.PMS_API_BASE) return window.PMS_API_BASE.replace(/\/$/, '');
    if (typeof PMSApi !== 'undefined') return PMSApi.getBaseUrl();
    try {
      const stored = localStorage.getItem(API_BASE_KEY);
      if (stored) return stored.replace(/\/$/, '');
    } catch (_) { /* ignore */ }
    return 'http://localhost:3000';
  }

  async function fetchWithTimeout(url, options = {}, ms = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${Math.round(ms / 1000)}s (${url})`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function pushSnapshotToDatabase(snapshot, passwords = DEMO_PASSWORDS) {
    const res = await fetchWithTimeout(`${getApiBaseUrl()}/api/bootstrap`, {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          settings: snapshot.settings,
          institutions: snapshot.institutions,
          users: snapshot.users,
          prisoners: snapshot.prisoners,
          applications: snapshot.applications,
          hearings: snapshot.hearings,
          notifications: snapshot.notifications,
          auditLogs: snapshot.auditLogs,
          reports: snapshot.reports || [],
          idCounters: snapshot.idCounters || {},
        },
        demoPasswords: passwords,
      }),
    });
    const payload = await res.json();
    if (!res.ok || payload.success === false) {
      throw new Error(payload.error || 'Failed to push data to database');
    }
    return payload;
  }

  function readLocalSnapshot() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function getAuthHeaders(contentType = true) {
    const headers = { Accept: 'application/json' };
    if (contentType) headers['Content-Type'] = 'application/json';
    if (typeof PMSApi !== 'undefined' && PMSApi.getAuthHeaders) {
      return PMSApi.getAuthHeaders(headers);
    }
    try {
      const token = sessionStorage.getItem(API_TOKEN_KEY);
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch (_) { /* ignore */ }
    return headers;
  }

  async function loadFromDatabase() {
    const res = await fetchWithTimeout(`${getApiBaseUrl()}/api/bootstrap`, {
      headers: getAuthHeaders(false),
    });
    if (res.status === 401) {
      const err = new Error('Authentication required.');
      err.status = 401;
      throw err;
    }
    const payload = await res.json();
    if (!res.ok || !payload.success || !payload.data) {
      throw new Error(payload.error || 'Bootstrap failed');
    }
    return payload.data;
  }

  async function syncToDatabase() {
    if (!dbSyncEnabled || !data) return;
    const snapshot = {
      settings: data.settings,
      institutions: data.institutions,
      users: data.users,
      prisoners: data.prisoners,
      applications: data.applications,
      hearings: data.hearings,
      notifications: data.notifications,
      auditLogs: data.auditLogs,
      reports: data.reports || [],
      idCounters: data.idCounters || {},
    };
    const res = await fetch(`${getApiBaseUrl()}/api/bootstrap`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ data: snapshot, demoPasswords: DEMO_PASSWORDS }),
    });
    if (res.status === 401) {
      clearSession();
      throw new Error('Session expired. Please sign in again.');
    }
    const payload = await res.json();
    if (!res.ok || payload.success === false) {
      throw new Error(payload.error || 'Database sync failed');
    }
  }

  async function flushSyncToDatabase() {
    clearTimeout(syncTimer);
    if (dbSyncEnabled && data) await syncToDatabase();
  }

  function generateId(entityType) {
    return PMSIdGenerator.next(data, entityType);
  }

  function buildDefaultInstitutions() {
    const rows = typeof PNGCS_INSTITUTIONS !== 'undefined' && PNGCS_INSTITUTIONS.length
      ? PNGCS_INSTITUTIONS
      : [{ name: 'Bomana Correctional Institution', province: 'National Capital District', address: 'Port Moresby' }];
    return rows.map((row, i) => {
      const id = `INS-${String(i + 1).padStart(6, '0')}`;
      return {
        id,
        code: id,
        name: row.name,
        province: row.province,
        address: row.address,
        location: row.address,
        status: 'Active',
        capacity: null,
        phone: '',
        email: '',
      };
    });
  }

  function normalizeInstitution(inst) {
    const address = inst.address || inst.location || '';
    return {
      ...inst,
      province: inst.province || '',
      address,
      location: address,
    };
  }

  function seedData() {
    const now = new Date().toISOString();
    const institutions = buildDefaultInstitutions();
    if (institutions[0]) institutions[0].commanderId = 'USR-000028';
    const seed = {
      settings: { ...DEFAULT_SETTINGS },
      institutions,
      users: [
        { id: 'USR-000001', officerId: null, employeeNumber: null, username: 'admin', email: 'admin@pms.gov.pg', firstName: 'System', lastName: 'Administrator', role: 'System Administrator', rank: 'Administrator', institutionId: null, province: '', position: 'Administrator', phone: '', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2018-01-01', lastLogin: '2026-07-30T09:00:00.000Z', profilePhoto: null },
        { id: 'USR-000002', officerId: 'OFF-000001', employeeNumber: 'EMP-000002', username: 'john.dole@cs.gov.pg', email: 'john.dole@cs.gov.pg', firstName: 'John', lastName: 'Dole', role: 'PNGCS Parole Clerk', rank: 'Parole Clerk', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Clerk', phone: '+675 7123 4567', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2020-05-10', lastLogin: '2026-07-29T14:00:00.000Z', profilePhoto: null },
        { id: 'USR-000003', officerId: 'OFF-000002', employeeNumber: 'EMP-000003', username: 'mary.kila@djag.gov.pg', email: 'mary.kila@djag.gov.pg', firstName: 'Mary', lastName: 'Kila', role: 'DJAG Parole Clerk', rank: 'Parole Clerk', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Clerk', phone: '+675 7234 5678', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2021-03-22', lastLogin: '2026-07-28T11:00:00.000Z', profilePhoto: null },
        { id: 'USR-000005', officerId: 'OFF-000004', employeeNumber: 'EMP-000005', username: 'judge.kakaraya@justice.gov.pg', email: 'judge.kakaraya@justice.gov.pg', firstName: 'Francis', lastName: 'Kakaraya', role: 'Parole Board Member', rank: 'Board Member', institutionId: 'INS-000001', province: 'National Capital District', position: 'Board Member', phone: '+675 7456 7890', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'Chairperson', contractStartDate: '2021-01-01', contractExpiryDate: '2027-12-31', contractStatus: 'Active', status: 'Active', dateAppointed: '2016-11-05', lastLogin: '2026-07-27T10:00:00.000Z', profilePhoto: null },
        { id: 'USR-000024', officerId: 'OFF-000024', employeeNumber: 'EMP-000024', username: 'officer.tau@cs.gov.pg', email: 'officer.tau@cs.gov.pg', firstName: 'Samuel', lastName: 'Tau', role: 'CS Parole Officer', rank: 'Parole Officer', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Officer', phone: '+675 7123 4500', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2021-08-01', lastLogin: '2026-07-20T09:00:00.000Z', profilePhoto: null },
        { id: 'USR-000025', officerId: 'OFF-000025', employeeNumber: 'EMP-000025', username: 'secretary.morris@djag.gov.pg', email: 'secretary.morris@djag.gov.pg', firstName: 'Helen', lastName: 'Morris', role: 'DJAG Secretary', rank: 'Secretary', institutionId: 'INS-000001', province: 'National Capital District', position: 'DJAG Secretary', phone: '+675 7234 5600', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'DJAG Secretary', contractStartDate: '2022-01-01', contractExpiryDate: '2027-01-01', contractStatus: 'Active', status: 'Active', dateAppointed: '2020-02-15', lastLogin: '2026-07-22T10:00:00.000Z', profilePhoto: null },
        { id: 'USR-000026', officerId: 'OFF-000026', employeeNumber: 'EMP-000026', username: 'dr.sine@health.gov.pg', email: 'dr.sine@health.gov.pg', firstName: 'Ruth', lastName: 'Sine', role: 'Doctor', rank: 'Medical Officer', institutionId: 'INS-000001', province: 'National Capital District', position: 'Medical Board Member', phone: '+675 7345 6700', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'Medical Member', contractStartDate: '2022-01-01', contractExpiryDate: '2027-01-01', contractStatus: 'Active', status: 'Active', dateAppointed: '2019-05-01', lastLogin: '2026-07-18T11:00:00.000Z', profilePhoto: null },
        { id: 'USR-000027', officerId: 'OFF-000027', employeeNumber: 'EMP-000027', username: 'commissioner.bain@cs.gov.pg', email: 'commissioner.bain@cs.gov.pg', firstName: 'Thomas', lastName: 'Bain', role: 'CS Commissioner', rank: 'Commissioner', institutionId: 'INS-000001', province: 'National Capital District', position: 'Commissioner PNGCS', phone: '+675 7345 6800', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'Commissioner PNGCS', contractStartDate: '2022-01-01', contractExpiryDate: '2027-01-01', contractStatus: 'Active', status: 'Active', dateAppointed: '2018-03-01', lastLogin: '2026-07-19T09:30:00.000Z', profilePhoto: null },
        { id: 'USR-000028', officerId: 'OFF-000028', employeeNumber: 'EMP-000028', username: 'pkoroma@cs.gov.pg', email: 'pkoroma@cs.gov.pg', firstName: 'Peter', lastName: 'Koroma', role: 'Jail Commander', rank: 'Commander', institutionId: 'INS-000001', province: 'National Capital District', position: 'Jail Commander — Bomana', phone: '+675 7123 4600', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2019-04-01', lastLogin: '2026-07-25T08:00:00.000Z', profilePhoto: null },
      ],
      prisoners: [
        { id: 'PR-000001', prisonerNumber: 'PR-000001', institutionId: 'INS-000001', firstName: 'Paul', lastName: 'Kaupa', dateOfBirth: '1992-04-10', gender: 'Male', offense: 'Armed Robbery', sentenceStartDate: '2020-01-15', sentenceEndDate: '2030-01-15', status: 'Eligible for Parole', documents: [] },
        { id: 'PR-000002', prisonerNumber: 'PR-000002', institutionId: 'INS-000001', firstName: 'Peter', lastName: 'Wama', dateOfBirth: '1988-09-18', gender: 'Male', offense: 'Unlawful Wounding', sentenceStartDate: '2019-06-01', sentenceEndDate: '2027-06-01', status: 'In Custody', documents: [] },
        { id: 'PR-000003', prisonerNumber: 'PR-000003', institutionId: 'INS-000001', firstName: 'Sarah', lastName: 'Tekate', dateOfBirth: '1995-12-01', gender: 'Female', offense: 'Grand Larceny', sentenceStartDate: '2022-03-10', sentenceEndDate: '2028-03-10', status: 'In Custody', documents: [] },
      ],
      offenses: [],
      applications: [
        {
          id: 'APP-000001', caseNumber: 'PMS-2026-000001', prisonerId: 'PR-000001', institutionId: 'INS-000001', status: 'Hearing Scheduled',
          submittedAt: '2026-06-15', submittedBy: 'USR-000002',
          formData: {
            form1: {
              formId: 'F1-000001',
              status: 'submitted',
              screeningDate: '2026-06-15',
              eligibilityOutcome: 'eligible',
              recommendationReason: 'Meets one-third sentence threshold and eligibility criteria.',
              officerName: 'John Dole',
              officerId: 'OFF-000001',
              submittedAt: '2026-06-15T10:30:00.000Z',
              submittedBy: 'USR-000002',
              statutoryExemptionApplicable: 'no',
              victimNotificationRequired: 'no',
              prisonerSignatureDate: '2026-06-14',
            },
            form2: { formId: 'F2-000001', nextOfKinName: 'Samuel Kaupa', nextOfKinContact: '+675 7123 4567', guarantorName: 'Samuel Kaupa' },
            form3: { formId: 'F3-000001', institutionalRecommendation: 'Recommended', status: 'approved', submitted: true, officerName: 'John Dole' }, form4: {}, form5: {},
          },
          boardDecision: null, workflowNotes: [], createdAt: now,
        },
        {
          id: 'APP-000002', caseNumber: 'PMS-2026-000002', prisonerId: 'PR-000002', institutionId: 'INS-000001', status: 'Draft',
          submittedAt: null, submittedBy: null,
          formData: {
            form1: {
              formId: 'F1-000002',
              status: 'submitted',
              screeningDate: '2026-08-01',
              eligibilityOutcome: 'eligible',
              recommendationReason: 'Eligible under one-third rule — Peter Wama.',
              officerName: 'John Dole',
              submittedAt: '2026-08-01T09:00:00.000Z',
              submittedBy: 'USR-000002',
            },
            form2: { formId: 'F2-000002', sections: {} },
            form3: {}, form4: {}, form5: {},
          },
          boardDecision: null, workflowNotes: [], createdAt: now,
        },
        {
          id: 'APP-000003', caseNumber: 'PMS-2026-000003', prisonerId: 'PR-000002', institutionId: 'INS-000001', status: 'Approved',
          submittedAt: '2025-11-01', submittedBy: 'USR-000002',
          formData: {
            form1: { formId: 'F1-000002', status: 'submitted', eligibilityOutcome: 'eligible', screeningDate: '2026-05-01', officerName: 'John Dole', recommendationReason: 'Eligible under PMS one-third rule.' },
            form2: { formId: 'F2-000002', nextOfKinName: 'Grace Wama' },
            form3: { formId: 'F3-000001', commanderRecommendation: 'Recommended' },
            form4: { formId: 'F4-000001', investigationSummary: 'Community support verified' },
            form5: { formId: 'F5-000001', boardDecision: 'Approved', conditions: 'Monthly reporting to PNGCS' },
          },
          boardDecision: { outcome: 'Approved', conditions: 'Monthly reporting to PNGCS', deliberationNotes: 'Unanimous approval', decidedBy: 'USR-000005', decidedAt: '2026-01-20' },
          workflowNotes: [], createdAt: '2025-10-01T00:00:00.000Z',
        },
        {
          id: 'APP-000004', caseNumber: 'PMS-2026-000004', prisonerId: 'PR-000003', institutionId: 'INS-000001', status: 'Draft',
          submittedAt: null, submittedBy: null,
          formData: {
            form1: {
              formId: 'F1-000003',
              status: 'submitted',
              screeningDate: '2026-07-01',
              eligibilityOutcome: 'eligible',
              recommendationReason: 'Meets eligibility threshold.',
              officerName: 'John Dole',
              submittedAt: '2026-07-01T09:00:00.000Z',
              submittedBy: 'USR-000002',
            },
            form2: {
              formId: 'F2-000003',
              sections: {
                ddr: {
                  submitted: true,
                  confirmed: true,
                  status: 'submitted',
                  officerName: 'John Dole',
                  darOfficer: 'John Dole',
                  submittedAt: '2026-07-10T10:00:00.000Z',
                },
                ppr: {},
              },
            },
            form3: {}, form4: {}, form5: {},
          },
          boardDecision: null, workflowNotes: [], createdAt: now,
        },
      ],
      hearings: [
        { id: 'HRG-000001', applicationId: 'APP-000001', prisonerId: 'PR-000001', institutionId: 'INS-000001', scheduledDate: '2026-08-15', scheduledTime: '10:00', location: 'Parole Board Hearing Room A', notes: 'Initial board hearing', status: 'Scheduled' },
        { id: 'HRG-000002', applicationId: 'APP-000002', prisonerId: 'PR-000002', institutionId: 'INS-000001', scheduledDate: '2026-09-08', scheduledTime: '09:30', location: 'Parole Board Hearing Room B', notes: 'Board review — Peter Wama', status: 'Scheduled', boardMembers: ['USR-000005', 'USR-000006'] },
        { id: 'HRG-000003', applicationId: 'APP-000001', prisonerId: 'PR-000001', institutionId: 'INS-000001', scheduledDate: '2026-09-18', scheduledTime: '14:00', location: 'Parole Board Hearing Room A', notes: 'Follow-up hearing — Paul Kaupa', status: 'Upcoming', boardMembers: ['USR-000005'] },
        { id: 'HRG-000004', applicationId: 'APP-000002', prisonerId: 'PR-000002', institutionId: 'INS-000001', scheduledDate: '2026-09-25', scheduledTime: '11:00', location: 'DJAG Secretariat', notes: 'Pre-hearing briefing', status: 'Scheduled' },
      ],
      notifications: [
        { id: 'NOT-000001', type: 'eligibility', title: 'Parole Eligibility Alert', message: 'Paul Kaupa (PR-000001) has reached parole eligibility threshold.', recipientRole: 'PNGCS Parole Clerk', recipientUserId: 'USR-000002', institutionId: 'INS-000001', prisonerId: 'PR-000001', eligibleDate: '2025-01-15', linkPanel: 'eligibility', read: false, resolved: false, createdAt: '2026-01-15T08:00:00.000Z', dedupeKey: 'eligibility:PR-000001:USR-000002:Parole Eligibility Alert' },
        { id: 'NOT-000002', type: 'application', title: 'New Parole Application', message: 'PNGCS submitted application for Paul Kaupa — pending DJAG review.', recipientRole: 'DJAG Parole Clerk', recipientUserId: null, institutionId: 'INS-000001', prisonerId: 'PR-000001', applicationId: 'APP-000001', linkPanel: 'applications', read: false, resolved: false, createdAt: '2026-06-15T10:30:00.000Z', dedupeKey: 'application:APP-000001:DJAG Parole Clerk:New Parole Application' },
        { id: 'NOT-000003', type: 'eligibility', title: 'Parole Eligibility Alert', message: 'Paul Kaupa (PR-000001) reached eligibility: One-third (1/3) of total sentence.', recipientRole: 'System Administrator', recipientUserId: null, institutionId: 'INS-000001', prisonerId: 'PR-000001', eligibleDate: '2025-01-15', linkPanel: 'eligibility', read: false, resolved: false, createdAt: '2026-01-15T08:00:00.000Z', dedupeKey: 'eligibility:PR-000001:System Administrator:Parole Eligibility Alert' },
        { id: 'NOT-000004', type: 'form2', title: 'Form 2 Requires Action', message: 'DAR completed — PPR section required for Sarah Tekate (PMS-2026-000004)', recipientRole: 'DJAG Parole Clerk', recipientUserId: null, institutionId: 'INS-000001', prisonerId: 'PR-000003', applicationId: 'APP-000004', linkPanel: 'applications', read: false, resolved: false, createdAt: '2026-07-10T10:05:00.000Z', dedupeKey: 'form2:APP-000004:DJAG Parole Clerk:Form 2 Requires Action' },
      ],
      auditLogs: [
        { id: 'AUD-000001', userId: 'USR-000002', userName: 'John Dole', role: 'PNGCS Parole Clerk', action: 'CREATE', entity: 'ParoleApplication', entityId: 'APP-000001', details: 'Submitted parole application for Paul Kaupa', timestamp: '2026-06-15T10:30:00.000Z' },
        { id: 'AUD-000002', userId: 'USR-000001', userName: 'System Administrator', role: 'System Administrator', action: 'LOGIN', entity: 'Session', entityId: 'USR-000001', details: 'Administrator signed in', timestamp: '2026-07-30T09:00:00.000Z' },
        { id: 'AUD-000003', userId: 'USR-000002', userName: 'John Dole', role: 'PNGCS Parole Clerk', action: 'APPROVE', entity: 'InstitutionReport', entityId: 'INS-000001', details: 'Approved institutional report', timestamp: '2026-06-20T14:00:00.000Z' },
        { id: 'AUD-000004', userId: 'USR-000005', userName: 'Francis Kakaraya', role: 'Parole Board Member', action: 'DECISION', entity: 'ParoleApplication', entityId: 'APP-000003', details: 'Board Approved — Peter Wama', timestamp: '2026-01-20T11:00:00.000Z' },
      ],
      reports: [
        { id: 'RPT-000001', institutionId: 'INS-000001', type: 'institutional', title: 'Institutional Report', status: 'Approved', createdBy: 'USR-000002', createdAt: '2026-06-20T14:00:00.000Z' },
      ],
    };
    PMSIdGenerator.ensureCounters(seed);
    return seed;
  }

  function persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) { console.warn('Storage persist failed', e); }
    if (dbSyncEnabled) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        syncToDatabase().catch((err) => console.warn('MySQL sync failed:', err.message));
      }, 400);
    }
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      session = raw ? JSON.parse(raw) : null;
    } catch { session = null; }
  }

  function saveSession(user) {
    session = user;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch (_) { /* ignore */ }
  }

  function normalizeStore(store) {
    const base = store && typeof store === 'object' ? store : seedData();
    return {
      settings: base.settings || { ...DEFAULT_SETTINGS },
      institutions: Array.isArray(base.institutions) ? base.institutions : [],
      users: Array.isArray(base.users) ? base.users : [],
      prisoners: Array.isArray(base.prisoners) ? base.prisoners : [],
      applications: Array.isArray(base.applications) ? base.applications : [],
      hearings: Array.isArray(base.hearings) ? base.hearings : [],
      notifications: Array.isArray(base.notifications) ? base.notifications : [],
      auditLogs: Array.isArray(base.auditLogs) ? base.auditLogs : [],
      reports: Array.isArray(base.reports) ? base.reports : [],
      offenses: Array.isArray(base.offenses) ? base.offenses : [],
      idCounters: base.idCounters && typeof base.idCounters === 'object' ? base.idCounters : {},
    };
  }

  async function ensureLoaded() {
    if (loaded) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      loadSession();

      let fromDb = null;
      try {
        fromDb = await loadFromDatabase();
        dbSyncEnabled = true;
      } catch (_) {
        dbSyncEnabled = false;
      }

      if (dbSyncEnabled) {
        if (!fromDb?.institutions?.length) {
          const local = readLocalSnapshot();
          if (local?.institutions?.length) {
            try {
              await pushSnapshotToDatabase(local);
              fromDb = await loadFromDatabase();
            } catch (err) {
              console.warn('Could not push localStorage to MySQL:', err.message);
            }
          }
        }
        if (fromDb?.institutions?.length) {
          const { demoPasswords, ...store } = fromDb;
          data = normalizeStore(store);
          if (demoPasswords) Object.assign(DEMO_PASSWORDS, demoPasswords);
        } else {
          data = normalizeStore(seedData());
          try { await pushSnapshotToDatabase(data); } catch (_) { /* server may seed on next request */ }
        }
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY);
          data = normalizeStore(raw ? JSON.parse(raw) : seedData());
        } catch {
          data = normalizeStore(seedData());
        }
      }

      PMSIdGenerator.ensureCounters(data);
      migrateLegacyStatuses();
      syncBoardContracts();
      migrateCaseNumbers();
      migrateNotifications();
      mergeSeedUsers();
      runEscalationChecks();
      migratePasswordHashes();
      if (typeof PMSEligibility !== 'undefined') {
        PMSEligibility.syncAllPrisoners(null, data.applications);
        persist();
      }
      loaded = true;
    })();

    try {
      await loadPromise;
    } catch (err) {
      loadPromise = null;
      throw err;
    }
  }

  function migrateLegacyStatuses() {
    if (!data.prisoners) return;
    data.prisoners.forEach((p) => {
      if (typeof PMSEligibility !== 'undefined') {
        p.status = PMSEligibility.normalizeStatus(p.status);
      }
    });
    if (data.notifications) {
      data.notifications.forEach((n) => {
        if (n.type === 'parole_eligibility') n.type = 'eligibility';
      });
    }
    migrateDemoApplications();
  }

  /** Repair demo cases where Form 1 was never seeded but Form 2 is expected (e.g. Peter Wama APP-000002). */
  function migrateDemoApplications() {
    if (!data?.applications) return;
    const app2 = data.applications.find((a) => a.id === 'APP-000002' && a.prisonerId === 'PR-000002');
    if (!app2) return;
    app2.formData = app2.formData || createEmptyFormData();
    const f1 = app2.formData.form1 || {};
    const f1Empty = !f1.status && !f1.submittedAt && !f1.eligibilityOutcome && !Object.keys(f1.sections || {}).length;
    if (!f1Empty) return;
    app2.formData.form1 = {
      formId: f1.formId || 'F1-000002',
      status: 'submitted',
      screeningDate: '2026-08-01',
      eligibilityOutcome: 'eligible',
      recommendationReason: 'Eligible under one-third rule — Peter Wama.',
      officerName: 'John Dole',
      submittedAt: '2026-08-01T09:00:00.000Z',
      submittedBy: 'USR-000002',
    };
    app2.formData.form2 = { ...(app2.formData.form2 || {}), formId: app2.formData.form2?.formId || 'F2-000002', sections: app2.formData.form2?.sections || {} };
  }

  function generateCaseNumber() {
    const year = new Date().getFullYear();
    const key = `PMS-${year}`;
    if (!data.idCounters) data.idCounters = {};
    const next = (data.idCounters[key] || 0) + 1;
    data.idCounters[key] = next;
    return `${key}-${String(next).padStart(6, '0')}`;
  }

  function migrateCaseNumbers() {
    if (!data?.applications) return;
    let changed = false;
    data.applications.forEach((a) => {
      if (!a.caseNumber) {
        a.caseNumber = a.id?.replace(/^APP-/, `PMS-${new Date().getFullYear()}-`) || generateCaseNumber();
        changed = true;
      }
    });
    if (changed) persist();
  }

  function syncBoardContracts() {
    if (!data?.users) return;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    let changed = false;
    data.users.forEach((u) => {
      const boardRoles = ['Parole Board Member', 'Doctor', 'CS Commissioner', 'DJAG Secretary'];
      if (!boardRoles.includes(u.role) && !u.contractExpiryDate) return;
      if (!u.contractExpiryDate) return;
      const expiry = new Date(u.contractExpiryDate);
      const daysLeft = Math.ceil((expiry - today) / 86400000);
      if (u.contractExpiryDate < todayStr && u.status === 'Active') {
        u.status = 'Inactive';
        u.accountStatus = 'Expired';
        u.contractStatus = 'Expired';
        changed = true;
        logAudit(null, 'UPDATE', 'User', u.id, `Board contract expired — account deactivated: ${u.username}`);
        notifyRole(u.role, 'Board Contract Expired', `Your board contract has expired. Board access is disabled.`, u.institutionId, null, u.id, { type: 'contract', userId: u.id });
        notifyRole('System Administrator', 'Board Contract Expired', `Board member ${u.firstName} ${u.lastName} contract expired`, null, null, null, { type: 'contract' });
      } else if (daysLeft > 0 && daysLeft <= 90) {
        u.contractStatus = daysLeft <= 30 ? 'Approaching Expiry' : 'Active';
        CONTRACT_REMINDER_DAYS.forEach((d) => {
          if (daysLeft <= d && daysLeft > d - 2) {
            notifyRole(u.role, 'Contract Expiry Reminder', `Your board contract expires in ${daysLeft} day(s) (${u.contractExpiryDate})`, u.institutionId, null, u.id, { type: 'contract' });
            notifyRole('System Administrator', 'Board Contract Approaching Expiry', `${u.firstName} ${u.lastName} — ${daysLeft} day(s) until contract expiry`, null, null, null, { type: 'contract' });
          }
        });
      } else if (u.contractExpiryDate >= todayStr) {
        u.contractStatus = 'Active';
      }
    });
    if (changed) persist();
  }

  function getReleaseRequirements(app) {
    if (!app) return [];
    const s = getFormCompletionSummary(app);
    const score = app.paroleScore || calculateParoleScore(app);
    return [
      { label: 'Form 1 — Eligibility Screening', met: s.checks.form1 },
      { label: 'Form 2 — DDR & PPR', met: s.checks.form2 },
      { label: 'Form 3 — Institutional Report', met: s.checks.form3 },
      { label: 'Institutional Verification', met: isCommanderVerified(app) },
      { label: 'Hearing Scheduled / Completed', met: getHearingsByApplication(app.id).some((h) => !['Cancelled'].includes(h.status)) },
      { label: 'Board Votes Complete (4 members)', met: requiredBoardAssessmentsComplete(app) },
      { label: 'Final Approval Workflow', met: requiredApprovalsComplete(app) },
      { label: 'Parole Score Calculated', met: score.complete },
      { label: score.meetsThreshold ? 'Form 4 — Parole Granted' : 'Decision Recorded', met: score.meetsThreshold ? isForm4Complete(app.formData?.form4) : isForm5Complete(app.formData?.form5) || app.status === 'Refused' },
    ];
  }

  function getCaseTracker(appId) {
    const app = getApplicationById(appId);
    if (!app) return [];
    const prisoner = getPrisonerById(app.prisonerId);
    const prog = prisoner ? getPrisonerProgress(prisoner) : { eligible: false };
    const summary = getFormCompletionSummary(app);
    const deadline = getHearingDeadlineInfo(app);
    const score = app.paroleScore || calculateParoleScore(app);
    const returned = app.status === 'Returned for Correction';
    const rejected = ['Refused', 'Parole Refused', 'Rejected'].includes(app.status);

    const stageDefs = [
      { id: 'eligibility', label: 'Eligibility', done: prog.eligible || summary.checks.form1 },
      { id: 'form1', label: 'Form 1', done: summary.checks.form1 },
      { id: 'form2', label: 'Form 2', done: summary.checks.form2 },
      { id: 'commander', label: 'Institutional Verification', done: isCommanderVerified(app) || !!app.commanderReview },
      { id: 'hearing', label: 'Hearing Scheduled', done: getHearingsByApplication(appId).some((h) => !['Cancelled', 'Pending'].includes(h.status)) },
      { id: 'assessment', label: 'Board Assessment', done: requiredBoardAssessmentsComplete(app) },
      { id: 'decision', label: 'Decision', done: score.complete || isForm4Complete(app.formData?.form4) || isForm5Complete(app.formData?.form5) },
      { id: 'approval', label: 'Approval', done: requiredApprovalsComplete(app) || app.status === 'Approved' },
      { id: 'release', label: 'Release', done: app.status === 'Released' || prisoner?.status === 'Released on Parole' },
    ];

    let currentIdx = stageDefs.findIndex((s) => !s.done);
    if (currentIdx < 0) currentIdx = stageDefs.length - 1;
    if (returned) currentIdx = Math.max(0, stageDefs.findIndex((s) => s.id === 'form2'));

    return stageDefs.map((s, i) => {
      let status = 'pending';
      if (s.done) status = 'completed';
      else if (i === currentIdx) status = 'current';
      if (returned && ['form1', 'form2'].includes(s.id) && !s.done) status = 'returned';
      if (rejected && s.id === 'decision') status = 'rejected';
      if (deadline?.overdue && s.id === 'hearing' && !s.done) status = 'overdue';
      if (app.status === 'Pending Approval' && s.id === 'approval') status = 'current';
      return { ...s, status };
    });
  }

  function getEscalations(scopeInstitutionId = null) {
    const now = Date.now();
    const items = [];
    let apps = getParoleApplications();
    if (scopeInstitutionId) apps = apps.filter((a) => a.institutionId === scopeInstitutionId);

    apps.forEach((app) => {
      const p = getPrisonerById(app.prisonerId);
      const deadline = getHearingDeadlineInfo(app);
      const base = { applicationId: app.id, caseNumber: app.caseNumber || app.id, prisonerId: app.prisonerId, institutionId: app.institutionId, prisonerName: p ? `${p.firstName} ${p.lastName}` : '—', status: app.status };

      if (deadline?.overdue) {
        items.push({ ...base, type: 'hearing_overdue', message: 'Hearing scheduling overdue', severity: 'high' });
      } else if (deadline?.warning && !deadline.scheduledDate) {
        items.push({ ...base, type: 'hearing_deadline', message: `${deadline.daysRemaining} day(s) to schedule hearing`, severity: 'medium' });
      }
      if (app.status === 'Pending Commander Review') {
        const age = now - new Date(app.updatedAt || app.createdAt).getTime();
        if (age > 7 * 86400000) items.push({ ...base, type: 'verification_stuck', message: 'Awaiting institutional verification > 7 days', severity: 'medium' });
      }
      if (app.status === 'Pending Approval') {
        items.push({ ...base, type: 'approval_pending', message: 'Pending final approval before release', severity: 'medium' });
      }
      const s = getFormCompletionSummary(app);
      if (['Draft', 'Submitted', 'Pending Commander Review'].includes(app.status) && !s.checks.form2) {
        const f2 = app.formData?.form2?.sections;
        if (f2?.ddr?.submitted && !f2?.ppr?.submitted) {
          items.push({ ...base, type: 'form2_pending', message: 'Form 2 PPR section awaiting DJAG Parole Clerk', severity: 'low' });
        } else if (f2?.ppr?.submitted && !f2?.ddr?.submitted) {
          items.push({ ...base, type: 'form2_pending', message: 'Form 2 DDR section awaiting CS Parole Clerk', severity: 'low' });
        }
      }
      if (app.status === 'Pending Board Review' && !requiredBoardAssessmentsComplete(app)) {
        items.push({ ...base, type: 'assessment_required', message: 'Board assessments incomplete', severity: 'medium' });
      }
    });

    getHearings().filter((h) => h.status === 'Upcoming' || h.status === 'Scheduled').forEach((h) => {
      const d = new Date(h.scheduledDate);
      const days = Math.ceil((d - now) / 86400000);
      if (days >= 0 && days <= 3) {
        const p = getPrisonerById(h.prisonerId);
        items.push({ type: 'hearing_approaching', applicationId: h.applicationId, caseNumber: h.caseNumber, prisonerName: p ? `${p.firstName} ${p.lastName}` : '—', message: `Hearing in ${days} day(s)`, severity: 'low', hearingId: h.id });
      }
    });

    data.users.filter((u) => u.contractStatus === 'Expired' || u.contractStatus === 'Approaching Expiry').forEach((u) => {
      items.push({ type: 'contract_expiry', userId: u.id, message: `${u.firstName} ${u.lastName} — contract ${u.contractStatus}`, severity: u.contractStatus === 'Expired' ? 'high' : 'medium' });
    });

    return items;
  }

  function runEscalationChecks() {
    checkHearingDeadlines(null);
    const escalations = getEscalations();
    escalations.filter((e) => e.severity === 'high').forEach((e) => {
      if (e.type === 'hearing_overdue') {
        notifyRole('DJAG Secretary', 'Case Overdue — Schedule Hearing', `${e.caseNumber}: ${e.message}`, e.institutionId, e.prisonerId, null, { applicationId: e.applicationId, type: 'escalation', linkPanel: 'hearings' });
      }
    });
  }

  function isForm1Verified(form1) {
    return form1?.status === 'verified' || form1?.supervisorReview?.verified === true;
  }

  function isForm3Complete(form3) {
    if (!form3) return false;
    const recommendation = form3.commanderRecommendation || form3.institutionalRecommendation || form3.recommendation;
    return !!(recommendation && (form3.status === 'approved' || form3.submitted === true || form3.status === 'submitted'));
  }

  function isForm2Complete(form2) {
    const ddr = form2?.sections?.ddr;
    const ppr = form2?.sections?.ppr;
    return !!(ddr?.submitted && ddr?.confirmed && ppr?.submitted && ppr?.confirmed);
  }

  /** DAR/DDR submitted by PNGCS — DJAG Parole Clerk must complete PPR (even if app is still Draft). */
  function needsDjagForm2Ppr(app) {
    const f2 = app?.formData?.form2?.sections;
    return !!(f2?.ddr?.submitted && !f2?.ppr?.submitted);
  }

  function getApplicationsForDjagClerk() {
    return getParoleApplications().filter((a) => a.status !== 'Draft' || needsDjagForm2Ppr(a));
  }

  function isForm4Complete(form4) {
    return form4?.status === 'Parole Granted' || form4?.decision === 'Parole Granted';
  }

  function isForm5Complete(form5) {
    return form5?.status === 'Parole Refused' || form5?.decision === 'Parole Refused';
  }

  function isCommanderVerified(app) {
    const decision = app?.commanderReview?.decision;
    return decision === 'Verified' || decision === 'Approved';
  }

  function isVerificationReady(app) {
    if (!app) return false;
    const summary = getFormCompletionSummary(app);
    return summary.checks.form1 && summary.checks.form2 && summary.checks.form3;
  }

  function calculateBoardVotes(app) {
    const assessments = (app?.boardAssessments || []).filter((a) =>
      BOARD_VOTING_ROLES.includes(a.role) && a.submissionStatus === 'Submitted' && a.vote
    );
    const byRole = {};
    assessments.forEach((a) => { byRole[a.role] = a; });
    const voteCounts = { Approved: 0, Refused: 0, Deferred: 0 };
    assessments.forEach((a) => {
      if (voteCounts[a.vote] != null) voteCounts[a.vote] += 1;
    });
    const submittedCount = assessments.length;
    const pendingRoles = BOARD_VOTING_ROLES.filter((r) => !byRole[r]);
    const complete = pendingRoles.length === 0;
    let outcome = null;
    if (complete) {
      if (voteCounts.Deferred > 0 && voteCounts.Approved <= voteCounts.Refused) outcome = 'Deferred';
      else if (voteCounts.Deferred >= 2) outcome = 'Deferred';
      else if (voteCounts.Approved > voteCounts.Refused) outcome = 'Parole Granted';
      else if (voteCounts.Refused > voteCounts.Approved) outcome = 'Parole Refused';
      else outcome = 'Deferred';
    }
    return {
      votes: voteCounts,
      assessments,
      byRole,
      submittedCount,
      pendingRoles,
      complete,
      outcome,
      meetsThreshold: outcome === 'Parole Granted',
      result: complete ? outcome : (submittedCount ? `AWAITING ${pendingRoles.length} VOTE(S)` : 'PENDING VOTES'),
      calculation: complete
        ? `Approve ${voteCounts.Approved} · Refuse ${voteCounts.Refused} · Defer ${voteCounts.Deferred}`
        : (submittedCount ? `Partial votes: ${submittedCount}/${BOARD_VOTING_ROLES.length}` : null),
    };
  }

  function calculateParoleScore(app) {
    const tally = calculateBoardVotes(app);
    const approvalPct = tally.complete
      ? Math.round((tally.votes.Approved / BOARD_VOTING_ROLES.length) * 100)
      : (tally.submittedCount ? Math.round((tally.votes.Approved / tally.submittedCount) * 100) : 0);
    return {
      percent: approvalPct,
      meetsThreshold: tally.meetsThreshold,
      assessments: tally.assessments.map((a) => ({
        role: a.role,
        vote: a.vote,
        score: a.score,
        assessorName: a.assessorName,
        submittedAt: a.submittedAt,
      })),
      calculation: tally.calculation,
      calculatedAt: tally.complete ? new Date().toISOString() : null,
      complete: tally.complete,
      submittedCount: tally.submittedCount,
      pendingRoles: tally.pendingRoles,
      votes: tally.votes,
      outcome: tally.outcome,
      result: tally.result,
    };
  }

  function getHearingDeadlineInfo(app) {
    if (!app) return null;
    const stageAt = app.hearingSchedulingAt || app.commanderReview?.verifiedAt || app.submittedAt || app.createdAt;
    const start = new Date(stageAt);
    const deadline = new Date(start);
    deadline.setDate(deadline.getDate() + HEARING_DEADLINE_DAYS);
    deadline.setHours(23, 59, 59, 999);
    const now = new Date();
    const msLeft = deadline - now;
    const daysRemaining = Math.ceil(msLeft / 86400000);
    const hearing = getHearingsByApplication(app.id).find((h) => !['Cancelled'].includes(h.status));
    const scheduled = hearing?.scheduledDate ? new Date(hearing.scheduledDate) : null;
    return {
      stageAt,
      deadlineAt: deadline.toISOString().slice(0, 10),
      daysRemaining,
      overdue: daysRemaining < 0 && !scheduled,
      warning: daysRemaining >= 0 && daysRemaining <= 3,
      scheduledDate: hearing?.scheduledDate || null,
      scheduledTime: hearing?.scheduledTime || null,
      hearingStatus: hearing?.status || null,
      withinDeadline: scheduled ? scheduled <= deadline : null,
      hearingId: hearing?.id || null,
    };
  }

  async function saveForm2Section(appId, sectionKey, sectionData, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    const normalizedKey = sectionKey === 'dar' ? 'ddr' : sectionKey;
    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(actor.role) : actor.role;
    if (normalizedKey === 'ddr' && !['PNGCS Parole Clerk', 'System Administrator'].includes(role)) {
      throw new Error('Only CS Parole Clerk may submit the DAR section.');
    }
    if (normalizedKey === 'ppr' && !['DJAG Parole Clerk', 'System Administrator'].includes(role)) {
      throw new Error('Only DJAG Parole Clerk may submit the PPR section.');
    }
    const prisoner = getPrisonerById(app.prisonerId);
    const inst = getInstitutionById(app.institutionId || prisoner?.institutionId);
    const payload = { ...sectionData };
    if (normalizedKey === 'ddr') {
      payload.officerName = payload.officerName || payload.darOfficer;
      payload.institutionName = payload.institutionName || payload.facilityName || inst?.name || 'Correctional Institution';
      payload.assessmentSummary = payload.assessmentSummary
        || payload.conductLog
        || payload.summary
        || [payload.conductLog, payload.trainingProgress, payload.recidivismNotes].filter(Boolean).join('\n\n');
    }
    if (normalizedKey === 'ppr') {
      payload.clerkName = payload.clerkName || payload.pprOfficer;
      payload.personalParticulars = payload.personalParticulars
        || payload.pprFamilyHistory
        || [payload.pprFamilyHistory, payload.pprPsychologicalStanding, payload.pprEmploymentHistory, payload.verifiedResidence, payload.reintegrationPlan].filter(Boolean).join('\n\n');
      payload.communitySummary = payload.communitySummary || payload.victimStatements || payload.communityStatements;
    }
    if (typeof PMSValidation !== 'undefined') {
      const v = PMSValidation.validateForm2Section(normalizedKey, payload);
      if (!v.valid) throw new Error(v.errors.join(' '));
    }
    app.formData = app.formData || createEmptyFormData();
    app.formData.form2 = app.formData.form2 || { sections: {} };
    const block = {
      ...(app.formData.form2.sections?.[normalizedKey] || {}),
      ...payload,
      contributorId: actor.id,
      contributorName: `${actor.firstName} ${actor.lastName}`,
      contributorRole: actor.role,
      submittedAt: new Date().toISOString(),
      submitted: true,
      confirmed: sectionData.confirmed === true,
      verificationStatus: sectionData.verificationStatus || (sectionData.confirmed ? 'Verified' : 'Pending'),
    };
    app.formData.form2.sections = { ...(app.formData.form2.sections || {}), [normalizedKey]: block };
    if (isForm2Complete(app.formData.form2)) {
      app.formData.form2.status = 'submitted';
      app.formData.form2.submittedAt = new Date().toISOString();
    }
    logAudit(actor, 'SAVE', 'Form', `${appId}-form2-${normalizedKey}`, `Form 2 ${normalizedKey.toUpperCase()} section submitted`);
    const meta = { applicationId: appId, institutionId: app.institutionId, prisonerId: app.prisonerId, type: 'form2', linkPanel: 'applications' };
    if (normalizedKey === 'ddr') {
      notifyRole('DJAG Parole Clerk', 'Form 2 Requires Action', `DDR completed — PPR section required for ${app.caseNumber || appId}`, app.institutionId, app.prisonerId, null, meta);
    } else {
      notifyRoles(['PNGCS Parole Clerk', 'CS Parole Officer'], 'Form 2 Section Submitted', `PPR section submitted for ${app.caseNumber || appId}`, meta);
    }
    if (isForm2Complete(app.formData.form2)) {
      const prisoner = getPrisonerById(app.prisonerId);
      const pName = prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : 'prisoner';
      const boardMeta = {
        ...meta,
        type: 'form2',
        linkPanel: 'applications',
        dedupeKey: `form2:complete:${appId}:board`,
      };
      notifyRoles(
        ['PNGCS Parole Clerk', 'DJAG Parole Clerk'],
        'Form 2 Complete — Submitted to Board',
        `PPR and DAR submitted for ${pName} (${app.caseNumber || appId}) — ready for board workflow`,
        boardMeta
      );
      notifyInstitutionRoles(
        app.institutionId,
        ['Jail Commander', 'PNGCS Parole Clerk'],
        'Case Awaiting Verification',
        `Form 2 complete — institutional verification required for ${app.caseNumber || appId}`,
        { ...meta, type: 'verification', linkPanel: 'verification' }
      );
    }
    persist();
    return app.formData.form2;
  }

  function saveCommanderCaseReview(appId, review, actor) {
    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(actor.role) : actor.role;
    if (!['Jail Commander', 'PNGCS Parole Clerk', 'System Administrator'].includes(role)) {
      throw new Error('Only a Jail Commander or PNGCS Parole Clerk may record case verification.');
    }
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    if (actor.institutionId && app.institutionId !== actor.institutionId && role !== 'System Administrator') {
      throw new Error('You may only review prisoners at your assigned institution.');
    }
    const inst = getInstitutionById(app.institutionId);
    const reviewedAt = new Date().toISOString();
    app.commanderReview = {
      commanderId: actor.id,
      commanderName: `${actor.firstName} ${actor.lastName}`,
      institutionId: app.institutionId,
      institutionName: inst?.name || '',
      decision: review.decision,
      comments: review.comments || '',
      reviewedAt,
      verifiedAt: reviewedAt,
    };
    logAudit(actor, 'VERIFY', 'ParoleApplication', appId, `Commander ${review.decision}: ${review.comments || ''}`);
    if (review.decision === 'Verified' || review.decision === 'Approved') {
      if (!isForm3Complete(app.formData?.form3)) {
        throw new Error('Forms 1–3 must be completed before institutional verification can be recorded.');
      }
      app.hearingSchedulingAt = new Date().toISOString();
      transitionApplication(appId, 'Pre-Parole Report Prepared', actor, `Institutional verification complete — ready for hearing scheduling (${review.comments || ''})`);
      notifyRole('DJAG Secretary', 'Schedule Hearing Required', `Case ${app.caseNumber || app.id} requires hearing within ${HEARING_DEADLINE_DAYS} days`, app.institutionId, app.prisonerId, null, { applicationId: appId, type: 'hearing', linkPanel: 'hearings' });
      notifyRoles(['PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'Case Verified', `Case verified ${app.caseNumber || appId}`, { applicationId: appId, institutionId: app.institutionId, prisonerId: app.prisonerId, type: 'verification' });
    } else if (review.decision === 'Returned for Correction') {
      transitionApplication(appId, 'Returned for Correction', actor, review.comments || 'Returned for correction');
    } else if (review.decision === 'Rejected') {
      transitionApplication(appId, 'Refused', actor, review.comments || 'Rejected during institutional verification');
    }
    persist();
    return app;
  }

  function getGuarantors(applicationId) {
    const app = getApplicationById(applicationId);
    return app?.guarantors ? [...app.guarantors] : [];
  }

  function saveGuarantor(applicationId, guarantor, actor) {
    const app = getApplicationById(applicationId);
    if (!app) throw new Error('Application not found');
    app.guarantors = app.guarantors || [];
    if (guarantor.id) {
      const idx = app.guarantors.findIndex((g) => g.id === guarantor.id);
      if (idx < 0) throw new Error('Guarantor not found');
      app.guarantors[idx] = { ...app.guarantors[idx], ...guarantor, updatedAt: new Date().toISOString() };
    } else {
      const id = `GUA-${String(app.guarantors.length + 1).padStart(6, '0')}`;
      app.guarantors.push({ ...guarantor, id, applicationId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    logAudit(actor, guarantor.id ? 'UPDATE' : 'CREATE', 'Guarantor', guarantor.id || app.guarantors.at(-1).id, guarantor.name);
    persist();
    return guarantor.id ? app.guarantors.find((g) => g.id === guarantor.id) : app.guarantors.at(-1);
  }

  function deleteGuarantor(applicationId, guarantorId, actor) {
    const app = getApplicationById(applicationId);
    if (!app?.guarantors) return;
    app.guarantors = app.guarantors.filter((g) => g.id !== guarantorId);
    logAudit(actor, 'DELETE', 'Guarantor', guarantorId, 'Guarantor removed from case');
    persist();
  }

  function requiredApprovalsComplete(app) {
    const steps = app?.approvalSteps || [];
    const required = ['Parole Board Member', 'PNGCS Parole Clerk'];
    return required.every((r) => steps.some((s) => s.role === r && s.decision === 'Approved'));
  }

  function saveApprovalStep(appId, step, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    app.approvalSteps = app.approvalSteps || [];
    app.approvalSteps.push({
      approverId: actor.id,
      approverName: `${actor.firstName} ${actor.lastName}`,
      role: actor.role,
      decision: step.decision,
      comments: step.comments || '',
      at: new Date().toISOString(),
    });
    logAudit(actor, 'APPROVE', 'ParoleApplication', appId, `${actor.role} ${step.decision}`);
    const meta = { applicationId: appId, institutionId: app.institutionId, prisonerId: app.prisonerId, type: 'approval', linkPanel: 'applications' };
    if (step.decision === 'Approved' && requiredApprovalsComplete(app)) {
      transitionApplication(appId, 'Approved', actor, 'All required approvals completed');
      notifyRole('PNGCS Parole Clerk', 'Release Authorized — Pending Action', `Approvals complete for ${app.caseNumber || appId} — authorize release`, app.institutionId, app.prisonerId, null, meta);
    } else if (step.decision === 'Rejected') {
      transitionApplication(appId, 'Refused', actor, step.comments || 'Approval rejected');
    } else if (step.decision === 'Returned for Correction') {
      transitionApplication(appId, 'Returned for Correction', actor, step.comments || 'Returned during approval');
    } else {
      app.status = 'Pending Approval';
      notifyRole('Parole Board Member', 'Approval Required', `Approval pending for ${app.caseNumber || appId}`, app.institutionId, app.prisonerId, null, meta);
      notifyRole('PNGCS Parole Clerk', 'Approval Required', `Approval pending for ${app.caseNumber || appId}`, app.institutionId, app.prisonerId, null, meta);
    }
    persist();
    return app;
  }

  function getBoardDecisionOutcome(app) {
    if (app?.boardDecision?.outcome) return app.boardDecision.outcome;
    const tally = calculateBoardVotes(app);
    return tally.complete ? tally.outcome : null;
  }

  function isBoardDecisionFinalized(app) {
    const outcome = getBoardDecisionOutcome(app);
    return outcome === 'Parole Granted' || outcome === 'Parole Refused';
  }

  function canProceedToForm4(app) {
    if (!app) return false;
    if (getBoardDecisionOutcome(app) !== 'Parole Granted') return false;
    return !!(app.formData?.form4 || app.boardDecision?.outcome === 'Parole Granted');
  }

  function canProceedToForm5(app) {
    if (!app) return false;
    if (getBoardDecisionOutcome(app) !== 'Parole Refused') return false;
    return !!(app.formData?.form5 || app.boardDecision?.outcome === 'Parole Refused');
  }

  function routeParoleOutcome(appId, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    const tally = calculateBoardVotes(app);
    if (!tally.complete) {
      throw new Error(`Cannot route outcome yet — awaiting votes from: ${tally.pendingRoles.join(', ')}.`);
    }
    if (tally.outcome === 'Deferred') {
      throw new Error('Board decision was deferred. Form 4/5 routing does not apply until a grant or refuse outcome is recorded.');
    }
    const score = calculateParoleScore(app);
    app.paroleScore = { ...score, locked: true };
    app.formData = app.formData || createEmptyFormData();
    const prisoner = getPrisonerById(app.prisonerId);
    const hearing = getHearingsByApplication(appId)[0];
    const assessments = getBoardAssessments(appId);
    const refuseNotes = assessments
      .filter((a) => a.vote === 'Refused')
      .map((a) => `${a.role} (${a.assessorName}): ${a.feedback || 'No comment'}`)
      .join('\n');
    const recordedBy = `${actor.firstName} ${actor.lastName}`;

    if (tally.outcome === 'Parole Granted') {
      app.formData.form4 = PMSIdGenerator.assignFormId(data, 'form4', {
        ...app.formData.form4,
        status: 'draft',
        decision: 'Parole Granted',
        caseNumber: app.caseNumber,
        prisonerName: prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : '',
        hearingDate: hearing?.scheduledDate,
        hearingLocation: hearing?.location,
        boardAssessments: assessments,
        boardVotes: tally.votes,
        boardDecisionSummary: tally.calculation,
        finalPercent: score.percent,
        calculation: tally.calculation,
        calculatedAt: score.calculatedAt || new Date().toISOString(),
        conditions: app.formData.form4?.conditions || '',
        recordedAt: new Date().toISOString(),
        recordedBy,
      });
      transitionApplication(appId, 'Parole Granted', actor, `Board approved parole (${tally.calculation})`);
    } else {
      app.formData.form5 = PMSIdGenerator.assignFormId(data, 'form5', {
        ...app.formData.form5,
        status: 'draft',
        decision: 'Parole Refused',
        caseNumber: app.caseNumber,
        prisonerName: prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : '',
        hearingDate: hearing?.scheduledDate,
        boardAssessments: assessments,
        boardVotes: tally.votes,
        boardDecisionSummary: tally.calculation,
        finalPercent: score.percent,
        calculation: tally.calculation,
        calculatedAt: score.calculatedAt || new Date().toISOString(),
        refusalReason: app.formData.form5?.refusalReason || 'Board majority refused parole',
        justification: app.formData.form5?.justification || refuseNotes || tally.calculation,
        recordedAt: new Date().toISOString(),
        recordedBy,
      });
      transitionApplication(appId, 'Parole Refused', actor, `Board refused parole (${tally.calculation})`);
    }
    persist();
    return app;
  }

  function issueForm4Grant(appId, form4Data, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    if (getBoardDecisionOutcome(app) !== 'Parole Granted') {
      throw new Error('Board decision must be Parole Granted before Form 4 can be issued.');
    }
    if (!requiredBoardAssessmentsComplete(app)) {
      throw new Error('All board member votes must be recorded before Form 4 can be issued.');
    }
    const merged = {
      ...app.formData?.form4,
      ...form4Data,
      status: 'Parole Granted',
      decision: 'Parole Granted',
      issued: true,
      issuedAt: new Date().toISOString(),
      issuedBy: `${actor.firstName} ${actor.lastName}`,
    };
    saveFormData(appId, 'form4', merged, actor);
    const updated = getApplicationById(appId);
    if (['Parole Granted', 'Pending Board Review', 'Hearing Scheduled'].includes(updated.status)) {
      transitionApplication(appId, 'Pending Approval', actor, 'Form 4 — Parole Granted issued');
    }
    persist();
    return getApplicationById(appId);
  }

  function issueForm5Refusal(appId, form5Data, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    if (getBoardDecisionOutcome(app) !== 'Parole Refused') {
      throw new Error('Board decision must be Parole Refused before Form 5 can be issued.');
    }
    if (!requiredBoardAssessmentsComplete(app)) {
      throw new Error('All board member votes must be recorded before Form 5 can be issued.');
    }
    const merged = {
      ...app.formData?.form5,
      ...form5Data,
      status: 'Parole Refused',
      decision: 'Parole Refused',
      issued: true,
      issuedAt: new Date().toISOString(),
      issuedBy: `${actor.firstName} ${actor.lastName}`,
    };
    saveFormData(appId, 'form5', merged, actor);
    const updated = getApplicationById(appId);
    if (['Parole Refused', 'Pending Board Review', 'Hearing Scheduled'].includes(updated.status)) {
      transitionApplication(appId, 'Refused', actor, 'Form 5 — Parole Refused issued');
    }
    persist();
    return getApplicationById(appId);
  }

  function getCaseTimeline(appId) {
    const app = getApplicationById(appId);
    if (!app) return [];
    const events = [];
    events.push({ at: app.createdAt, stage: 'Case Created', status: 'Draft', by: app.createdBy || 'System', notes: app.caseNumber || app.id });
    (app.workflowNotes || []).forEach((n) => {
      events.push({ at: n.at, stage: n.status, status: n.status, by: n.by, notes: n.notes });
    });
    ['form1', 'form2', 'form3', 'form4', 'form5'].forEach((key, i) => {
      const fd = app.formData?.[key];
      if (!fd || !Object.keys(fd).length) return;
      const label = PAROLE_FORMS[i]?.name || key;
      if (fd.submittedAt || fd.submitted === true || fd.status === 'submitted' || fd.status === 'approved' || fd.status === 'recorded') {
        events.push({ at: fd.submittedAt || fd.approvedAt || fd.recordedAt || app.updatedAt, stage: `${label} Completed`, status: fd.status || 'completed', by: fd.officerName || fd.decidedByName || fd.commanderName || '—' });
      }
    });
    getHearingsByApplication(appId).forEach((h) => {
      events.push({ at: h.scheduledDate, stage: 'Hearing Scheduled', status: h.status, by: 'DJAG', notes: h.location });
    });
    if (app.boardDecision) {
      events.push({ at: app.boardDecision.decidedAt, stage: 'Board Decision', status: app.boardDecision.outcome, by: app.boardDecision.decidedBy });
    }
    if (app.releaseInfo?.authorizedAt) {
      events.push({ at: app.releaseInfo.authorizedAt, stage: 'Release Authorized', status: 'Released', by: app.releaseInfo.authorizedByName });
    }
    return events.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
  }

  function getOffenses(prisonerId = null) {
    if (!data.offenses) data.offenses = [];
    return prisonerId ? data.offenses.filter((o) => o.prisonerId === prisonerId) : [...data.offenses];
  }

  function saveOffense(offense, actor) {
    if (!data.offenses) data.offenses = [];
    if (offense.id) {
      const idx = data.offenses.findIndex((o) => o.id === offense.id);
      if (idx < 0) throw new Error('Offense not found');
      data.offenses[idx] = { ...data.offenses[idx], ...offense, updatedAt: new Date().toISOString() };
      logAudit(actor, 'UPDATE', 'Offense', offense.id, offense.offenseName || offense.offense);
      persist();
      return data.offenses[idx];
    }
    const id = `OFFN-${String((data.offenses.length || 0) + 1).padStart(6, '0')}`;
    const entry = { ...offense, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    data.offenses.push(entry);
    const p = getPrisonerById(offense.prisonerId);
    if (p && !p.offense) p.offense = offense.offenseName || offense.offense;
    logAudit(actor, 'CREATE', 'Offense', id, entry.offenseName || entry.offense);
    persist();
    return entry;
  }

  function deleteOffense(id, actor) {
    if (!data.offenses) return;
    const o = data.offenses.find((x) => x.id === id);
    data.offenses = data.offenses.filter((x) => x.id !== id);
    logAudit(actor, 'DELETE', 'Offense', id, o?.offenseName || o?.offense || id);
    persist();
  }

  function saveBoardAssessment(appId, assessment, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(actor.role) : actor.role;
    const allowed = {
      Doctor: 'Doctor',
      'CS Commissioner': 'CS Commissioner',
      'DJAG Secretary': 'DJAG Secretary',
      'Parole Board Member': 'Parole Board Member',
    };
    if (!allowed[role]) throw new Error('Your role is not authorized to submit board votes.');
    if (!['Hearing Scheduled', 'Pending Board Review'].includes(app.status)) {
      throw new Error('Board votes can only be submitted after a hearing has been scheduled.');
    }
    const isDraft = assessment?.submissionStatus === 'Draft';
    const vote = assessment?.vote ? normalizeBoardVote(assessment.vote) : null;
    if (!isDraft && typeof PMSValidation !== 'undefined' && assessment) {
      const v = PMSValidation.validateAssessment({ ...assessment, vote });
      if (!v.valid) throw new Error(v.errors.join(' '));
    }
    app.boardAssessments = app.boardAssessments || [];
    const existingForRole = app.boardAssessments.find((a) => a.role === role && a.assessorId !== actor.id && a.submissionStatus === 'Submitted');
    if (existingForRole) throw new Error(`A vote for ${role} has already been submitted by ${existingForRole.assessorName}.`);
    const entry = {
      id: assessment.id || `ASM-${String(app.boardAssessments.length + 1).padStart(6, '0')}`,
      role,
      boardPosition: assessment.boardPosition || actor.boardPosition,
      assessorId: actor.id,
      assessorName: `${actor.firstName} ${actor.lastName}`,
      vote,
      score: assessment.score == null || assessment.score === '' ? null : Number(assessment.score),
      feedback: assessment.feedback || '',
      recommendation: vote === 'Approved' ? 'Recommend parole' : vote === 'Refused' ? 'Do not recommend' : 'Defer decision',
      submissionStatus: isDraft ? 'Draft' : 'Submitted',
      submittedAt: isDraft ? null : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const idx = app.boardAssessments.findIndex((a) => a.role === role && a.assessorId === actor.id);
    if (idx >= 0) app.boardAssessments[idx] = { ...app.boardAssessments[idx], ...entry };
    else app.boardAssessments.push(entry);
    if (!isDraft) {
      ensureBoardReviewStarted(app, actor, `${role} submitted board vote (${vote})`);
      logAudit(actor, 'SAVE', 'BoardAssessment', appId, `${role} vote submitted (${vote})`);
    }
    const assessMeta = { applicationId: appId, institutionId: app.institutionId, prisonerId: app.prisonerId, type: 'board_review', linkPanel: 'decisions', linkHref: `forms/hearing-portal.html?appId=${encodeURIComponent(appId)}` };
    const progress = getBoardAssessmentProgress(app);
    app.paroleScore = { ...calculateParoleScore(app), locked: progress.complete };
    if (!isDraft) {
      notifyRole(actor.role, 'Vote Recorded', `Your ${vote} vote for ${app.caseNumber || appId} has been saved. ${progress.complete ? 'All board votes are now complete.' : `Awaiting ${progress.pendingRoles.join(', ')}.`}`, app.institutionId, app.prisonerId, actor.id, assessMeta);
      if (!progress.complete) {
        progress.pendingRoles.forEach((r) => notifyRole(r, 'Board Vote Required', `Your vote is required for ${app.caseNumber || appId}. Other members may have already voted.`, app.institutionId, app.prisonerId, null, assessMeta));
      } else {
        finalizeBoardVotes(appId, actor);
      }
    }
    persist();
    return entry;
  }

  function saveMedicalEvaluation(appId, evaluation, actor) {
    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(actor.role) : actor.role;
    if (role !== 'Doctor' && role !== 'System Administrator') {
      throw new Error('Only the board medical assessor may upload evaluation documents.');
    }
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    app.medicalEvaluations = app.medicalEvaluations || [];
    const entry = {
      id: evaluation.id || `MED-${String(app.medicalEvaluations.length + 1).padStart(6, '0')}`,
      fileName: evaluation.fileName || 'evaluation.pdf',
      fileType: evaluation.fileType || 'application/pdf',
      fileSize: evaluation.fileSize || 0,
      notes: evaluation.notes || '',
      uploadedBy: actor.id,
      uploadedByName: `${actor.firstName} ${actor.lastName}`,
      uploadedAt: new Date().toISOString(),
    };
    app.medicalEvaluations.push(entry);
    logAudit(actor, 'UPLOAD', 'MedicalEvaluation', appId, entry.fileName);
    persist();
    return entry;
  }

  function getMedicalEvaluations(appId) {
    return getApplicationById(appId)?.medicalEvaluations || [];
  }

  function finalizeBoardVotes(appId, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    if (app.boardDecision?.outcome && ['Parole Granted', 'Parole Refused', 'Deferred'].includes(app.boardDecision.outcome)) {
      return app;
    }
    const tally = calculateBoardVotes(app);
    if (!tally.complete) throw new Error('All board members must vote before the decision can be finalized.');
    if (tally.outcome === 'Deferred') {
      transitionApplication(appId, 'Deferred', actor, `Board decision deferred (${tally.calculation})`);
      app.boardDecision = {
        outcome: 'Deferred',
        deliberationNotes: tally.calculation,
        decidedBy: actor.id,
        decidedByName: `${actor.firstName} ${actor.lastName}`,
        decidedAt: new Date().toISOString(),
        votes: tally.votes,
      };
      persist();
      return app;
    }
    routeParoleOutcome(appId, actor);
    const updated = getApplicationById(appId);
    if (tally.outcome === 'Parole Granted') {
      const prisoner = getPrisonerById(updated.prisonerId);
      const pName = prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : 'prisoner';
      notifyInstitutionRoles(
        updated.institutionId,
        ['Jail Commander'],
        'Release Authorization Required',
        `Board decision complete for ${pName} — authorize release when ready`,
        { applicationId: appId, institutionId: updated.institutionId, prisonerId: updated.prisonerId, type: 'release', linkPanel: 'release' },
      );
    }
    updated.boardDecision = {
      outcome: tally.outcome,
      deliberationNotes: tally.calculation,
      decidedBy: actor.id,
      decidedByName: `${actor.firstName} ${actor.lastName}`,
      decidedAt: new Date().toISOString(),
      boardPosition: actor.boardPosition || actor.position || '',
      votes: tally.votes,
      paroleScore: updated.paroleScore?.percent,
      calculation: tally.calculation,
    };
    persist();
    notifyRoles(['PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'Board Decision Finalized', `${updated.caseNumber || appId}: ${tally.outcome}`, { applicationId: appId, institutionId: updated.institutionId, prisonerId: updated.prisonerId, type: 'board_review', linkPanel: 'decisions', linkHref: tally.outcome === 'Parole Granted' ? `forms/form4.html?appId=${encodeURIComponent(appId)}` : `forms/form5.html?appId=${encodeURIComponent(appId)}` });
    return updated;
  }

  function getBoardAssessments(appId) {
    return getApplicationById(appId)?.boardAssessments || [];
  }

  function getBoardAssessmentForRole(app, role) {
    return (app?.boardAssessments || []).find((a) => a.role === role && a.submissionStatus !== 'Draft' && a.vote) || null;
  }

  function getBoardAssessmentForActor(app, actor) {
    if (!app || !actor) return null;
    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(actor.role) : actor.role;
    return (app.boardAssessments || []).find((a) => a.role === role && a.assessorId === actor.id) || null;
  }

  function hasSubmittedBoardAssessment(app, actor) {
    const mine = getBoardAssessmentForActor(app, actor);
    return !!(mine && mine.submissionStatus === 'Submitted' && mine.vote);
  }

  function getBoardAssessmentProgress(app) {
    const submitted = BOARD_ASSESSOR_ROLES.filter((r) => getBoardAssessmentForRole(app, r)).length;
    const pendingRoles = BOARD_ASSESSOR_ROLES.filter((r) => !getBoardAssessmentForRole(app, r));
    return {
      total: BOARD_ASSESSOR_ROLES.length,
      submitted,
      pendingRoles,
      complete: submitted === BOARD_ASSESSOR_ROLES.length,
    };
  }

  function ensureBoardReviewStarted(app, actor, note) {
    if (!app || app.status === 'Pending Board Review') return;
    if (app.status !== 'Hearing Scheduled') return;
    const hasHearing = getHearingsByApplication(app.id).some((h) => !['Cancelled', 'Completed'].includes(h.status));
    if (!hasHearing) return;
    app.status = 'Pending Board Review';
    app.workflowNotes = [...(app.workflowNotes || []), {
      status: 'Pending Board Review',
      notes: note || 'Board review started — panel members may submit assessments independently',
      at: new Date().toISOString(),
      by: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
    }];
    logAudit(actor, 'UPDATE', 'ParoleApplication', app.id, 'Status → Pending Board Review (assessment in progress)');
  }

  function requiredBoardAssessmentsComplete(app) {
    return getBoardAssessmentProgress(app).complete;
  }

  function isParoleGrantedForRelease(app) {
    if (!app) return false;
    if (['Refused', 'Parole Refused'].includes(app.status)) return false;
    if (['Approved', 'Parole Granted', 'Pending Approval'].includes(app.status)) {
      const score = app.paroleScore || calculateParoleScore(app);
      if (app.status === 'Approved' || app.status === 'Parole Granted') return true;
      if (score.meetsThreshold || isForm4Complete(app.formData?.form4)) return true;
    }
    const score = app.paroleScore || calculateParoleScore(app);
    return score.meetsThreshold || isForm4Complete(app.formData?.form4);
  }

  function getReleaseBlockers(app, actor) {
    const blockers = [];
    if (!app) return ['Application not found.'];
    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(actor?.role) : actor?.role;
    if (!['Jail Commander', 'PNGCS Parole Clerk', 'System Administrator'].includes(role)) {
      return ['You do not have permission to authorize release.'];
    }
    if (app.status === 'Released') return ['Prisoner has already been released.'];
    if (actor?.institutionId && app.institutionId !== actor.institutionId && role !== 'System Administrator') {
      blockers.push('This case belongs to another institution.');
    }
    if (!requiredBoardAssessmentsComplete(app)) {
      blockers.push('All board members must submit their vote (Approve, Deny, or Defer) before release.');
    }
    if (!isParoleGrantedForRelease(app)) {
      blockers.push('Parole must be granted before release can be authorized.');
    }
    if (role === 'PNGCS Parole Clerk' && !requiredApprovalsComplete(app) && app.status !== 'Approved' && role !== 'System Administrator') {
      blockers.push('Required approval workflow must be completed before release.');
    }
    return blockers;
  }

  function canAuthorizeRelease(app, actor) {
    return getReleaseBlockers(app, actor).length === 0;
  }

  function authorizeRelease(appId, releaseInfo, actor) {
    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(actor.role) : actor.role;
    const app = getApplicationById(appId);
    const blockers = getReleaseBlockers(app, actor);
    if (blockers.length) {
      throw new Error(blockers.join(' '));
    }
    app.releaseInfo = {
      authorizedAt: new Date().toISOString(),
      authorizedBy: actor.id,
      authorizedByName: `${actor.firstName} ${actor.lastName}`,
      authorizedByRole: actor.role,
      releaseDate: releaseInfo.releaseDate || new Date().toISOString().slice(0, 10),
      notes: releaseInfo.notes || '',
      institutionId: app.institutionId,
      institutionName: getInstitutionById(app.institutionId)?.name || '',
      caseNumber: app.caseNumber || app.id,
      finalApprovalVerified: requiredApprovalsComplete(app) || app.status === 'Approved',
      requirements: getReleaseRequirements(app),
    };
    const prisoner = getPrisonerById(app.prisonerId);
    const inst = getInstitutionById(app.institutionId);
    logAudit(actor, 'RELEASE', 'ParoleApplication', appId, `Release authorized for ${prisoner?.prisonerNumber || app.prisonerId}`, {
      newValues: app.releaseInfo,
      entityCaseNumber: app.caseNumber,
    });
    transitionApplication(appId, 'Released', actor, `Prisoner release authorized — ${releaseInfo.releaseDate || 'today'}`);
    if (prisoner) {
      prisoner.status = 'Released on Parole';
      prisoner.releasedOnParoleAt = app.releaseInfo.authorizedAt;
      applyPrisonerEligibility(prisoner, actor);
    }
    const pName = prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : 'prisoner';
    const meta = { applicationId: appId, institutionId: app.institutionId, prisonerId: app.prisonerId, type: 'release', linkPanel: 'applications' };
    notifyRoles(['PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'Release Authorized', `${pName} released on parole from ${inst?.name || 'institution'}`, meta);
    notifyRole('Jail Commander', 'Release Completed', `${pName} — release on parole recorded`, app.institutionId, app.prisonerId, actor.id, meta);
    notifyRole('PNGCS Parole Clerk', 'Release Completed', `${pName} — release on parole recorded`, app.institutionId, app.prisonerId, actor.id, meta);
    notifyRole('System Administrator', 'Release Authorized', `${app.caseNumber || appId}: ${pName} released on parole`, app.institutionId, app.prisonerId, null, meta);
    persist();
    return app;
  }

  function overrideEligibility(prisonerId, override, actor) {
    if (actor.role !== 'System Administrator') {
      throw new Error('Only System Administrator may override eligibility.');
    }
    const p = getPrisonerById(prisonerId);
    if (!p) throw new Error('Prisoner not found');
    p.eligibilityOverride = {
      status: override.status,
      reason: override.reason,
      eligibleDate: override.eligibleDate || null,
      by: actor.id,
      at: new Date().toISOString(),
    };
    if (override.status) p.status = override.status;
    logAudit(actor, 'OVERRIDE', 'Prisoner', prisonerId, `Eligibility override: ${override.reason}`, {
      newValues: p.eligibilityOverride,
    });
    persist();
    return p;
  }

  function recordLoginFailure(identifier) {
    const key = identifier.trim().toLowerCase();
    const now = Date.now();
    const entry = loginAttempts[key] || { count: 0, lockedUntil: 0 };
    if (entry.lockedUntil > now) return entry;
    entry.count += 1;
    if (entry.count >= MAX_LOGIN_ATTEMPTS) {
      entry.lockedUntil = now + LOCKOUT_MINUTES * 60 * 1000;
      entry.count = 0;
    }
    loginAttempts[key] = entry;
    return entry;
  }

  function clearLoginAttempts(identifier) {
    delete loginAttempts[identifier.trim().toLowerCase()];
  }

  function isLoginLocked(identifier) {
    const entry = loginAttempts[identifier.trim().toLowerCase()];
    return entry && entry.lockedUntil > Date.now();
  }

  function migratePasswordHashes() {
    Object.keys(DEMO_PASSWORDS).forEach((k) => {
      if (typeof DEMO_PASSWORDS[k] === 'string' && !DEMO_PASSWORDS[k].startsWith('sha1:')) {
        DEMO_PASSWORDS[k] = hashPassword(DEMO_PASSWORDS[k]);
      }
    });
  }

  /** Ensure newly added seed users (e.g. Jail Commander) exist in cached local/API data. */
  function mergeSeedUsers() {
    if (!data?.users) return;
    let changed = false;

    const legacyCommander = data.users.find(
      (u) => u.username?.toLowerCase() === 'commander@cs.gov.pg' || u.email?.toLowerCase() === 'commander@cs.gov.pg',
    );
    if (legacyCommander) {
      legacyCommander.username = 'pkoroma@cs.gov.pg';
      legacyCommander.email = 'pkoroma@cs.gov.pg';
      if (DEMO_PASSWORDS['commander@cs.gov.pg']) {
        DEMO_PASSWORDS['pkoroma@cs.gov.pg'] = DEMO_PASSWORDS['commander@cs.gov.pg'];
        delete DEMO_PASSWORDS['commander@cs.gov.pg'];
      }
      changed = true;
    }

    const commanderSeed = {
      id: 'USR-000028', officerId: 'OFF-000028', employeeNumber: 'EMP-000028',
      username: 'pkoroma@cs.gov.pg', email: 'pkoroma@cs.gov.pg',
      firstName: 'Peter', lastName: 'Koroma', role: 'Jail Commander', rank: 'Commander',
      institutionId: 'INS-000001', province: 'National Capital District',
      position: 'Jail Commander — Bomana', phone: '+675 7123 4600',
      employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null,
      status: 'Active', dateAppointed: '2019-04-01', lastLogin: null, profilePhoto: null,
    };

    const patchUsers = [commanderSeed];
    if (typeof PMSIdGenerator !== 'undefined') {
      try {
        seedData().users.forEach((seedUser) => {
          if (!patchUsers.some((u) => u.id === seedUser.id)) patchUsers.push(seedUser);
        });
      } catch (_) { /* seedData unavailable during partial load */ }
    }

    patchUsers.forEach((seedUser) => {
      const exists = data.users.some(
        (u) => u.id === seedUser.id || u.username?.toLowerCase() === seedUser.username.toLowerCase(),
      );
      if (!exists) {
        data.users.push({ ...seedUser });
        changed = true;
      }
      if (!DEMO_PASSWORDS[seedUser.username]) {
        DEMO_PASSWORDS[seedUser.username] = seedUser.username === 'admin' ? 'admin123' : 'Password123!';
        changed = true;
      }
    });

    const bomana = data.institutions?.find((i) => i.id === 'INS-000001');
    const commander = data.users.find((u) => u.username === 'pkoroma@cs.gov.pg');
    if (bomana && commander && bomana.commanderId !== commander.id) {
      bomana.commanderId = commander.id;
      changed = true;
    }

    if (changed) persist();
  }

  function checkHearingDeadlines(actor) {
    if (!data?.applications) return;
    data.applications.filter((a) => ['Pre-Parole Report Prepared', 'Hearing Scheduled'].includes(a.status)).forEach((app) => {
      const info = getHearingDeadlineInfo(app);
      if (!info) return;
      const meta = { applicationId: app.id, institutionId: app.institutionId, prisonerId: app.prisonerId, type: 'deadline', linkPanel: 'hearings' };
      if (info.warning && !info.scheduledDate) {
        notifyRole('DJAG Secretary', 'Hearing Deadline Warning', `${info.daysRemaining} day(s) left to schedule hearing for ${app.caseNumber || app.id}`, app.institutionId, app.prisonerId, null, meta);
      }
      if (info.overdue) {
        notifyRole('DJAG Secretary', 'Hearing Overdue', `Case ${app.caseNumber || app.id} is overdue for hearing scheduling`, app.institutionId, app.prisonerId, null, meta);
        notifyRole('System Administrator', 'Hearing Overdue — Escalation', `Case ${app.caseNumber || app.id} exceeded ${HEARING_DEADLINE_DAYS}-day hearing deadline`, app.institutionId, app.prisonerId, null, meta);
        app.hearingOverdue = true;
      }
      if (info.scheduledDate && info.withinDeadline === false) {
        notifyRole('DJAG Secretary', 'Hearing Deadline Breach', `Scheduled hearing for ${app.caseNumber || app.id} is outside the ${HEARING_DEADLINE_DAYS}-day window`, app.institutionId, app.prisonerId, null, meta);
      }
    });
    persist();
  }

  function parseDate(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addMonths(d, m) { const r = new Date(d); r.setMonth(r.getMonth() + m); return r; }
  function diffMonths(a, b) { return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); }

  function logAudit(actor, action, entity, entityId, details, extra = {}) {
    data.auditLogs.unshift({
      id: generateId('audit'),
      userId: actor?.id || null,
      userName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : 'System',
      role: actor?.role || 'System',
      action,
      entity,
      entityId,
      details,
      timestamp: new Date().toISOString(),
      ipAddress: extra.ipAddress || getClientIp(),
      previousValues: extra.previousValues ?? null,
      newValues: extra.newValues ?? null,
      denied: extra.denied === true,
      success: extra.denied === true ? false : extra.success !== false,
    });
    persist();
  }

  function getClientIp() {
    return sessionStorage.getItem('pms_client_ip') || '127.0.0.1';
  }

  function logAccessDenied(actor, entity, action, details, entityId = null) {
    logAudit(actor, 'ACCESS_DENIED', entity, entityId, details, { denied: true });
  }

  function assertPrisonerModify(actor, prisoner = null) {
    if (typeof PMSRBAC === 'undefined' || !PMSRBAC.canModifyPrisoner(actor)) {
      logAccessDenied(actor, 'Prisoner', 'MODIFY', 'Unauthorized attempt to modify prisoner record');
      const err = new Error('You do not have permission to modify prisoner records. Only PNGCS Parole Clerks may create, update, or delete prisoner data.');
      err.code = 403;
      throw err;
    }
    if (prisoner && !PMSRBAC.canAccessPrisonerRecord(actor, prisoner)) {
      logAccessDenied(actor, 'Prisoner', 'MODIFY', `Unauthorized access to prisoner ${prisoner.id}`, prisoner.id);
      const err = new Error('You do not have access to this prisoner record.');
      err.code = 403;
      throw err;
    }
  }

  function prisonerAuditSnapshot(p) {
    if (!p) return null;
    return {
      id: p.id,
      prisonerNumber: p.prisonerNumber,
      institutionId: p.institutionId,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      offense: p.offense,
      sentenceStartDate: p.sentenceStartDate,
      sentenceEndDate: p.sentenceEndDate,
      status: p.status,
      documentCount: (p.documents || []).length,
    };
  }

  function getSettings() { return { ...data.settings }; }

  function saveSettings(settings, actor) {
    data.settings = { ...data.settings, ...settings };
    logAudit(actor, 'UPDATE', 'Settings', 'system', 'Updated system settings');
    const label = data.settings.paroleEligibilityLabel || 'configuration';
    notifyRole('System Administrator', 'System Announcement', `System settings updated: ${label}`, null, null, null, {
      type: 'system', linkPanel: 'settings',
    });
    notifyRoles(['PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'System Announcement', `System settings updated: ${label}`, { type: 'system' });
    if (typeof PMSEligibility !== 'undefined') {
      PMSEligibility.syncAllPrisoners(actor, data.applications);
      syncParoleNotifications(actor);
    }
    persist();
    return getSettings();
  }

  function getAuditLogs() { return [...data.auditLogs]; }

  function getUsers() { return [...(data?.users || [])]; }
  function getUserById(id) { return data?.users?.find((u) => u.id === id) || null; }
  function getUserByUsername(u) { return data?.users?.find((x) => x.username.toLowerCase() === u.toLowerCase()) || null; }

  function saveUser(user, actor) {
    if (user.id) {
      const idx = data.users.findIndex((u) => u.id === user.id);
      if (idx < 0) throw new Error('User not found');
      const existing = data.users[idx];
      const { id: _id, officerId: _oid, employeeNumber: _emp, ...updates } = user;
      data.users[idx] = { ...existing, ...updates, id: existing.id, officerId: existing.officerId, employeeNumber: existing.employeeNumber };
      if (user.password) setUserPassword(data.users[idx].username, user.password);
    } else {
      const username = user.username.trim();
      if (data.users.some((u) => u.username.toLowerCase() === username.toLowerCase()))
        throw new Error('Username already exists');
      const id = generateId('user');
      const role = user.role;
      const officerId = PMSIdGenerator.isOfficerRole(role) ? generateId('officer') : null;
      const employeeNumber = PMSIdGenerator.isOfficerRole(role) ? generateId('employee') : null;
      data.users.push({
        ...user,
        id,
        officerId,
        employeeNumber,
        username,
        status: user.status || 'Active',
      });
      if (user.password) setUserPassword(username, user.password);
    }
    const saved = user.id ? getUserById(user.id) : data.users.at(-1);
    logAudit(actor, user.id ? 'UPDATE' : 'CREATE', 'User', saved.id, saved.username);
    const userAction = user.id ? 'updated' : 'created';
    notifyRole('System Administrator', 'User Account Change', `User account ${userAction}: ${saved.username} (${saved.role})`, null, null, null, {
      type: 'user', linkPanel: 'users',
    });
    if (saved.id !== actor?.id) {
      notifyRole(saved.role, 'Account Update', `Your account was ${userAction} by an administrator`, saved.institutionId, null, saved.id, {
        type: 'user', linkPanel: 'profile',
      });
    }
    persist();
    return saved;
  }

  function deleteUser(id, actor) {
    const user = getUserById(id);
    if (!user) throw new Error('User not found');
    if (user.username === 'admin') throw new Error('Cannot delete default administrator');
    data.users = data.users.filter((u) => u.id !== id);
    logAudit(actor, 'DELETE', 'User', id, user.username);
    persist();
  }

  function resetPassword(userId, newPassword, actor) {
    const u = getUserById(userId);
    if (!u) throw new Error('User not found');
    setUserPassword(u.username, newPassword);
    logAudit(actor, 'UPDATE', 'User', userId, `Password reset for ${u.username}`);
    return u;
  }

  function authenticate(identifier, password) {
    if (!data) throw new Error('Storage not loaded');
    const login = identifier.trim().toLowerCase();
    if (isLoginLocked(login)) {
      logAudit(null, 'ACCESS_DENIED', 'Session', login, 'Account temporarily locked after failed login attempts', { denied: true });
      return null;
    }
    const user = data.users.find((u) =>
      u.status === 'Active' && (u.username.toLowerCase() === login || u.email.toLowerCase() === login));
    if (!user) {
      recordLoginFailure(login);
      return null;
    }
    if (user.employmentStatus === 'Inactive' || user.accountStatus === 'Suspended' || user.accountStatus === 'Expired') return null;
    if (user.contractExpiryDate && user.contractExpiryDate < new Date().toISOString().slice(0, 10)) return null;
    const expected = DEMO_PASSWORDS[user.username] || DEMO_PASSWORDS[login];
    if (!expected || !verifyPassword(expected, password)) {
      recordLoginFailure(login);
      logAudit(null, 'ACCESS_DENIED', 'Session', user.id, `Failed login for ${user.username}`, { denied: true });
      return null;
    }
    clearLoginAttempts(login);
    const { password: _p, ...safe } = user;
    saveSession(safe);
    const u = data.users.find((x) => x.id === safe.id);
    if (u) u.lastLogin = new Date().toISOString();
    persist();
    logAudit(safe, 'LOGIN', 'Session', safe.id, `${safe.username} signed in`);
    return safe;
  }

  function getInstitutions(activeOnly = false) {
    let list = [...(data?.institutions || [])];
    if (activeOnly) list = list.filter((i) => i.status === 'Active');
    return list;
  }
  function getInstitutionById(id) { return data?.institutions?.find((i) => i.id === id) || null; }

  function getJailCommanderForInstitution(institutionId) {
    const inst = getInstitutionById(institutionId);
    if (inst?.commanderId) {
      const assigned = getUserById(inst.commanderId);
      if (assigned?.status === 'Active') return assigned;
    }
    return data.users.find((u) => u.role === 'Jail Commander' && u.institutionId === institutionId && u.status === 'Active') || null;
  }
  function getJailCommanders() {
    return data.users.filter((u) => u.role === 'Jail Commander' && u.status === 'Active');
  }
  function getCommanderProfile(userId) {
    const user = getUserById(userId);
    if (!user || user.role !== 'Jail Commander') return null;
    const inst = user.institutionId ? getInstitutionById(user.institutionId) : null;
    return { user, institution: inst };
  }
  function saveCommanderProfile(profile, actor) {
    if (!profile?.userId) throw new Error('Commander user id required');
    const user = getUserById(profile.userId);
    if (!user || user.role !== 'Jail Commander') throw new Error('Jail Commander not found');
    saveUser({ ...user, phone: profile.phone || user.phone, position: profile.position || user.position }, actor);
    return getCommanderProfile(profile.userId);
  }
  function getCommanderDetailBundle(institutionId) {
    const commander = getJailCommanderForInstitution(institutionId);
    const inst = getInstitutionById(institutionId);
    if (!inst) return null;
    return { institution: inst, commander, stats: getInstitutionStats(institutionId) };
  }
  function assignJailCommander(institutionId, userId, actor) {
    const inst = getInstitutionById(institutionId);
    const user = getUserById(userId);
    if (!inst) throw new Error('Institution not found');
    if (!user || user.role !== 'Jail Commander') throw new Error('User must be a Jail Commander');
    inst.commanderId = userId;
    user.institutionId = institutionId;
    logAudit(actor, 'UPDATE', 'Institution', institutionId, `Assigned Jail Commander ${user.username}`);
    persist();
    return getCommanderDetailBundle(institutionId);
  }

  function getPrisonersByInstitution(institutionId) {
    return data.prisoners.filter((p) => p.institutionId === institutionId);
  }

  function getInstitutionStats(institutionId) {
    const inst = getInstitutionById(institutionId);
    if (!inst) return null;
    const officers = getOfficersByInstitution(institutionId);
    const prisoners = getPrisonersByInstitution(institutionId);
    return {
      institution: inst,
      officerCount: officers.length,
      prisonerCount: prisoners.length,
      officers,
      prisoners,
      commander: getJailCommanderForInstitution(institutionId),
    };
  }

  function saveInstitution(inst, actor) {
    const payload = normalizeInstitution(inst);
    if (payload.id) {
      const idx = data.institutions.findIndex((i) => i.id === payload.id);
      if (idx < 0) throw new Error('Institution not found');
      const existing = data.institutions[idx];
      data.institutions[idx] = { ...existing, ...payload, id: existing.id, code: existing.code };
    } else {
      const id = generateId('institution');
      data.institutions.push({
        ...payload,
        id,
        code: id,
        status: payload.status || 'Active',
      });
    }
    const saved = payload.id ? getInstitutionById(payload.id) : data.institutions.at(-1);
    logAudit(actor, payload.id ? 'UPDATE' : 'CREATE', 'Institution', saved.id, saved.name);
    persist();
    return saved;
  }

  function deleteInstitution(id, actor) {
    const inst = getInstitutionById(id);
    if (!inst) throw new Error('Institution not found');
    if (data.users.some((u) => u.institutionId === id)) throw new Error('Cannot delete institution with assigned officers');
    if (data.prisoners.some((p) => p.institutionId === id)) throw new Error('Cannot delete institution with prisoner records');
    data.institutions = data.institutions.filter((i) => i.id !== id);
    logAudit(actor, 'DELETE', 'Institution', id, inst.name);
    persist();
  }

  function getOfficersByInstitution(institutionId) {
    return data.users.filter((u) => u.institutionId === institutionId && OFFICER_ROLES.includes(u.role) && u.status === 'Active');
  }

  function getPrisoners() { return [...(data?.prisoners || [])]; }
  function getPrisonerById(id) { return data.prisoners.find((p) => p.id === id); }

  function getSentenceDurationMonths(p) {
    if (p.sentenceEndDate && p.sentenceStartDate)
      return Math.max(0, diffMonths(parseDate(p.sentenceStartDate), parseDate(p.sentenceEndDate)));
    return 0;
  }

  function getParoleEligibilityDate(p) {
    const total = getSentenceDurationMonths(p);
    if (total <= 0 || !p.sentenceStartDate) return null;
    return addMonths(parseDate(p.sentenceStartDate), total * getSettings().paroleEligibilityFraction);
  }

  function getPrisonerProgress(p) {
    const totalMonths = getSentenceDurationMonths(p);
    if (totalMonths <= 0 || !p.sentenceStartDate)
      return { totalMonths: 0, servedMonths: 0, percent: 0, eligibilityDate: null, eligible: false };
    const start = parseDate(p.sentenceStartDate);
    const today = parseDate(new Date().toISOString());
    const servedMonths = Math.max(0, diffMonths(start, today));
    const percent = Math.min(100, (servedMonths / totalMonths) * 100);
    const eligibilityDate = getParoleEligibilityDate(p);
    const normalized = typeof PMSEligibility !== 'undefined' ? PMSEligibility.normalizeStatus(p.status) : p.status;
    const eligible = eligibilityDate && today >= parseDate(eligibilityDate)
      && ['Awaiting Eligibility', 'Eligible for Parole Application'].includes(normalized);
    return { totalMonths, servedMonths, percent, eligibilityDate, eligible };
  }

  function validatePrisonerDates(prisoner) {
    if (typeof PMSEligibility !== 'undefined') {
      return PMSEligibility.validateSentenceDates(prisoner.sentenceStartDate, prisoner.sentenceEndDate);
    }
    if (!prisoner.sentenceStartDate || !prisoner.sentenceEndDate) {
      return { valid: false, error: 'Sentence Start Date and Sentence End Date are required.' };
    }
    if (new Date(prisoner.sentenceStartDate) >= new Date(prisoner.sentenceEndDate)) {
      return { valid: false, error: 'Sentence End Date must be after Sentence Start Date.' };
    }
    return { valid: true };
  }

  function applyPrisonerEligibility(prisoner, actor) {
    if (typeof PMSEligibility === 'undefined') return prisoner;
    PMSEligibility.enrichPrisoner(prisoner, { applications: data.applications });
    return PMSEligibility.syncPrisonerStatus(prisoner, actor, { applications: data.applications });
  }

  function savePrisoner(prisoner, actor) {
    const existing = prisoner.id ? getPrisonerById(prisoner.id) : null;
    assertPrisonerModify(actor, existing);

    const dateCheck = validatePrisonerDates(prisoner);
    if (!dateCheck.valid) throw new Error(dateCheck.error);
    if (typeof PMSValidation !== 'undefined') {
      const dup = PMSValidation.findDuplicatePrisoner(prisoner, data.prisoners);
      if (dup) throw new Error(`Duplicate prisoner detected: ${dup.prisonerNumber} (${dup.firstName} ${dup.lastName}).`);
    }

    const { status: _manualStatus, ...prisonerFields } = prisoner;

    if (prisoner.id) {
      const idx = data.prisoners.findIndex((p) => p.id === prisoner.id);
      if (idx < 0) throw new Error('Prisoner not found');
      const prev = prisonerAuditSnapshot(data.prisoners[idx]);
      const { id: _id, prisonerNumber: _pn, ...updates } = prisonerFields;
      data.prisoners[idx] = { ...data.prisoners[idx], ...updates, id: existing.id, prisonerNumber: existing.prisonerNumber };
      const saved = applyPrisonerEligibility(data.prisoners[idx], actor);
      logAudit(actor, 'UPDATE', 'Prisoner', saved.id, saved.prisonerNumber, {
        previousValues: prev,
        newValues: prisonerAuditSnapshot(saved),
      });
      syncParoleNotifications(actor);
      persist();
      return saved;
    }

    assertPrisonerModify(actor);
    const id = prisoner.prisonerNumber || generateId('prisoner');
    const record = {
      ...prisonerFields,
      id,
      prisonerNumber: prisoner.prisonerNumber || id,
      documents: prisoner.documents || [],
      status: 'Awaiting Eligibility',
    };
    applyPrisonerEligibility(record, actor);
    data.prisoners.push(record);
    logAudit(actor, 'CREATE', 'Prisoner', record.id, record.prisonerNumber, {
      newValues: prisonerAuditSnapshot(record),
    });
    syncParoleNotifications(actor);
    persist();
    return record;
  }

  function deletePrisoner(id, actor) {
    const p = getPrisonerById(id);
    if (!p) throw new Error('Prisoner not found');
    assertPrisonerModify(actor, p);
    const prev = prisonerAuditSnapshot(p);
    data.prisoners = data.prisoners.filter((x) => x.id !== id);
    logAudit(actor, 'DELETE', 'Prisoner', id, p.prisonerNumber, { previousValues: prev });
    persist();
  }

  function addPrisonerDocument(prisonerId, doc, actor) {
    const p = getPrisonerById(prisonerId);
    if (!p) throw new Error('Prisoner not found');
    assertPrisonerModify(actor, p);
    const entry = {
      ...doc,
      id: doc.id || generateId('document'),
      category: doc.category || 'Supporting Document',
      uploadedBy: doc.uploadedBy || (actor ? `${actor.firstName} ${actor.lastName}` : 'System'),
      uploadedById: doc.uploadedById || actor?.id,
      uploadedAt: doc.uploadedAt || new Date().toISOString(),
      applicationId: doc.applicationId || null,
      prisonerId,
    };
    p.documents = [...(p.documents || []), entry];
    logAudit(actor, 'CREATE', 'Document', entry.id, `Attached ${entry.name} to ${p.prisonerNumber}`, {
      newValues: { prisonerId, documentId: entry.id, name: entry.name, type: entry.type },
    });
    notifyRole('DJAG Parole Clerk', 'Document Uploaded', `${entry.name} attached to ${p.firstName} ${p.lastName}`, p.institutionId, prisonerId, null, {
      type: 'document', prisonerId, linkHref: `prisoner-profile.html?id=${encodeURIComponent(prisonerId)}`,
    });
    notifyRole('PNGCS Parole Clerk', 'Document Uploaded', `${entry.name} attached to ${p.firstName} ${p.lastName}`, p.institutionId, prisonerId, null, {
      type: 'document', prisonerId, linkHref: `prisoner-profile.html?id=${encodeURIComponent(prisonerId)}`,
    });
    persist();
    return entry;
  }

  function addCaseDocument(appId, doc, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    app.caseDocuments = app.caseDocuments || [];
    const entry = {
      ...doc,
      id: doc.id || generateId('document'),
      applicationId: appId,
      prisonerId: app.prisonerId,
      category: doc.category || 'Supporting Document',
      uploadedBy: doc.uploadedBy || `${actor.firstName} ${actor.lastName}`,
      uploadedById: actor.id,
      uploadedAt: new Date().toISOString(),
    };
    app.caseDocuments.push(entry);
    if (doc.dataUrl || doc.name) addPrisonerDocument(app.prisonerId, { ...entry }, actor);
    else {
      logAudit(actor, 'CREATE', 'Document', entry.id, `Case document ${entry.name} for ${app.caseNumber || appId}`, { entityCaseNumber: app.caseNumber });
      persist();
    }
    return entry;
  }

  function getCaseDocuments(appId) {
    const app = getApplicationById(appId);
    return app?.caseDocuments ? [...app.caseDocuments] : [];
  }

  function removePrisonerDocument(prisonerId, docId, actor) {
    const p = getPrisonerById(prisonerId);
    if (!p) throw new Error('Prisoner not found');
    assertPrisonerModify(actor, p);
    const removed = (p.documents || []).find((d) => d.id === docId);
    p.documents = (p.documents || []).filter((d) => d.id !== docId);
    if (removed) {
      logAudit(actor, 'DELETE', 'Document', docId, `Removed ${removed.name} from ${p.prisonerNumber}`, {
        previousValues: { prisonerId, documentId: docId, name: removed.name },
      });
    }
    persist();
  }

  function getParoleApplications() { return [...(data?.applications || [])]; }
  function getApplicationById(id) { return data.applications.find((a) => a.id === id); }

  function createEmptyForms() {
    return PAROLE_FORMS.map((f) => ({
      formNumber: f.number, formName: f.name, fileName: null, dataUrl: null,
      uploadedAt: null, verified: false, verifiedBy: null,
    }));
  }
  function createEmptyFormData() { return { form1: {}, form2: {}, form3: {}, form4: {}, form5: {} }; }

  function isForm1Complete(form1) {
    if (!form1) return false;
    if (form1.status === 'submitted' || form1.status === 'verified') return true;
    if (form1.sections?.E?.prisoner_consent && (form1.submittedAt || form1.status === 'submitted')) return true;
    if (typeof PMSForm1Validation !== 'undefined') return PMSForm1Validation.isForm1Complete(form1);
    const secE = form1.sectionE || form1.sections?.E;
    return !!(form1.status === 'submitted' && (form1.eligibilityOutcome || secE?.prisoner_consent || secE?.prisonerConsent));
  }

  function resolveEligibilityNotifications(prisonerId) {
    data.notifications
      .filter((n) => n.type === 'eligibility' && n.prisonerId === prisonerId && !n.resolved)
      .forEach((n) => {
        n.read = true;
        n.resolved = true;
      });
  }

  function getOrCreateDraftApplication(prisonerId, actor) {
    const prisoner = getPrisonerById(prisonerId);
    if (!prisoner) throw new Error('Prisoner record not found.');
    const existing = data.applications.find(
      (a) => a.prisonerId === prisonerId && !['Approved', 'Refused'].includes(a.status)
    );
    if (existing) return existing;
    const app = saveParoleApplication({
      prisonerId,
      institutionId: prisoner.institutionId,
      status: 'Draft',
      formData: createEmptyFormData(),
    }, actor);
    resolveEligibilityNotifications(prisonerId);
    persist();
    return app;
  }

  async function saveForm1Screening(appId, form1Data, actor, { submit = false, draft = false, supervisorReview = false } = {}) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found.');
    const prisoner = getPrisonerById(app.prisonerId);
    if (!prisoner) throw new Error('Linked prisoner record not found.');
    const progress = getPrisonerProgress(prisoner);
    const settings = getSettings();
    const existing = app.formData?.form1 || {};

    if (existing.status === 'submitted' && !supervisorReview) {
      throw new Error('Submitted Form 1 cannot be modified.');
    }

    let merged = { ...existing, ...form1Data, prisonerId: prisoner.id, applicationId: appId };

    if (supervisorReview) {
      const role = PMSRBAC.normalizeRole(actor.role);
      if (!['PNGCS Parole Clerk', 'System Administrator'].includes(role)) {
        throw new Error('Only a PNGCS Parole Clerk or System Administrator may record supervisory review.');
      }
      if (existing.status !== 'submitted') {
        throw new Error('Supervisory review requires a submitted Form 1.');
      }
      merged.supervisorReview = {
        ...(existing.supervisorReview || {}),
        ...(form1Data.supervisorReview || {}),
        verified: true,
        verifiedAt: new Date().toISOString(),
        verifiedBy: actor.id,
        decision: form1Data.supervisorReview?.decision || 'Verified',
      };
      merged.status = 'verified';
    } else {
      const validation = typeof PMSForm1Validation !== 'undefined'
        ? PMSForm1Validation.validateForm1(merged, prisoner, progress, settings, { submit, draft })
        : { valid: true, checklist: merged.checklist || {}, errors: [] };

      if (!validation.valid) throw new Error(validation.errors.join(' '));
      merged.checklist = validation.checklist || merged.checklist;

      if (submit) {
        merged.status = 'submitted';
        merged.submittedAt = new Date().toISOString();
        merged.submittedBy = actor.id;
        merged.submittedByName = `${actor.firstName} ${actor.lastName}`;
      } else if (!merged.status) {
        merged.status = 'draft';
      }

      merged.officerName = merged.officerName || `${actor.firstName} ${actor.lastName}`;
      merged.officerId = merged.officerId || actor.officerId || actor.employeeNumber || actor.id;
    }

    saveFormData(appId, 'form1', merged, actor);

    if (submit) {
      logAudit(actor, 'SUBMIT', 'Form', merged.formId || `${appId}-form1`, 'Form 1 — Parole Eligibility Screening submitted', {
        newValues: { prisonerId: prisoner.id, applicationId: appId, eligibilityOutcome: merged.eligibilityOutcome },
      });
      notifyRoles(['PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'Form 1 Submitted', `Form 1 submitted for ${prisoner.firstName} ${prisoner.lastName}`, {
        applicationId: appId, institutionId: app.institutionId, prisonerId: app.prisonerId, type: 'form1', linkPanel: 'applications',
      });
      applyPrisonerEligibility(prisoner, actor);
    }

    if (typeof PMSApi !== 'undefined' && PMSApi.getToken()) {
      try {
        await PMSApi.saveForm1(appId, merged, { submit, supervisorReview });
      } catch (_) { /* bootstrap sync via persist handles offline */ }
    }

    return getApplicationById(appId);
  }

  function getFormCompletionSummary(app) {
    const fd = app?.formData || {};
    const appId = app?.id;

    if (typeof PMSFormWorkflow !== 'undefined' && appId) {
      const wfChecks = PMSFormWorkflow.getChecks(appId);
      const checks = {
        form1: wfChecks.form1 || isForm1Complete(fd.form1),
        form2: wfChecks.form2 || isForm2Complete(fd.form2),
        form3: wfChecks.form3 || isForm3Complete(fd.form3),
        form4: wfChecks.form4 || isForm4Complete(fd.form4),
        form5: wfChecks.form5 || isForm5Complete(fd.form5),
      };
      return { completed: Object.values(checks).filter(Boolean).length, total: 5, checks };
    }

    const checks = {
      form1: isForm1Complete(fd.form1),
      form2: isForm2Complete(fd.form2),
      form3: isForm3Complete(fd.form3),
      form4: isForm4Complete(fd.form4),
      form5: isForm5Complete(fd.form5),
    };
    return { completed: Object.values(checks).filter(Boolean).length, total: 5, checks };
  }

  function saveParoleApplication(app, actor) {
    const prisoner = getPrisonerById(app.prisonerId);
    if (!prisoner) throw new Error('Prisoner not found');
    if (typeof PMSValidation !== 'undefined') {
      const dup = PMSValidation.findDuplicateCase(app.prisonerId, getParoleApplications(), app.id);
      if (dup && !app.id) throw new Error(`An active parole case already exists for this prisoner (${dup.caseNumber || dup.id}).`);
    }
    const payload = {
      ...app,
      institutionId: app.institutionId || prisoner.institutionId,
      formData: app.formData || createEmptyFormData(),
      workflowNotes: app.workflowNotes || [],
    };
    if (app.id) {
      const idx = data.applications.findIndex((a) => a.id === app.id);
      if (idx < 0) throw new Error('Application not found');
      data.applications[idx] = { ...data.applications[idx], ...payload };
    } else {
      const id = generateId('application');
      const caseNumber = generateCaseNumber();
      data.applications.push({
        ...payload,
        id,
        caseNumber,
        status: payload.status || 'Draft',
        createdAt: new Date().toISOString(),
        boardAssessments: payload.boardAssessments || [],
      });
    }
    const saved = app.id ? getApplicationById(app.id) : data.applications.at(-1);
    logAudit(actor, app.id ? 'UPDATE' : 'CREATE', 'ParoleApplication', saved.id, saved.status);
    persist();
    return saved;
  }

  function saveFormData(appId, formKey, formData, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    if (formKey === 'form2' && typeof PMSRBAC !== 'undefined' && actor) {
      const prevSections = app.formData?.form2?.sections || {};
      const nextSections = formData?.sections || {};
      if (nextSections.ddr && JSON.stringify(nextSections.ddr) !== JSON.stringify(prevSections.ddr)
        && !PMSRBAC.canEditForm2Section(actor, 'ddr')) {
        throw new Error('Only CS Parole Clerk may edit the DAR section.');
      }
      if (nextSections.ppr && JSON.stringify(nextSections.ppr) !== JSON.stringify(prevSections.ppr)
        && !PMSRBAC.canEditForm2Section(actor, 'ppr')) {
        throw new Error('Only DJAG Parole Clerk may edit the PPR section.');
      }
    }
    app.formData = app.formData || createEmptyFormData();
    const merged = PMSIdGenerator.assignFormId(data, formKey, { ...app.formData[formKey], ...formData });
    app.formData[formKey] = merged;
    logAudit(actor, 'SAVE', 'Form', merged.formId || `${appId}-${formKey}`, PAROLE_FORMS.find((f) => `form${f.number}` === formKey)?.name || formKey);
    if (formKey === 'form3' && isForm3Complete(app.formData.form3) && !isCommanderVerified(app)) {
      const prisoner = getPrisonerById(app.prisonerId);
      const pName = prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : 'prisoner';
      if (!['Pending Commander Review', 'Pre-Parole Report Prepared', 'Hearing Scheduled', 'Pending Board Review', 'Approved', 'Refused', 'Released', 'Parole Granted', 'Parole Refused'].includes(app.status)) {
        transitionApplication(appId, 'Pending Commander Review', actor, 'Form 3 completed — awaiting Jail Commander verification');
      }
      notifyInstitutionRoles(
        app.institutionId,
        ['Jail Commander', 'PNGCS Parole Clerk'],
        'Verification Required',
        `Form 3 complete — institutional verification pending for ${pName}`,
        { applicationId: appId, institutionId: app.institutionId, prisonerId: app.prisonerId, type: 'verification', linkPanel: 'verification' }
      );
    }
    persist();
    return app;
  }

  function transitionApplication(appId, toStatus, actor, notes = '') {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    const fromStatus = app.status;
    if (typeof PMSWorkflow !== 'undefined' && actor?.role !== 'System Administrator') {
      if (!PMSWorkflow.canTransition(actor, fromStatus, toStatus)) {
        logAudit(actor, 'ACCESS_DENIED', 'ParoleApplication', appId, `Blocked transition ${fromStatus} → ${toStatus}`, { denied: true });
        throw new Error(`You are not permitted to change status from ${fromStatus} to ${toStatus}.`);
      }
      const advance = PMSWorkflow.canAdvanceApplication(app, toStatus);
      if (!advance.allowed) {
        logAudit(actor, 'ACCESS_DENIED', 'ParoleApplication', appId, `Workflow gate blocked ${fromStatus} → ${toStatus}: ${advance.blockers.join(' ')}`, { denied: true });
        throw new Error(`Cannot advance to ${toStatus}: ${advance.blockers.join(' ')}`);
      }
    }
    if (toStatus === 'Returned for Correction' && typeof PMSWorkflow !== 'undefined') {
      app.returnTarget = PMSWorkflow.getReturnTarget(fromStatus);
    }
    app.status = toStatus;
    if (toStatus === 'Submitted') {
      app.submittedAt = new Date().toISOString().split('T')[0];
      app.submittedBy = actor.id;
    }
    if (notes) app.workflowNotes = [...(app.workflowNotes || []), { status: toStatus, notes, at: new Date().toISOString(), by: actor.id, actorName: `${actor.firstName} ${actor.lastName}` }];
    logAudit(actor, 'UPDATE', 'ParoleApplication', appId, `Status → ${toStatus}. ${notes}`);
    const prisoner = getPrisonerById(app.prisonerId);
    const pName = prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : 'prisoner';
    const appMeta = { institutionId: app.institutionId, prisonerId: app.prisonerId, applicationId: appId, type: 'application', linkPanel: 'applications' };
    if (toStatus === 'Submitted') {
      notifyRole('DJAG Parole Clerk', 'New Parole Application', `PNGCS submitted application for ${pName}`, app.institutionId, app.prisonerId, null, appMeta);
    }
    if (toStatus === 'Pending Commander Review') {
      notifyInstitutionRoles(
        app.institutionId,
        ['PNGCS Parole Clerk', 'Jail Commander'],
        'Institutional Verification Required',
        `Form 3 and case verification required for ${pName}`,
        { ...appMeta, type: 'verification', linkPanel: 'verification' }
      );
    }
    if (toStatus === 'Returned for Correction') {
      notifyInstitutionRoles(
        app.institutionId,
        ['PNGCS Parole Clerk', 'CS Parole Officer'],
        'Application Returned',
        notes || 'Application returned for correction',
        { ...appMeta, type: 'returned' }
      );
    }
    if (toStatus === 'Under DJAG Review') {
      notifyRole('PNGCS Parole Clerk', 'Application Under Review', `Application for ${pName} is under DJAG review`, app.institutionId, app.prisonerId, null, appMeta);
    }
    if (toStatus === 'Pre-Parole Report Prepared') {
      notifyRole('Parole Board Member', 'Pre-Parole Report Ready', `Pre-parole report prepared for ${pName}`, app.institutionId, app.prisonerId, null, appMeta);
    }
    if (toStatus === 'Hearing Scheduled') {
      notifyRoles(['Parole Board Member', 'PNGCS Parole Clerk', 'DJAG Parole Clerk', 'DJAG Secretary'], 'Hearing Scheduled',
        `Parole hearing scheduled for ${pName}`, { ...appMeta, type: 'hearing', linkPanel: 'hearings' });
    }
    if (toStatus === 'Pending Board Review') {
      notifyRole('Parole Board Member', 'Application Ready for Board', `Application ready for board review: ${pName}`, app.institutionId, app.prisonerId, null, appMeta);
    }
    if (toStatus === 'Approved') {
      notifyRoles(['PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'Application Approved', `Parole application approved for ${pName}`, appMeta);
      notifyInstitutionRoles(
        app.institutionId,
        ['Jail Commander'],
        'Release Authorization Required',
        `Parole approved for ${pName} — authorize release after board interviews are complete`,
        { ...appMeta, type: 'release', linkPanel: 'release' },
      );
    }
    if (toStatus === 'Refused') {
      notifyRoles(['PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'Application Refused', notes || `Parole application refused for ${pName}`, appMeta);
    }
    if (toStatus === 'Pending Approval') {
      notifyRoles(['Parole Board Member', 'PNGCS Parole Clerk'], 'Approval Required', `Final approval required for ${pName}`, { ...appMeta, type: 'approval' });
    }
    if (toStatus === 'Parole Granted') {
      notifyRoles(['PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'Decision Available', `Parole granted for ${pName}`, appMeta);
    }
    if (toStatus === 'Released') {
      notifyRoles(['System Administrator', 'PNGCS Parole Clerk'], 'Release Recorded', `${pName} release on parole recorded`, appMeta);
    }
    if (toStatus === 'Deferred') {
      notifyRoles(['PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'Decision Deferred', notes || `Parole decision deferred for ${pName}`, appMeta);
    }
    if (prisoner) applyPrisonerEligibility(prisoner, actor);
    persist();
    return app;
  }

  function submitApplicationToDJAG(appId, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    const s = getFormCompletionSummary(app);
    if (!s.checks.form1 || !s.checks.form2) throw new Error('Forms 1 and 2 must be completed before submission to DJAG.');
    if (!s.checks.form3) throw new Error('Form 3 (Institutional Report) must be completed before submission.');
    if (!isCommanderVerified(app)) throw new Error('Institutional verification must be completed before submission to DJAG.');
    if (app.status === 'Pre-Parole Report Prepared') {
      return transitionApplication(appId, 'Under DJAG Review', actor, 'Submitted to DJAG for review');
    }
    return transitionApplication(appId, 'Submitted', actor, 'Submitted to DJAG for review');
  }

  function recordBoardDecision(appId, decision, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    if (!['Hearing Scheduled', 'Pending Board Review', 'Parole Granted', 'Parole Refused'].includes(app.status)) {
      throw new Error('Application must be in Hearing Scheduled or Pending Board Review status.');
    }
    if (!requiredBoardAssessmentsComplete(app)) {
      const pending = getBoardAssessmentProgress(app).pendingRoles;
      throw new Error(`Final decision requires all panel assessments. Still awaiting: ${pending.join(', ')}. Each member may submit independently when ready.`);
    }
    if (!isBoardDecisionFinalized(app)) {
      routeParoleOutcome(appId, actor);
    }
    const updated = getApplicationById(appId);
    const outcome = getBoardDecisionOutcome(updated);
    if (decision.conditions && outcome === 'Parole Granted') {
      updated.formData.form4 = { ...updated.formData.form4, conditions: decision.conditions };
    }
    if (decision.deliberationNotes) {
      if (outcome === 'Parole Granted') updated.formData.form4.notes = decision.deliberationNotes;
      else if (outcome === 'Parole Refused') updated.formData.form5.justification = decision.deliberationNotes;
    }
    updated.boardDecision = {
      ...updated.boardDecision,
      outcome,
      conditions: decision.conditions || updated.boardDecision?.conditions || '',
      deliberationNotes: decision.deliberationNotes || updated.boardDecision?.deliberationNotes || '',
      decidedBy: actor.id,
      decidedByName: `${actor.firstName} ${actor.lastName}`,
      decidedAt: new Date().toISOString(),
      boardPosition: actor.boardPosition || actor.position || '',
      paroleScore: updated.paroleScore?.percent,
      calculation: updated.paroleScore?.calculation || calculateBoardVotes(updated).calculation,
      votes: calculateBoardVotes(updated).votes,
    };
    persist();
    return updated;
  }

  function uploadApplicationForm() { throw new Error('Use saveFormData for form completion'); }
  function verifyApplicationForm(appId) { return getApplicationById(appId); }

  function getHearings() { return [...data.hearings]; }
  function getHearingById(id) { return data.hearings.find((h) => h.id === id); }
  function getHearingsByPrisoner(prisonerId) {
    return data.hearings.filter((h) => h.prisonerId === prisonerId);
  }
  function getHearingsByApplication(applicationId) {
    return data.hearings.filter((h) => h.applicationId === applicationId);
  }

  function saveHearing(hearing, actor) {
    const isUpdate = !!hearing.id;
    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(actor.role) : actor.role;
    const prev = isUpdate ? getHearingById(hearing.id) : null;
    const schedulingAction = !isUpdate
      || hearing.status === 'Cancelled'
      || (hearing.scheduledDate !== undefined && hearing.scheduledDate !== prev?.scheduledDate)
      || (hearing.scheduledTime !== undefined && hearing.scheduledTime !== prev?.scheduledTime)
      || (hearing.location !== undefined && hearing.location !== prev?.location);
    const canSchedule = typeof PMSRBAC !== 'undefined'
      ? PMSRBAC.canScheduleHearing(actor)
      : ['DJAG Secretary', 'System Administrator'].includes(role);
    if (schedulingAction && !canSchedule) {
      throw new Error('Only the DJAG Secretary may set or change hearing dates.');
    }
    if (hearing.applicationId && hearing.scheduledDate && !hearing.deadlineException) {
      const app = getApplicationById(hearing.applicationId);
      if (app && typeof PMSWorkflow !== 'undefined') {
        const blockers = PMSWorkflow.getAdvanceBlockers(app, 'Hearing Scheduled');
        if (blockers.length) throw new Error(`Cannot schedule hearing: ${blockers.join(' ')}`);
      }
      const info = app ? getHearingDeadlineInfo(app) : null;
      if (info?.deadlineAt && new Date(hearing.scheduledDate) > new Date(info.deadlineAt)) {
        throw new Error(`Hearing date exceeds the ${HEARING_DEADLINE_DAYS}-day deadline (${info.deadlineAt}). Record an authorized exception to proceed.`);
      }
    }
    if (hearing.id) {
      const idx = data.hearings.findIndex((h) => h.id === hearing.id);
      if (idx < 0) throw new Error('Hearing not found');
      const prev = data.hearings[idx];
      data.hearings[idx] = {
        ...prev,
        ...hearing,
        caseNumber: hearing.caseNumber || prev.caseNumber || getApplicationById(prev.applicationId)?.caseNumber,
        status: hearing.status || prev.status,
        updatedAt: new Date().toISOString(),
      };
    } else {
      const app = hearing.applicationId ? getApplicationById(hearing.applicationId) : null;
      const id = generateId('hearing');
      const sched = new Date(hearing.scheduledDate);
      const now = new Date();
      let status = hearing.status || 'Scheduled';
      if (sched > now) status = 'Upcoming';
      data.hearings.push({
        ...hearing,
        id,
        caseNumber: app?.caseNumber || hearing.caseNumber,
        status,
        boardMembers: hearing.boardMembers || [],
        meetingNotes: hearing.meetingNotes || '',
        attendance: hearing.attendance || [],
        outcome: hearing.outcome || null,
        createdAt: new Date().toISOString(),
      });
    }
    const saved = isUpdate ? getHearingById(hearing.id) : data.hearings.at(-1);
    logAudit(actor, isUpdate ? 'UPDATE' : 'CREATE', 'Hearing', saved.id, hearing.location || '');
    const p = getPrisonerById(saved.prisonerId);
    const pName = p ? `${p.firstName} ${p.lastName}` : 'prisoner';
    const title = isUpdate ? 'Hearing Date Updated' : 'Hearing Scheduled';
    const dateLabel = saved.scheduledDate || 'TBD';
    const timeLabel = saved.scheduledTime ? ` at ${saved.scheduledTime}` : '';
    const venueLabel = saved.location || 'TBD';
    const msg = `Parole hearing for ${pName} on ${dateLabel}${timeLabel} · ${venueLabel}. Panel members (Doctor, CS Commissioner, DJAG Secretary) may submit assessments independently when ready.`;
    const portalLink = saved.applicationId
      ? `forms/hearing-portal.html?appId=${encodeURIComponent(saved.applicationId)}`
      : null;
    const hearingMeta = {
      institutionId: p?.institutionId,
      prisonerId: saved.prisonerId,
      applicationId: saved.applicationId || null,
      hearingId: saved.id,
      type: 'hearing',
      linkPanel: 'hearings',
      linkHref: portalLink,
    };
    if (schedulingAction && saved.status !== 'Cancelled') {
      notifyRoles(
        ['DJAG Parole Clerk', 'Parole Board Member', 'Doctor', 'CS Commissioner'],
        title,
        msg,
        hearingMeta,
      );
      if (p?.institutionId) {
        notifyInstitutionRoles(
          p.institutionId,
          ['PNGCS Parole Clerk', 'Jail Commander', 'CS Parole Officer'],
          title,
          msg,
          hearingMeta,
        );
      }
    } else if (saved.status === 'Cancelled') {
      notifyRoles(
        ['DJAG Parole Clerk', 'Parole Board Member', 'Doctor', 'CS Commissioner'],
        'Hearing Cancelled',
        `Parole hearing for ${pName} on ${dateLabel} was cancelled.`,
        hearingMeta,
      );
      if (p?.institutionId) {
        notifyInstitutionRoles(
          p.institutionId,
          ['PNGCS Parole Clerk', 'Jail Commander'],
          'Hearing Cancelled',
          `Parole hearing for ${pName} on ${dateLabel} was cancelled.`,
          hearingMeta,
        );
      }
    }
    if (!isUpdate && saved.applicationId && saved.status !== 'Cancelled') {
      const app = getApplicationById(saved.applicationId);
      if (app) {
        const eligibleFrom = new Date(app.submittedAt || app.createdAt);
        const deadline = new Date(eligibleFrom);
        deadline.setDate(deadline.getDate() + HEARING_DEADLINE_DAYS);
        const hearingDate = new Date(saved.scheduledDate);
        if (hearingDate > deadline) {
          notifyRole('DJAG Secretary', 'Hearing Deadline Warning', `Hearing for ${app.caseNumber || app.id} is scheduled beyond the ${HEARING_DEADLINE_DAYS}-day requirement`, app.institutionId, app.prisonerId, null, { applicationId: app.id, type: 'deadline' });
        }
      }
      if (app && !['Hearing Scheduled', 'Pending Board Review', 'Approved', 'Refused', 'Deferred'].includes(app.status)) {
        transitionApplication(saved.applicationId, 'Hearing Scheduled', actor, `Hearing scheduled for ${saved.scheduledDate || 'TBD'}`);
      }
    }
    persist();
    return saved;
  }

  function buildNotificationDedupeKey(opts) {
    const recipient = opts.recipientUserId || opts.role || opts.recipientRole || 'all';
    const subject = opts.applicationId || opts.hearingId || opts.prisonerId || 'general';
    return `${opts.type || 'system'}:${subject}:${recipient}:${opts.title || ''}`;
  }

  function hasActiveNotification(dedupeKey) {
    return data.notifications.some((n) => n.dedupeKey === dedupeKey && !n.resolved);
  }

  function migrateNotifications() {
    if (!data.notifications) data.notifications = [];
    const seen = new Set();
    data.notifications = data.notifications.filter((n) => {
      if (!n.dedupeKey) {
        n.dedupeKey = buildNotificationDedupeKey({
          type: n.type,
          title: n.title,
          recipientRole: n.recipientRole,
          recipientUserId: n.recipientUserId,
          applicationId: n.applicationId,
          hearingId: n.hearingId,
          prisonerId: n.prisonerId,
        });
      }
      if (n.resolved) return true;
      if (seen.has(n.dedupeKey)) return false;
      seen.add(n.dedupeKey);
      return true;
    });
  }

  function notifyInstitutionRoles(institutionId, roles, title, message, meta = {}) {
    const officers = getOfficersByInstitution(institutionId).filter((o) => roles.includes(o.role));
    if (officers.length) {
      officers.forEach((o) => {
        notifyRole(o.role, title, message, institutionId, meta.prisonerId || null, o.id, meta);
      });
      return;
    }
    roles.forEach((role) => {
      notifyRole(role, title, message, institutionId, meta.prisonerId || null, null, meta);
    });
  }

  function createNotification(opts) {
    const {
      role, title, message, type = 'system',
      institutionId = null, prisonerId = null, applicationId = null, hearingId = null,
      userId = null, linkPanel = null, linkHref = null, eligibleDate = null, dedupeKey = null,
    } = opts;
    const key = dedupeKey || buildNotificationDedupeKey({
      type, title, role, recipientUserId: userId, applicationId, hearingId, prisonerId,
    });
    if (hasActiveNotification(key)) return null;
    data.notifications.unshift({
      id: generateId('notification'),
      type, title, message,
      recipientRole: role,
      recipientUserId: userId,
      institutionId, prisonerId, applicationId, hearingId,
      linkPanel, linkHref, eligibleDate,
      dedupeKey: key,
      read: false, resolved: false,
      createdAt: new Date().toISOString(),
    });
    return data.notifications[0];
  }

  function notifyRole(role, title, message, institutionId, prisonerId, userId = null, extra = {}) {
    return createNotification({ role, title, message, institutionId, prisonerId, userId, ...extra });
  }

  function notifyRoles(roles, title, message, meta = {}) {
    roles.forEach((role) => createNotification({ role, title, message, ...meta }));
  }

  function syncParoleNotifications(actor) {
    const settings = getSettings();
    const label = settings.paroleEligibilityLabel;
    const existing = new Set(
      data.notifications
        .filter((n) => ['eligibility', 'parole_eligibility'].includes(n.type) && !n.resolved)
        .map((n) => n.prisonerId)
    );

    data.prisoners.forEach((p) => {
      const prog = getPrisonerProgress(p);
      if (!prog.eligible || existing.has(p.id)) return;
      const msg = `${p.firstName} ${p.lastName} (${p.prisonerNumber}) reached eligibility: ${label}.`;
      const eligMeta = {
        type: 'eligibility',
        eligibleDate: prog.eligibilityDate,
        linkPanel: 'eligibility',
        prisonerId: p.id,
        institutionId: p.institutionId,
      };
      notifyRole('System Administrator', 'Parole Eligibility Alert', msg, p.institutionId, p.id, null, eligMeta);
      notifyInstitutionRoles(
        p.institutionId,
        ['PNGCS Parole Clerk', 'CS Parole Officer'],
        'Parole Eligibility Alert',
        msg,
        eligMeta
      );
      if (p.status === 'Awaiting Eligibility') applyPrisonerEligibility(p, actor);
      existing.add(p.id);
    });
    persist();
    return getNotifications();
  }

  function getNotifications() { return [...data.notifications]; }

  /**
   * Calendar events visible to the signed-in user (hearings, deadlines, alerts).
   * Data is sourced from the in-memory store (synced from API/MySQL via bootstrap).
   */
  function getCalendarEventsForUser(user) {
    if (!user || !data) return [];

    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(user.role) : user.role;
    const events = [];
    const seen = new Set();

    function addEvent(evt) {
      if (!evt?.date || seen.has(evt.id)) return;
      seen.add(evt.id);
      events.push(evt);
    }

    function prisonerLabel(prisonerId) {
      const p = getPrisonerById(prisonerId);
      return p ? `${p.firstName} ${p.lastName}` : 'Detainee';
    }

    function hearingLink(h) {
      if (h.applicationId) return `forms/hearing-portal.html?appId=${encodeURIComponent(h.applicationId)}`;
      return `?panel=hearings&hearing=${encodeURIComponent(h.id)}`;
    }

    const boardRoles = ['Parole Board Member', 'Doctor', 'CS Commissioner', 'DJAG Secretary'];
    const globalHearingRoles = ['System Administrator', 'DJAG Parole Clerk', 'DJAG Secretary'];
    const canSeeAllHearings = globalHearingRoles.includes(role) || role === 'System Administrator';

    let hearings = getHearings().filter((h) => !['Cancelled', 'Completed'].includes(h.status));
    if (typeof PMSRBAC !== 'undefined') {
      hearings = PMSRBAC.scopeFilter(hearings, user, 'institutionId');
    } else if (user.institutionId) {
      hearings = hearings.filter((h) => h.institutionId === user.institutionId);
    }

    if (boardRoles.includes(role) && !canSeeAllHearings) {
      hearings = hearings.filter((h) => {
        if (!h.boardMembers?.length) return true;
        return h.boardMembers.includes(user.id);
      });
    }

    hearings.forEach((h) => {
      addEvent({
        id: `hearing:${h.id}`,
        date: (h.scheduledDate || '').slice(0, 10),
        time: h.scheduledTime || null,
        title: `Hearing — ${prisonerLabel(h.prisonerId)}`,
        subtitle: h.location || h.notes || h.status,
        type: 'hearing',
        severity: ['Upcoming', 'Scheduled'].includes(h.status) ? 'medium' : 'low',
        linkHref: hearingLink(h),
        hearingId: h.id,
        applicationId: h.applicationId,
      });
    });

    getNotificationsForUser(user).forEach((n) => {
      const date = (n.eligibleDate || n.createdAt || '').slice(0, 10);
      if (!date) return;
      addEvent({
        id: `notif:${n.id}`,
        date,
        time: null,
        title: n.title,
        subtitle: n.message?.slice(0, 120),
        type: n.type === 'hearing' ? 'hearing' : (n.type === 'deadline' || n.type === 'escalation' ? 'deadline' : 'notification'),
        severity: n.type === 'escalation' ? 'high' : 'low',
        linkHref: typeof PMSUI !== 'undefined' ? PMSUI.resolveNotificationLink?.(n, user) : null,
      });
    });

    const scopeInst = ['PNGCS Parole Clerk', 'CS Parole Officer'].includes(role) ? user.institutionId : null;
    getEscalations(scopeInst || null).forEach((e, idx) => {
      let apps = getParoleApplications();
      if (scopeInst) apps = apps.filter((a) => a.institutionId === scopeInst);
      const app = apps.find((a) => a.id === e.applicationId);
      const deadline = app ? getHearingDeadlineInfo(app) : null;
      const date = (deadline?.deadlineAt || new Date().toISOString()).slice(0, 10);
      addEvent({
        id: `escalation:${e.type}:${e.applicationId || idx}`,
        date,
        time: null,
        title: e.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        subtitle: e.message,
        type: 'deadline',
        severity: e.severity || 'medium',
        linkHref: e.applicationId ? `?panel=applications&app=${encodeURIComponent(e.applicationId)}` : null,
        applicationId: e.applicationId,
      });
    });

    if (user.contractExpiryDate) {
      addEvent({
        id: `contract:${user.id}`,
        date: user.contractExpiryDate.slice(0, 10),
        time: null,
        title: 'Board contract expiry',
        subtitle: user.contractStatus || 'Review contract status',
        type: 'contract',
        severity: user.contractStatus === 'Expired' ? 'high' : 'medium',
        linkHref: '?panel=profile',
      });
    }

    return events
      .filter((e) => e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  }

  function getNotificationsForUser(user) {
    if (!user) return [];
    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(user.role) : user.role;
    const INSTITUTION_SCOPED = ['PNGCS Parole Clerk', 'CS Parole Officer', 'Jail Commander'];
    return data.notifications.filter((n) => {
      const nRole = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(n.recipientRole) : n.recipientRole;
      if (nRole !== role) return false;
      if (n.recipientUserId && n.recipientUserId !== user.id) return false;
      if (user.institutionId && INSTITUTION_SCOPED.includes(role) && n.institutionId && n.institutionId !== user.institutionId) {
        return false;
      }
      if (typeof PMSRBAC !== 'undefined' && !PMSRBAC.canReceiveNotification(user, n)) return false;
      return true;
    });
  }

  function getReports() { return [...(data.reports || [])]; }

  function createReport(report, actor) {
    if (!data.reports) data.reports = [];
    const entry = {
      ...report,
      id: generateId('report'),
      createdAt: report.createdAt || new Date().toISOString(),
      createdBy: report.createdBy || actor?.id || null,
    };
    data.reports.unshift(entry);
    logAudit(actor, 'CREATE', 'Report', entry.id, entry.title || entry.type || 'Report');
    persist();
    return entry;
  }

  function previewNextId(entityType) {
    return PMSIdGenerator.preview(data, entityType);
  }

  function markNotificationRead(id, actor) {
    const n = data.notifications.find((x) => x.id === id);
    if (n) { n.read = true; persist(); }
  }

  function resolveNotification(id, actor) {
    const n = data.notifications.find((x) => x.id === id);
    if (n) { n.read = true; n.resolved = true; persist(); }
  }

  function markAllNotificationsRead(actor, user) {
    getNotificationsForUser(user).forEach((n) => { n.read = true; });
    persist();
  }

  function getUnreadCountForUser(user) {
    return getNotificationsForUser(user).filter((n) => !n.read && !n.resolved).length;
  }
  function getUnreadCount(role) {
    return data.notifications.filter((n) => !n.read && !n.resolved && n.recipientRole === role).length;
  }

  function setSession(user, apiToken = null) {
    const normalized = typeof PMSAuth !== 'undefined' && PMSAuth.prepareSessionUser
      ? PMSAuth.prepareSessionUser(user)
      : user;
    saveSession(normalized);
    if (apiToken) {
      try { sessionStorage.setItem(API_TOKEN_KEY, apiToken); } catch (_) { /* ignore */ }
      if (typeof PMSApi !== 'undefined') PMSApi.setToken(apiToken);
    }
  }
  function getSession() { return session; }

  function clearSession() {
    session = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(API_TOKEN_KEY);
      if (typeof PMSApi !== 'undefined') PMSApi.setToken(null);
    } catch (_) { /* ignore */ }
  }

  const TERMINAL_APPLICATION_STATUSES = Object.freeze([
    'Approved', 'Released', 'Refused', 'Deferred',
    'Parole Refused', 'Parole Granted', 'Pending Approval',
  ]);

  function isTerminalApplicationStatus(status) {
    return TERMINAL_APPLICATION_STATUSES.includes(status);
  }

  function isActiveParoleApplication(app) {
    if (!app?.status) return false;
    if (app.status === 'Draft') return false;
    return !isTerminalApplicationStatus(app.status);
  }

  function countUpcomingHearings(hearings = getHearings()) {
    return hearings.filter((h) => ['Scheduled', 'Upcoming'].includes(h.status)).length;
  }

  function countOverdueCaseEscalations(scopeInstitutionId = null) {
    const seen = new Set();
    return getEscalations(scopeInstitutionId).filter((e) => {
      if (e.type === 'contract_expiry') return false;
      if (e.type !== 'hearing_overdue' && e.severity !== 'high') return false;
      const key = e.applicationId || e.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).length;
  }

  function getDashboardStats(scopeInstitutionId = null) {
    if (typeof PMSEligibility !== 'undefined') PMSEligibility.syncAllPrisoners(null, data.applications);
    syncParoleNotifications(null);
    let prisoners = getPrisoners();
    let apps = getParoleApplications();
    if (scopeInstitutionId) {
      prisoners = prisoners.filter((p) => p.institutionId === scopeInstitutionId);
      apps = apps.filter((a) => a.institutionId === scopeInstitutionId);
    }
    const pendingNotifications = data.notifications.filter((n) => !n.read && !n.resolved).length;
    const hearings = getHearings();
    const users = data.users || [];
    const boardRoles = ['Parole Board Member', 'Doctor', 'CS Commissioner', 'DJAG Secretary'];
    const granted = apps.filter((a) => a.status === 'Approved' || a.status === 'Parole Granted' || a.formData?.form4?.status === 'Parole Granted').length;
    const refused = apps.filter((a) => ['Refused', 'Parole Refused'].includes(a.status) || a.formData?.form5?.status === 'Parole Refused').length;
    return {
      totalUsers: data.users.length,
      totalStaff: data.users.filter((u) => u.role !== 'System Administrator').length,
      totalOfficers: data.users.filter((u) => ['PNGCS Parole Clerk', 'CS Parole Officer', 'Jail Commander'].includes(u.role)).length,
      totalPrisoners: prisoners.length,
      totalInstitutions: data.institutions.length,
      totalParoleCases: apps.length,
      activeParoleApplications: apps.filter((a) => isActiveParoleApplication(a)).length,
      completedCases: apps.filter((a) => isTerminalApplicationStatus(a.status)).length,
      eligiblePrisoners: prisoners.filter((p) => getPrisonerProgress(p).eligible).length,
      pendingAssessments: apps.filter((a) => a.status === 'Pending Board Review' && !requiredBoardAssessmentsComplete(a)).length,
      upcomingHearings: countUpcomingHearings(hearings),
      overdueCases: countOverdueCaseEscalations(scopeInstitutionId),
      grantedParole: granted,
      refusedParole: refused,
      releasedPrisoners: prisoners.filter((p) => ['Released on Parole', 'Released'].includes(p.status)).length,
      activeBoardMembers: users.filter((u) => boardRoles.includes(u.role) && u.status === 'Active' && u.contractStatus !== 'Expired').length,
      expiredBoardMembers: users.filter((u) => boardRoles.includes(u.role) && (u.contractStatus === 'Expired' || u.status === 'Inactive')).length,
      pendingNotifications,
      escalations: getEscalations(scopeInstitutionId),
      applicationsByStatus: APPLICATION_STATUSES.reduce((acc, s) => {
        acc[s] = apps.filter((a) => a.status === s).length;
        return acc;
      }, {}),
    };
  }

  function reloadAll() {
    loaded = false;
    loadPromise = null;
    return ensureLoaded();
  }

  return {
    USER_ROLES, OFFICER_ROLES, BOARD_POSITIONS, PAROLE_FORMS, APPLICATION_STATUSES, PRISONER_STATUSES,
    DEFAULT_SETTINGS, DEMO_PASSWORDS, ensureLoaded, reloadAll, flushSyncToDatabase, isDatabaseSyncEnabled: () => dbSyncEnabled,
    getSettings, saveSettings, getAuditLogs, logAudit, validatePrisonerDates, applyPrisonerEligibility,
    getUsers, getUserById, getUserByUsername, saveUser, deleteUser, resetPassword, authenticate,
    getInstitutions, getInstitutionById, getActiveInstitutions: () => getInstitutions(true),
    getJailCommanderForInstitution, getJailCommanders, getCommanderProfile, saveCommanderProfile, getCommanderDetailBundle,
    getPrisonersByInstitution, getInstitutionStats,
    assignJailCommander, saveInstitution, deleteInstitution, getOfficersByInstitution,
    getPrisoners, getPrisonerById, getSentenceDurationMonths, getParoleEligibilityDate, getPrisonerProgress,
    savePrisoner, deletePrisoner, addPrisonerDocument, removePrisonerDocument, addCaseDocument, getCaseDocuments,
    DOCUMENT_CATEGORIES, BOARD_CONTRACT_YEARS,
    getParoleApplications, getApplicationById, saveParoleApplication, uploadApplicationForm,
    verifyApplicationForm, submitApplicationToDJAG, createEmptyForms, createEmptyFormData,
    saveFormData, saveForm1Screening, saveForm2Section, getOrCreateDraftApplication, isForm1Complete, isForm2Complete, needsDjagForm2Ppr, getApplicationsForDjagClerk, isForm3Complete, isForm4Complete, isForm5Complete,
    transitionApplication, recordBoardDecision, routeParoleOutcome, issueForm4Grant, issueForm5Refusal,
    getBoardDecisionOutcome, isBoardDecisionFinalized, canProceedToForm4, canProceedToForm5,
    getFormCompletionSummary, calculateParoleScore, getHearingDeadlineInfo,
    getCaseTimeline, getCaseTracker, getReleaseRequirements, getEscalations, runEscalationChecks,
    getOffenses, saveOffense, deleteOffense,
    saveBoardAssessment, getBoardAssessments, getBoardAssessmentProgress, getBoardAssessmentForActor,
    hasSubmittedBoardAssessment, requiredBoardAssessmentsComplete, calculateBoardVotes, finalizeBoardVotes,
    saveMedicalEvaluation, getMedicalEvaluations, isVerificationReady,
    isParoleGrantedForRelease,
    BOARD_ASSESSOR_ROLES, BOARD_VOTING_ROLES,
    getReleaseBlockers, canAuthorizeRelease, authorizeRelease, overrideEligibility, saveCommanderCaseReview,
    saveApprovalStep, getGuarantors, saveGuarantor, deleteGuarantor, requiredApprovalsComplete,
    generateCaseNumber, syncBoardContracts, isCommanderVerified, isForm1Verified, isVerificationReady,
    getHearings, getHearingById, getHearingsByPrisoner, getHearingsByApplication, saveHearing, HEARING_STATUSES, PAROLE_APPROVAL_THRESHOLD,
    getReports, createReport, previewNextId,
    getNotifications, getNotificationsForUser, getCalendarEventsForUser, syncParoleNotifications,
    markNotificationRead, resolveNotification, markAllNotificationsRead,
    getUnreadCount, getUnreadCountForUser,
    setSession, getSession, clearSession, getDashboardStats,
    TERMINAL_APPLICATION_STATUSES, isTerminalApplicationStatus, isActiveParoleApplication,
    countUpcomingHearings, countOverdueCaseEscalations,
  };
})();
