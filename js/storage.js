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
    'j.dole@cs.gov.pg': 'Password123!',
    'm.kila@djag.gov.pg': 'Password123!',
    's.tau@cs.gov.pg': 'Password123!',
    'h.morris@djag.gov.pg': 'Password123!',
    'r.sine@health.gov.pg': 'Password123!',
    't.bain@cs.gov.pg': 'Password123!',
    'p.koroma@cs.gov.pg': 'Password123!',
  };

  /** Unique 6-digit signing PINs for digital form authorization (demo). */
  const DEMO_SIGNING_PINS = {
    admin: '100001',
    'j.dole@cs.gov.pg': '000000',
    'm.kila@djag.gov.pg': '284719',
    's.tau@cs.gov.pg': '395826',
    'h.morris@djag.gov.pg': '471528',
    'r.sine@health.gov.pg': '583940',
    't.bain@cs.gov.pg': '692047',
    'p.koroma@cs.gov.pg': '715836',
  };

  const SIGNING_PINS_LS_KEY = 'pms_signing_pins_v1';

  const LEGACY_USERNAME_MAP = {
    'john.dole@cs.gov.pg': 'j.dole@cs.gov.pg',
    'mary.kila@djag.gov.pg': 'm.kila@djag.gov.pg',
    'officer.tau@cs.gov.pg': 's.tau@cs.gov.pg',
    'secretary.morris@djag.gov.pg': 'h.morris@djag.gov.pg',
    'dr.sine@health.gov.pg': 'r.sine@health.gov.pg',
    'commissioner.bain@cs.gov.pg': 't.bain@cs.gov.pg',
    'pkoroma@cs.gov.pg': 'p.koroma@cs.gov.pg',
    'commander@cs.gov.pg': 'p.koroma@cs.gov.pg',
  };

  function agencyDomainForRole(role) {
    if (role === 'Doctor') return 'health.gov.pg';
    if (['DJAG Parole Clerk', 'DJAG Secretary'].includes(role)) return 'djag.gov.pg';
    if (role === 'System Administrator') return 'pms.gov.pg';
    return 'cs.gov.pg';
  }

  function formatAgencyUsername(firstName, lastName, role) {
    if (role === 'System Administrator') return 'admin';
    const initial = String(firstName || '').trim().charAt(0).toLowerCase();
    const surname = String(lastName || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!initial || !surname) return '';
    return `${initial}.${surname}@${agencyDomainForRole(role)}`;
  }

  function addYearsToDate(isoDate, years) {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return null;
    d.setFullYear(d.getFullYear() + years);
    return d.toISOString().slice(0, 10);
  }

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

  function loadSigningPinsFromStorage() {
    try {
      const raw = localStorage.getItem(SIGNING_PINS_LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') Object.assign(DEMO_SIGNING_PINS, parsed);
    } catch (_) { /* ignore */ }
  }

  function persistSigningPins() {
    try { localStorage.setItem(SIGNING_PINS_LS_KEY, JSON.stringify(DEMO_SIGNING_PINS)); } catch (_) { /* ignore */ }
  }

  function generateUniqueSigningPin() {
    const used = new Set(Object.values(DEMO_SIGNING_PINS));
    let pin;
    do {
      pin = String(Math.floor(100000 + Math.random() * 900000));
    } while (used.has(pin));
    return pin;
  }

  function generateSigningPinForUser(user) {
    const seed = `${user?.id || ''}-${user?.username || ''}`;
    let h = 5381;
    for (let i = 0; i < seed.length; i += 1) {
      h = ((h << 5) + h) ^ seed.charCodeAt(i);
    }
    const pin = String((h >>> 0) % 900000 + 100000).padStart(6, '0');
    if (Object.values(DEMO_SIGNING_PINS).includes(pin)) return generateUniqueSigningPin();
    return pin;
  }

  function ensureUserSigningPin(user) {
    if (!user?.username) return null;
    const key = user.username.toLowerCase() === 'admin' ? 'admin' : user.username;
    if (!DEMO_SIGNING_PINS[key]) {
      DEMO_SIGNING_PINS[key] = generateSigningPinForUser(user);
      persistSigningPins();
    }
    return DEMO_SIGNING_PINS[key];
  }

  function verifySigningPin(user, pin) {
    if (!user || !/^\d{6}$/.test(String(pin || ''))) return false;
    ensureUserSigningPin(user);
    const key = user.username?.toLowerCase() === 'admin' ? 'admin' : user.username;
    return DEMO_SIGNING_PINS[key] === String(pin);
  }

  function getSigningPinForUser(userOrUsername) {
    const user = typeof userOrUsername === 'string'
      ? getUserByUsername(userOrUsername)
      : userOrUsername;
    if (!user) return null;
    return ensureUserSigningPin(user);
  }

  function ensureSigningPins() {
    if (!data?.users) return;
    let changed = false;
    data.users.forEach((u) => {
      const key = u.username?.toLowerCase() === 'admin' ? 'admin' : u.username;
      if (key && !DEMO_SIGNING_PINS[key]) {
        DEMO_SIGNING_PINS[key] = generateSigningPinForUser(u);
        changed = true;
      }
    });
    if (changed) persistSigningPins();
  }

  const USER_ROLES = [
    'System Administrator', 'CS Parole Officer', 'CS Parole Clerk', 'Jail Commander',
    'DJAG Parole Clerk', 'DJAG Secretary', 'Doctor', 'CS Commissioner',
  ];
  const OFFICER_ROLES = USER_ROLES.filter((r) => r !== 'System Administrator');
  const BOARD_POSITIONS = ['DJAG Secretary', 'PNGCS Commissioner', 'Psychiatrist'];
  const HEARING_DEADLINE_DAYS = 14;
  const LIFE_ELIGIBILITY_YEARS = 10;
  const BOARD_ASSESSOR_ROLES = Object.freeze(['Doctor', 'CS Commissioner', 'DJAG Secretary']);
  const BOARD_VOTING_ROLES = BOARD_ASSESSOR_ROLES;

  function isLifeSentence(p) {
    return p?.sentenceType === 'Life' || p?.sentence_type === 'Life';
  }

  function applyBoardMemberContract(user) {
    if (!BOARD_ASSESSOR_ROLES.includes(user.role)) return user;
    const start = user.contractStartDate || user.dateAppointed || new Date().toISOString().slice(0, 10);
    const expiry = user.contractExpiryDate || addYearsToDate(start, BOARD_CONTRACT_YEARS);
    return {
      ...user,
      contractStartDate: start,
      contractExpiryDate: expiry,
      contractStatus: user.contractStatus || 'Active',
    };
  }

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
    { number: 3, name: 'Form 3 — Institutional Report & Hearing Record' },
    { number: 4, name: 'Form 4 — Parole Granted' },
    { number: 5, name: 'Form 5 — Parole Refused' },
  ];
  const APPLICATION_STATUSES = [
    'Draft', 'Submitted', 'Under DJAG Review', 'Returned for Correction',
    'Pending Commander Review', 'Pre-Parole Report Prepared', 'Hearing Scheduled',
    'Hearing In Progress', 'Pending Board Review', 'Parole Granted', 'Parole Refused', 'Pending Approval',
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
    paroleEligibilityFraction: 1 / 2,
    paroleEligibilityLabel: 'One-half (1/2) of total sentence',
    systemName: 'Parole Management System',
    /** When false, frontend skips /api/parole/* mirror writes (legacy workflow only). */
    act1991ParoleSyncEnabled: false,
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
      dbSyncEnabled = false;
      console.warn('Database sync disabled — API session rejected; continuing with local storage.');
      return;
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
        { id: 'USR-000002', officerId: 'OFF-000001', employeeNumber: 'EMP-000002', username: 'j.dole@cs.gov.pg', email: 'j.dole@cs.gov.pg', firstName: 'John', lastName: 'Dole', role: 'CS Parole Clerk', rank: 'Parole Clerk', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Clerk', phone: '+675 7123 4567', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2020-05-10', lastLogin: '2026-07-29T14:00:00.000Z', profilePhoto: null },
        { id: 'USR-000003', officerId: 'OFF-000002', employeeNumber: 'EMP-000003', username: 'm.kila@djag.gov.pg', email: 'm.kila@djag.gov.pg', firstName: 'Mary', lastName: 'Kila', role: 'DJAG Parole Clerk', rank: 'Parole Clerk', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Clerk', phone: '+675 7234 5678', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2021-03-22', lastLogin: '2026-07-28T11:00:00.000Z', profilePhoto: null },
        { id: 'USR-000024', officerId: 'OFF-000024', employeeNumber: 'EMP-000024', username: 's.tau@cs.gov.pg', email: 's.tau@cs.gov.pg', firstName: 'Samuel', lastName: 'Tau', role: 'CS Parole Officer', rank: 'Parole Officer', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Officer', phone: '+675 7123 4500', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2021-08-01', lastLogin: '2026-07-20T09:00:00.000Z', profilePhoto: null },
        { id: 'USR-000025', officerId: 'OFF-000025', employeeNumber: 'EMP-000025', username: 'h.morris@djag.gov.pg', email: 'h.morris@djag.gov.pg', firstName: 'Helen', lastName: 'Morris', role: 'DJAG Secretary', rank: 'Secretary', institutionId: 'INS-000001', province: 'National Capital District', position: 'DJAG Secretary', phone: '+675 7234 5600', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'DJAG Secretary', contractStartDate: '2022-01-01', contractExpiryDate: '2027-01-01', contractStatus: 'Active', status: 'Active', dateAppointed: '2022-01-01', lastLogin: '2026-07-22T10:00:00.000Z', profilePhoto: null },
        { id: 'USR-000026', officerId: 'OFF-000026', employeeNumber: 'EMP-000026', username: 'r.sine@health.gov.pg', email: 'r.sine@health.gov.pg', firstName: 'Ruth', lastName: 'Sine', role: 'Doctor', rank: 'Psychiatrist', institutionId: 'INS-000001', province: 'National Capital District', position: 'Psychiatrist — Parole Board', phone: '+675 7345 6700', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'Psychiatrist', contractStartDate: '2022-01-01', contractExpiryDate: '2027-01-01', contractStatus: 'Active', status: 'Active', dateAppointed: '2022-01-01', lastLogin: '2026-07-18T11:00:00.000Z', profilePhoto: null },
        { id: 'USR-000027', officerId: 'OFF-000027', employeeNumber: 'EMP-000027', username: 't.bain@cs.gov.pg', email: 't.bain@cs.gov.pg', firstName: 'Thomas', lastName: 'Bain', role: 'CS Commissioner', rank: 'Commissioner', institutionId: 'INS-000001', province: 'National Capital District', position: 'PNGCS Commissioner', phone: '+675 7345 6800', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'PNGCS Commissioner', contractStartDate: '2022-01-01', contractExpiryDate: '2027-01-01', contractStatus: 'Active', status: 'Active', dateAppointed: '2022-01-01', lastLogin: '2026-07-19T09:30:00.000Z', profilePhoto: null },
        { id: 'USR-000028', officerId: 'OFF-000028', employeeNumber: 'EMP-000028', username: 'p.koroma@cs.gov.pg', email: 'p.koroma@cs.gov.pg', firstName: 'Peter', lastName: 'Koroma', role: 'Jail Commander', rank: 'Commander', institutionId: 'INS-000001', province: 'National Capital District', position: 'Jail Commander — Bomana', phone: '+675 7123 4600', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2019-04-01', lastLogin: '2026-07-25T08:00:00.000Z', profilePhoto: null },
      ],
      prisoners: [
        { id: 'PR-000001', prisonerNumber: 'PR-000001', institutionId: 'INS-000001', firstName: 'Paul', lastName: 'Kaupa', dateOfBirth: '1992-04-10', gender: 'Male', offense: 'Armed Robbery', sentenceStartDate: '2020-01-15', sentenceEndDate: '2030-01-15', status: 'Hearing Scheduled', documents: [] },
        { id: 'PR-000002', prisonerNumber: 'PR-000002', institutionId: 'INS-000001', firstName: 'Peter', lastName: 'Wama', dateOfBirth: '1988-09-18', gender: 'Male', offense: 'Unlawful Wounding', sentenceStartDate: '2019-06-01', sentenceEndDate: '2027-06-01', status: 'Assessment in Progress', documents: [] },
        { id: 'PR-000003', prisonerNumber: 'PR-000003', institutionId: 'INS-000001', firstName: 'Sarah', lastName: 'Tekate', dateOfBirth: '1995-12-01', gender: 'Female', offense: 'Grand Larceny', sentenceStartDate: '2022-03-10', sentenceEndDate: '2028-03-10', status: 'Assessment in Progress', documents: [] },
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
              recommendationReason: 'Meets one-half sentence threshold and eligibility criteria.',
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
          id: 'APP-000002', caseNumber: 'PMS-2026-000002', prisonerId: 'PR-000002', institutionId: 'INS-000001', status: 'Pending Commander Review',
          submittedAt: '2026-08-01', submittedBy: 'USR-000002',
          formData: {
            form1: {
              formId: 'F1-000002',
              status: 'submitted',
              screeningDate: '2026-08-01',
              eligibilityOutcome: 'eligible',
              recommendationReason: 'Eligible under one-half rule — Peter Wama.',
              officerName: 'John Dole',
              submittedAt: '2026-08-01T09:00:00.000Z',
              submittedBy: 'USR-000002',
            },
            form2: {
              formId: 'F2-000002',
              sections: {
                ddr: { submitted: true, confirmed: true, status: 'submitted', officerName: 'John Dole', submittedAt: '2026-08-05T10:00:00.000Z' },
                ppr: { submitted: true, confirmed: true, status: 'submitted', officerName: 'Mary Kila', submittedAt: '2026-08-08T11:00:00.000Z' },
              },
            },
            form3: {
              formId: 'F3-000003',
              status: 'submitted',
              submitted: true,
              commanderRecommendation: 'Recommended',
              institutionalRecommendation: 'Recommended',
              officerName: 'Mary Kila',
              submittedAt: '2026-08-10T14:00:00.000Z',
            },
            form4: {}, form5: {},
          },
          boardDecision: null, workflowNotes: [], createdAt: now,
        },
        {
          id: 'APP-000004', caseNumber: 'PMS-2026-000004', prisonerId: 'PR-000003', institutionId: 'INS-000001', status: 'Pre-Parole Report Prepared',
          submittedAt: '2026-07-15', submittedBy: 'USR-000002',
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
                  attachments: {
                    darConductDocs: [{
                      id: 'F2F-DEMO-DAR-CONDUCT',
                      fileName: 'DAR-Conduct-Report-Kaupa.txt',
                      fileType: 'text/plain',
                      fileSize: 48,
                      dataUrl: 'data:text/plain;base64,SW5zdGl0dXRpb25hbCBjb25kdWN0IGxvZyBmb3IgUGF1bCBLYXVwYQ==',
                      uploadedAt: '2026-07-10T10:00:00.000Z',
                      uploadedByName: 'John Dole',
                    }],
                    darHealthDocs: [{
                      id: 'F2F-DEMO-DAR-HEALTH',
                      fileName: 'DAR-Health-Summary-Kaupa.txt',
                      fileType: 'text/plain',
                      fileSize: 42,
                      dataUrl: 'data:text/plain;base64,SGVhbHRoIGFzc2Vzc21lbnQgc3VtbWFyeSAtIGNoYXJhY3Rlcg==',
                      uploadedAt: '2026-07-10T10:00:00.000Z',
                      uploadedByName: 'John Dole',
                    }],
                  },
                },
                ppr: {
                  submitted: true,
                  confirmed: true,
                  status: 'submitted',
                  officerName: 'Mary Kila',
                  submittedAt: '2026-07-12T11:00:00.000Z',
                  attachments: {
                    pprCommunityDocs: [{
                      id: 'F2F-DEMO-PPR-COMMUNITY',
                      fileName: 'PPR-Community-Interview-Kaupa.txt',
                      fileType: 'text/plain',
                      fileSize: 44,
                      dataUrl: 'data:text/plain;base64,Q29tbXVuaXR5IGxlYWRlciBpbnRlcnZpZXcgc3VtbWFyeQ==',
                      uploadedAt: '2026-07-12T11:00:00.000Z',
                      uploadedByName: 'Mary Kila',
                    }],
                    pprVictimImpactDocs: [{
                      id: 'F2F-DEMO-PPR-VICTIM',
                      fileName: 'PPR-Victim-Consultation-Kaupa.txt',
                      fileType: 'text/plain',
                      fileSize: 40,
                      dataUrl: 'data:text/plain;base64,VmljdGltIGltcGFjdCBjb25zdWx0YXRpb24gbm90ZXM=',
                      uploadedAt: '2026-07-12T11:00:00.000Z',
                      uploadedByName: 'Mary Kila',
                    }],
                  },
                },
              },
            },
            form3: {
              formId: 'F3-000002',
              status: 'approved',
              submitted: true,
              commanderRecommendation: 'Recommended',
              institutionalRecommendation: 'Recommended',
              officerName: 'Peter Koroma',
              submittedAt: '2026-07-14T15:00:00.000Z',
            },
            form4: { investigationSummary: 'Pre-parole investigation complete — Sarah Tekate' },
            form5: {},
          },
          preParoleReport: 'Institutional verification complete. Recommended for parole hearing.',
          commanderReview: {
            verifiedAt: '2026-07-14T15:00:00.000Z', reviewedAt: '2026-07-14T15:00:00.000Z',
            decision: 'Verified', recommendation: 'Recommended', verifiedBy: 'USR-000028',
            commanderId: 'USR-000028', commanderName: 'Peter Koroma', finalized: true,
            prisonerId: 'PR-000003', caseNumber: 'PMS-2026-000004',
          },
          boardDecision: null, workflowNotes: [], createdAt: now,
        },
      ],
      hearings: [
        { id: 'HRG-000001', applicationId: 'APP-000001', prisonerId: 'PR-000001', institutionId: 'INS-000001', scheduledDate: '2026-09-18', scheduledTime: '14:00', location: 'PNG CS HQ Conference Room 3', notes: 'Board hearing — Paul Kaupa', status: 'Scheduled', boardMembers: ['USR-000025', 'USR-000026', 'USR-000027'] },
      ],
      notifications: [
        { id: 'NOT-000001', type: 'eligibility', title: 'Parole Eligibility Alert', message: 'Paul Kaupa (PR-000001) has reached parole eligibility threshold.', recipientRole: 'CS Parole Clerk', recipientUserId: 'USR-000002', institutionId: 'INS-000001', prisonerId: 'PR-000001', eligibleDate: '2025-01-15', linkPanel: 'eligibility', read: false, resolved: false, createdAt: '2026-01-15T08:00:00.000Z', dedupeKey: 'eligibility:PR-000001:USR-000002:Parole Eligibility Alert' },
        { id: 'NOT-000003', type: 'eligibility', title: 'Parole Eligibility Alert', message: 'Paul Kaupa (PR-000001) reached eligibility: One-half (1/2) of total sentence.', recipientRole: 'System Administrator', recipientUserId: null, institutionId: 'INS-000001', prisonerId: 'PR-000001', eligibleDate: '2025-01-15', linkPanel: 'eligibility', read: false, resolved: false, createdAt: '2026-01-15T08:00:00.000Z', dedupeKey: 'eligibility:PR-000001:System Administrator:Parole Eligibility Alert' },
        { id: 'NOT-000005', type: 'escalation', title: 'Hearing Overdue', message: 'Case PMS-2026-000004 (Sarah Tekate) is overdue for hearing scheduling.', recipientRole: 'DJAG Secretary', recipientUserId: 'USR-000025', institutionId: 'INS-000001', prisonerId: 'PR-000003', applicationId: 'APP-000004', linkPanel: 'hearings', read: false, resolved: false, createdAt: '2026-07-15T08:00:00.000Z', dedupeKey: 'escalation:APP-000004:DJAG Secretary:Hearing Overdue' },
        { id: 'NOT-000006', type: 'board_review', title: 'Submit Board Assessment', message: 'Parole hearing scheduled for Paul Kaupa (PMS-2026-000001) — submit your Approve, Deny, or Defer vote when ready.', recipientRole: 'DJAG Secretary', recipientUserId: 'USR-000025', institutionId: 'INS-000001', prisonerId: 'PR-000001', applicationId: 'APP-000001', linkPanel: 'decisions', read: false, resolved: false, createdAt: '2026-06-20T09:00:00.000Z', dedupeKey: 'board_review:APP-000001:DJAG Secretary:Submit Board Assessment' },
      ],
      auditLogs: [
        { id: 'AUD-000001', userId: 'USR-000002', userName: 'John Dole', role: 'CS Parole Clerk', action: 'CREATE', entity: 'ParoleApplication', entityId: 'APP-000001', details: 'Submitted parole application for Paul Kaupa', timestamp: '2026-06-15T10:30:00.000Z' },
        { id: 'AUD-000002', userId: 'USR-000001', userName: 'System Administrator', role: 'System Administrator', action: 'LOGIN', entity: 'Session', entityId: 'USR-000001', details: 'Administrator signed in', timestamp: '2026-07-30T09:00:00.000Z' },
        { id: 'AUD-000003', userId: 'USR-000002', userName: 'John Dole', role: 'CS Parole Clerk', action: 'APPROVE', entity: 'InstitutionReport', entityId: 'INS-000001', details: 'Approved institutional report', timestamp: '2026-06-20T14:00:00.000Z' },
      ],
      reports: [
        { id: 'RPT-000001', institutionId: 'INS-000001', type: 'institutional', title: 'Institutional Report', status: 'Approved', createdBy: 'USR-000002', createdAt: '2026-06-20T14:00:00.000Z' },
      ],
      paroleGrantedArchive: [],
    };
    PMSIdGenerator.ensureCounters(seed);
    return seed;
  }

  function notifyDataChange(detail = {}) {
    if (typeof window === 'undefined') return;
    try {
      window.dispatchEvent(new CustomEvent('pms:data-changed', {
        detail: { ...detail, at: Date.now() },
      }));
    } catch (_) { /* ignore */ }
  }

  function persist(meta = {}) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) { console.warn('Storage persist failed', e); }
    if (dbSyncEnabled) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        syncToDatabase().catch((err) => console.warn('MySQL sync failed:', err.message));
      }, 400);
    }
    notifyDataChange(meta);
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
      migrateRoleCorrections();
      syncBoardContracts();
      migrateCaseNumbers();
      migrateNotifications();
      mergeSeedUsers();
      loadSigningPinsFromStorage();
      ensureSigningPins();
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

  function migrateEligibilitySettings() {
    if (!data?.settings) return;
    const f = Number(data.settings.paroleEligibilityFraction);
    if (Math.abs(f - (1 / 3)) < 0.001 || f === 0.333333) {
      data.settings.paroleEligibilityFraction = 0.5;
      data.settings.paroleEligibilityLabel = 'One-half (1/2) of total sentence';
    }
    if (/one-third|1\/3/i.test(data.settings.paroleEligibilityLabel || '')) {
      data.settings.paroleEligibilityLabel = 'One-half (1/2) of total sentence';
      data.settings.paroleEligibilityFraction = 0.5;
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
        if (n.message && /one-third|1\/3/i.test(n.message)) {
          n.message = n.message.replace(/One-third \(1\/3\) of total sentence/gi, 'One-half (1/2) of total sentence');
        }
      });
    }
    migrateEligibilitySettings();
    migrateDemoApplications();
    syncAllApplicationWorkflowStates();
    persist();
  }

  /** Rename legacy roles and retire obsolete Parole Board Member accounts. */
  function migrateRoleCorrections() {
    const roleMap = {
      'PNGCS Parole Clerk': 'CS Parole Clerk',
      'PNG Parole Clerk': 'CS Parole Clerk',
    };
    const renameRole = (value) => roleMap[value] || value;

    data.users?.forEach((u) => {
      if (roleMap[u.role]) u.role = roleMap[u.role];
      if (u.role === 'Parole Board Member') {
        u.status = 'Inactive';
        u.accountStatus = 'Inactive';
      }
      const canonical = formatAgencyUsername(u.firstName, u.lastName, u.role);
      const legacyKey = u.username?.toLowerCase();
      const mapped = LEGACY_USERNAME_MAP[legacyKey];
      const nextUsername = mapped || canonical;
      if (nextUsername && nextUsername !== u.username) {
        if (DEMO_PASSWORDS[u.username] && !DEMO_PASSWORDS[nextUsername]) {
          DEMO_PASSWORDS[nextUsername] = DEMO_PASSWORDS[u.username];
        }
        delete DEMO_PASSWORDS[u.username];
        u.username = nextUsername;
        u.email = nextUsername;
      } else if (canonical && (!u.email || u.email === legacyKey) && u.role !== 'System Administrator') {
        u.email = u.username;
      }
      const boardPosMap = {
        'Medical Member': 'Psychiatrist',
        Psychiatric: 'Psychiatrist',
        'Commissioner PNGCS': 'PNGCS Commissioner',
      };
      if (u.boardPosition && boardPosMap[u.boardPosition]) {
        u.boardPosition = boardPosMap[u.boardPosition];
      }
      Object.assign(u, applyBoardMemberContract(u));
    });
    data.notifications?.forEach((n) => {
      if (roleMap[n.recipientRole]) n.recipientRole = roleMap[n.recipientRole];
      if (n.recipientRole === 'Parole Board Member') n.recipientRole = 'DJAG Secretary';
    });
    data.auditLog?.forEach((a) => {
      if (roleMap[a.role]) a.role = roleMap[a.role];
    });
    data.applications?.forEach((app) => {
      app.boardAssessments?.forEach((a) => {
        if (a.boardPosition === 'Medical Member' || a.boardPosition === 'Psychiatric') {
          a.boardPosition = 'Psychiatrist';
        }
        if (a.boardPosition === 'Commissioner PNGCS') a.boardPosition = 'PNGCS Commissioner';
      });
      app.approvalSteps?.forEach((s) => {
        if (roleMap[s.role]) s.role = roleMap[s.role];
        if (s.role === 'Parole Board Member') s.role = 'DJAG Secretary';
      });
      if (app.boardDecision?.decidedBy === 'USR-000005') app.boardDecision.decidedBy = 'USR-000025';
    });
    data.hearings?.forEach((h) => {
      if (!h.boardMembers?.length) return;
      h.boardMembers = h.boardMembers
        .map((id) => (id === 'USR-000005' ? 'USR-000025' : id))
        .filter((id) => data.users.some((u) => u.id === id && u.status === 'Active'));
      if (!h.boardMembers.length) h.boardMembers = ['USR-000025', 'USR-000026', 'USR-000027'];
    });
  }

  function buildDemoDigitalSignature({
    officerName = 'John Dole',
    officerId = 'OFF-000001',
    userId = 'USR-000002',
    timestamp,
    applicationId = '',
    formNumber = 1,
  } = {}) {
    const ts = timestamp || new Date().toISOString();
    return {
      verified: true,
      officerId,
      officerName,
      role: 'CS Parole Clerk',
      userId,
      timestamp: ts,
      ipAddress: '10.0.4.122',
      sha256: `demo${String(applicationId).replace(/\W/g, '')}f${formNumber}`.padEnd(24, '0'),
      formNumber,
      applicationId,
    };
  }

  function ensureForm1SubmittedRecord(form1, {
    applicationId,
    screeningDate,
    officerName = 'John Dole',
    officerId = 'OFF-000001',
    submittedBy = 'USR-000002',
  } = {}) {
    if (!form1) return form1;
    const date = screeningDate || form1.screeningDate || new Date().toISOString().slice(0, 10);
    const submittedAt = form1.submittedAt || `${date}T10:00:00.000Z`;
    const prior = form1.sectionE || form1.sections?.E || {};
    const digitalSignature = prior.digital_signature || prior.digitalSignature || form1.digitalSignature
      || buildDemoDigitalSignature({
        officerName: form1.officerName || officerName,
        officerId: form1.officerId || officerId,
        userId: form1.submittedBy || submittedBy,
        timestamp: submittedAt,
        applicationId,
      });
    const sectionE = {
      eligibility_assessment: prior.eligibility_assessment
        || (form1.eligibilityOutcome === 'not_eligible' ? 'not_eligible' : 'eligible'),
      prisoner_consent: form1.eligibilityOutcome !== 'not_eligible',
      consent_date: prior.consent_date || prior.consentDate || date,
      digital_signature: digitalSignature,
      officer_signature: prior.officer_signature || form1.officerName || officerName,
      officer_sign_date: prior.officer_sign_date || prior.officerSignDate || date,
      signature: 'Recorded in PMS',
    };
    return {
      ...form1,
      status: form1.status === 'verified' ? 'verified' : 'submitted',
      submittedAt,
      submittedBy: form1.submittedBy || submittedBy,
      screeningDate: date,
      eligibilityOutcome: form1.eligibilityOutcome || 'eligible',
      recommendationReason: form1.recommendationReason || 'Meets parole eligibility criteria.',
      officerName: form1.officerName || officerName,
      officerId: form1.officerId || officerId,
      sectionE,
      sections: { ...(form1.sections || {}), E: sectionE },
      digitalSignature,
    };
  }

  function buildDemoCommanderReview({
    prisonerId,
    caseNumber,
    verifiedAt = '2026-07-14T15:00:00.000Z',
  }) {
    return {
      commanderId: 'USR-000028',
      commanderName: 'Peter Koroma',
      institutionId: 'INS-000001',
      prisonerId,
      caseNumber,
      decision: 'Verified',
      recommendation: 'Recommended',
      reviewedAt: verifiedAt,
      verifiedAt,
      verifiedBy: 'USR-000028',
      finalized: true,
      comments: 'Institutional verification complete — case package approved.',
    };
  }

  function getDemoForm2AttachmentBundle() {
    return {
      ddr: {
        darConductDocs: [{
          id: 'F2F-DEMO-DAR-CONDUCT',
          fileName: 'DAR-Conduct-Report.txt',
          fileType: 'text/plain',
          fileSize: 48,
          dataUrl: 'data:text/plain;base64,SW5zdGl0dXRpb25hbCBjb25kdWN0IGxvZyBmb3IgZGVtbyByZWNvcmQ=',
          uploadedAt: '2026-07-10T10:00:00.000Z',
          uploadedByName: 'John Dole',
        }],
        darHealthDocs: [{
          id: 'F2F-DEMO-DAR-HEALTH',
          fileName: 'DAR-Health-Summary.txt',
          fileType: 'text/plain',
          fileSize: 42,
          dataUrl: 'data:text/plain;base64,SGVhbHRoIGFzc2Vzc21lbnQgc3VtbWFyeSAtIGNoYXJhY3Rlcg==',
          uploadedAt: '2026-07-10T10:00:00.000Z',
          uploadedByName: 'John Dole',
        }],
      },
      ppr: {
        pprCommunityDocs: [{
          id: 'F2F-DEMO-PPR-COMMUNITY',
          fileName: 'PPR-Community-Interview.txt',
          fileType: 'text/plain',
          fileSize: 44,
          dataUrl: 'data:text/plain;base64,Q29tbXVuaXR5IGxlYWRlciBpbnRlcnZpZXcgc3VtbWFyeQ==',
          uploadedAt: '2026-07-12T11:00:00.000Z',
          uploadedByName: 'Mary Kila',
        }],
        pprVictimImpactDocs: [{
          id: 'F2F-DEMO-PPR-VICTIM',
          fileName: 'PPR-Victim-Consultation.txt',
          fileType: 'text/plain',
          fileSize: 40,
          dataUrl: 'data:text/plain;base64,VmljdGltIGltcGFjdCBjb25zdWx0YXRpb24gbm90ZXM=',
          uploadedAt: '2026-07-12T11:00:00.000Z',
          uploadedByName: 'Mary Kila',
        }],
      },
    };
  }

  function syncPrisonerParoleStatus(prisoner, app) {
    if (!prisoner || !app) return false;
    if (isTerminalApplicationStatus(app.status)) return false;
    if (['Released on Parole', 'Released'].includes(prisoner.status)) return false;
    let next = prisoner.status;
    if (app.status === 'Hearing Scheduled' || app.status === 'Hearing In Progress') next = 'Hearing Scheduled';
    else if (app.status === 'Pending Board Review') next = 'Board Review';
    else if (['Pre-Parole Report Prepared', 'Pending Commander Review', 'Submitted', 'Under DJAG Review'].includes(app.status)) {
      next = 'Assessment in Progress';
    } else if (app.status === 'Draft') {
      const prog = getPrisonerProgress(prisoner);
      next = prog.eligible ? 'Eligible for Parole Application' : prisoner.status;
    }
    if (next !== prisoner.status) {
      prisoner.status = next;
      return true;
    }
    return false;
  }

  const POST_HEARING_SCHEDULE_STATUSES = [
    'Hearing Scheduled', 'Hearing In Progress', 'Pending Board Review', 'Parole Granted', 'Parole Refused',
    'Pending Approval', 'Approved', 'Refused', 'Released', 'Deferred',
  ];

  /** Statuses at or after commander sign-off — do not re-queue for verification. */
  const POST_COMMANDER_VERIFICATION_STATUSES = [
    'Pre-Parole Report Prepared', ...POST_HEARING_SCHEDULE_STATUSES,
  ];

  function findActiveHearingRecord(applicationId) {
    const active = (data.hearings || []).filter(
      (h) => h.applicationId === applicationId && !['Cancelled', 'Completed'].includes(h.status),
    );
    if (!active.length) return null;
    return active.sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || b.scheduledDate || 0)
        - new Date(a.updatedAt || a.createdAt || a.scheduledDate || 0),
    )[0];
  }

  function hearingRecencyScore(h) {
    return new Date(h?.updatedAt || h?.createdAt || h?.scheduledDate || 0).getTime();
  }

  function dedupeActiveHearingsPerApplication() {
    if (!data?.hearings) return;
    const winners = new Map();
    data.hearings.forEach((h) => {
      if (!h.applicationId || ['Cancelled', 'Completed'].includes(h.status)) return;
      const prev = winners.get(h.applicationId);
      if (!prev || hearingRecencyScore(h) >= hearingRecencyScore(prev)) {
        winners.set(h.applicationId, h);
      }
    });
    data.hearings.forEach((h) => {
      if (!h.applicationId || ['Cancelled', 'Completed'].includes(h.status)) return;
      const winner = winners.get(h.applicationId);
      if (winner && winner.id !== h.id) {
        h.status = 'Cancelled';
        h.supersededAt = h.supersededAt || new Date().toISOString();
        h.supersededReason = h.supersededReason || 'Superseded by rescheduled hearing';
      }
    });
  }

  function getScheduledHearings() {
    dedupeActiveHearingsPerApplication();
    const byApp = new Map();
    (data.hearings || [])
      .filter((h) => h.applicationId && ['Scheduled', 'Upcoming'].includes(h.status))
      .sort((a, b) => hearingRecencyScore(b) - hearingRecencyScore(a))
      .forEach((h) => {
        if (!byApp.has(h.applicationId)) byApp.set(h.applicationId, h);
      });
    return Array.from(byApp.values()).sort(
      (a, b) => new Date(a.scheduledDate || 0) - new Date(b.scheduledDate || 0),
    );
  }

  function syncHearingApplicationStatuses() {
    if (!data?.hearings || !data?.applications) return;
    data.hearings.forEach((h) => {
      if (!h.applicationId || !h.scheduledDate || ['Cancelled', 'Completed'].includes(h.status)) return;
      const app = data.applications.find((a) => a.id === h.applicationId);
      if (!app) return;
      if (['Pre-Parole Report Prepared', 'Pending Commander Review', 'Submitted', 'Under DJAG Review'].includes(app.status)) {
        app.status = 'Hearing Scheduled';
      }
    });
  }

  function preserveScheduledHearings() {
    if (!data?.hearings) return;
    const preHearingStatuses = ['Draft', 'Submitted', 'Pending Commander Review', 'Pre-Parole Report Prepared', 'Returned for Correction'];
    data.hearings = data.hearings.filter((h) => {
      const linked = data.applications.find((a) => a.id === h.applicationId);
      if (!linked) return false;
      if (['Cancelled', 'Completed'].includes(h.status)) return true;
      if (h.scheduledDate && h.location) return true;
      if (preHearingStatuses.includes(linked.status) && linked.id !== 'APP-000001') return false;
      return POST_HEARING_SCHEDULE_STATUSES.includes(linked.status) || linked.id === 'APP-000001';
    });
  }

  /** Repair demo cases and reconcile workflow state for all parole applications. */
  function migrateDemoApplications() {
    if (!data?.applications) return;

    // Remove retired duplicate Peter Wama case (historical APP-000003).
    data.applications = data.applications.filter((a) => a.id !== 'APP-000003');
    if (data.auditLogs) {
      data.auditLogs = data.auditLogs.filter((a) => a.entityId !== 'APP-000003');
    }

    const app2Template = {
      id: 'APP-000002', caseNumber: 'PMS-2026-000002', prisonerId: 'PR-000002', institutionId: 'INS-000001',
      status: 'Pending Commander Review', submittedAt: '2026-08-01', submittedBy: 'USR-000002',
      formData: {
        form1: {
          formId: 'F1-000002', status: 'submitted', screeningDate: '2026-08-01', submittedAt: '2026-08-01T10:00:00.000Z',
          eligibilityOutcome: 'eligible',
          recommendationReason: 'Eligible under one-half rule — Peter Wama.',
          officerName: 'John Dole', officerId: 'OFF-000001', submittedBy: 'USR-000002',
        },
        form2: {
          formId: 'F2-000002',
          sections: {
            ddr: {
              submitted: true, confirmed: true, status: 'submitted', officerName: 'John Dole',
              institutionName: 'Bomana Correctional Institution',
              assessmentSummary: 'Satisfactory conduct and program participation during custody.',
              submittedAt: '2026-08-05T10:00:00.000Z',
            },
            ppr: {
              submitted: true, confirmed: true, status: 'submitted', clerkName: 'Mary Kila', pprOfficer: 'Mary Kila',
              personalParticulars: 'Family and community review completed with supporting statements.',
              submittedAt: '2026-08-08T11:00:00.000Z',
            },
          },
        },
        form3: {
          formId: 'F3-000003',
          status: 'submitted',
          submitted: true,
          conductDuringSentence: 'Good conduct with no major incidents in the last 12 months.',
          programParticipation: 'Completed vocational training and counselling programs.',
          institutionalRecommendation: 'Recommended',
          commanderRecommendation: 'Recommended',
          officerName: 'John Dole',
          submittedAt: '2026-08-10T14:00:00.000Z',
        },
        form4: {}, form5: {},
      },
      boardDecision: null, workflowNotes: [], createdAt: new Date().toISOString(),
    };

    data.applications?.forEach((application) => {
      const f1 = application.formData?.form1;
      if (!f1) return;
      const shouldBeSubmitted = f1.status === 'submitted' || f1.status === 'verified'
        || f1.eligibilityOutcome || f1.submittedAt;
      if (shouldBeSubmitted) {
        application.formData.form1 = ensureForm1SubmittedRecord(f1, {
          applicationId: application.id,
          screeningDate: f1.screeningDate,
          officerName: f1.officerName,
          officerId: f1.officerId,
          submittedBy: f1.submittedBy || application.submittedBy,
        });
      }
    });

    let app2 = data.applications.find((a) => a.id === 'APP-000002' && a.prisonerId === 'PR-000002');
    if (!app2) {
      data.applications.push({ ...app2Template });
      app2 = data.applications.find((a) => a.id === 'APP-000002');
    } else {
      const summary = getFormCompletionSummary(app2);
      app2.formData = app2.formData || createEmptyFormData();
      if (!summary.checks.form1) app2.formData.form1 = { ...app2Template.formData.form1, ...(app2.formData.form1 || {}) };
      if (!summary.checks.form2) app2.formData.form2 = { ...app2Template.formData.form2, ...(app2.formData.form2 || {}) };
      if (!summary.checks.form3) app2.formData.form3 = { ...app2Template.formData.form3, ...(app2.formData.form3 || {}) };
      if (!summary.checks.form1 || !summary.checks.form2 || !summary.checks.form3) {
        app2.status = 'Pending Commander Review';
        app2.submittedAt = app2.submittedAt || app2Template.submittedAt;
        app2.submittedBy = app2.submittedBy || app2Template.submittedBy;
        app2.caseNumber = app2.caseNumber || app2Template.caseNumber;
      }
      if (app2.formData?.form1) {
        app2.formData.form1 = ensureForm1SubmittedRecord(app2.formData.form1, {
          applicationId: app2.id,
          screeningDate: app2.formData.form1.screeningDate,
          officerName: app2.formData.form1.officerName,
          officerId: app2.formData.form1.officerId,
          submittedBy: app2.formData.form1.submittedBy || app2.submittedBy,
        });
      }
    }

    if (data.hearings && app2) {
      const preHearingStatuses = ['Draft', 'Submitted', 'Pending Commander Review', 'Pre-Parole Report Prepared', 'Returned for Correction'];
      const app2Hearing = findActiveHearingRecord('APP-000002');
      if (preHearingStatuses.includes(app2.status) && !app2Hearing?.scheduledDate) {
        data.hearings = data.hearings.filter((h) => h.applicationId !== 'APP-000002');
      }
    }

    if (app2 && ['Draft', 'Submitted'].includes(app2.status)) {
      const summary = getFormCompletionSummary(app2);
      if (summary.checks.form1 && summary.checks.form2 && summary.checks.form3 && !isCommanderVerified(app2)) {
        app2.status = 'Pending Commander Review';
        app2.submittedAt = app2.submittedAt || '2026-08-01';
        app2.submittedBy = app2.submittedBy || 'USR-000002';
      }
    }

    const demoForm2AttachmentBundle = getDemoForm2AttachmentBundle();

    const app1 = data.applications.find((a) => a.id === 'APP-000001' && a.prisonerId === 'PR-000001');
    if (app1) {
      app1.formData = app1.formData || createEmptyFormData();
      app1.formData.form1 = ensureForm1SubmittedRecord(app1.formData.form1 || {}, {
        applicationId: app1.id,
        screeningDate: '2026-06-15',
      });
      app1.formData.form2 = {
        formId: 'F2-000001',
        sections: {
          ddr: {
            submitted: true,
            confirmed: true,
            status: 'submitted',
            officerName: 'John Dole',
            darOfficer: 'John Dole',
            institutionName: 'Bomana Correctional Institution',
            assessmentSummary: 'Satisfactory conduct and program participation.',
            submittedAt: '2026-06-18T10:00:00.000Z',
            attachments: { ...(demoForm2AttachmentBundle.ddr || {}) },
          },
          ppr: {
            submitted: true,
            confirmed: true,
            status: 'submitted',
            officerName: 'Mary Kila',
            pprOfficer: 'Mary Kila',
            personalParticulars: 'Family and community review completed.',
            submittedAt: '2026-06-22T11:00:00.000Z',
            attachments: { ...(demoForm2AttachmentBundle.ppr || {}) },
          },
        },
      };
      app1.formData.form3 = {
        formId: 'F3-000001',
        status: 'submitted',
        submitted: true,
        conductDuringSentence: 'Good institutional conduct throughout sentence.',
        programParticipation: 'Completed vocational and rehabilitation programs.',
        institutionalRecommendation: 'Recommended',
        commanderRecommendation: 'Recommended',
        officerName: 'John Dole',
        submittedAt: '2026-06-25T14:00:00.000Z',
      };
      app1.commanderReview = buildDemoCommanderReview({
        prisonerId: 'PR-000001',
        caseNumber: app1.caseNumber || 'PMS-2026-000001',
        verifiedAt: '2026-06-28T15:00:00.000Z',
      });
      app1.hearingSchedulingAt = app1.hearingSchedulingAt || '2026-06-28T15:00:00.000Z';
      app1.preParoleReport = app1.preParoleReport || 'Institutional verification complete. Recommended for parole hearing.';
      if (!POST_HEARING_SCHEDULE_STATUSES.includes(app1.status)) {
        app1.status = 'Hearing Scheduled';
      }
      app1.submittedAt = app1.submittedAt || '2026-06-15';
      app1.submittedBy = app1.submittedBy || 'USR-000002';
    }

    data.paroleGrantedArchive = data.paroleGrantedArchive || [];
    data.applications.forEach((app) => {
      if (!isForm4Issued(app)) return;
      if (!app.archived) {
        app.archived = true;
        app.archivedAt = app.formData?.form4?.issuedAt || app.updatedAt || new Date().toISOString();
        app.archiveReason = 'Parole Granted — Form 4 issued';
        if (app.status !== 'Approved' && app.status !== 'Released') app.status = 'Approved';
      }
      recordParoleGrantedArchive(app, { id: 'USR-000001', firstName: 'System', lastName: 'Migration', role: 'System Administrator' });
    });

    if (app2) {
      app2.formData.form1 = ensureForm1SubmittedRecord(app2.formData.form1 || app2Template.formData.form1, {
        applicationId: app2.id,
        screeningDate: '2026-08-01',
      });
      const app2Verified = isCommanderVerified(app2) || isCommanderVerificationLocked(app2);
      if (!app2Verified) {
        delete app2.commanderReview;
        delete app2.hearingSchedulingAt;
        delete app2.commanderVerificationDraft;
        app2.status = 'Pending Commander Review';
        const p2 = data.prisoners?.find((p) => p.id === 'PR-000002');
        if (p2?.verificationHistory?.length) {
          p2.verificationHistory = p2.verificationHistory.filter((row) => row.applicationId !== 'APP-000002');
        }
      }
    }

    const app4 = data.applications.find((a) => a.id === 'APP-000004' && a.prisonerId === 'PR-000003');
    if (app4) {
      app4.formData = app4.formData || createEmptyFormData();
      app4.formData.form1 = ensureForm1SubmittedRecord(app4.formData.form1 || {}, {
        applicationId: app4.id,
        screeningDate: '2026-07-01',
      });
      if (!isForm2Complete(app4.formData.form2)) {
        app4.formData.form2 = {
          formId: 'F2-000003',
          sections: {
            ddr: {
              submitted: true,
              confirmed: true,
              status: 'submitted',
              officerName: 'John Dole',
              darOfficer: 'John Dole',
              submittedAt: '2026-07-10T10:00:00.000Z',
              attachments: { ...(demoForm2AttachmentBundle.ddr || {}) },
            },
            ppr: {
              submitted: true,
              confirmed: true,
              status: 'submitted',
              officerName: 'Mary Kila',
              pprOfficer: 'Mary Kila',
              submittedAt: '2026-07-12T11:00:00.000Z',
              attachments: { ...(demoForm2AttachmentBundle.ppr || {}) },
            },
          },
        };
      }
      app4.formData.form3 = {
        formId: 'F3-000002',
        status: 'submitted',
        submitted: true,
        conductDuringSentence: 'Consistent good conduct during current sentence.',
        programParticipation: 'Active in vocational training and counselling.',
        commanderRecommendation: 'Recommended',
        institutionalRecommendation: 'Recommended',
        officerName: 'Peter Koroma',
        submittedAt: '2026-07-14T15:00:00.000Z',
      };
      app4.formData.form4 = { ...(app4.formData.form4 || {}), investigationSummary: 'Pre-parole investigation complete — Sarah Tekate' };
      app4.preParoleReport = app4.preParoleReport || 'Institutional verification complete. Recommended for parole hearing.';
      const app4Hearing = findActiveHearingRecord('APP-000004');
      const app4Scheduled = POST_HEARING_SCHEDULE_STATUSES.includes(app4.status) || !!app4Hearing?.scheduledDate;
      if (!app4.commanderReview && !app4Scheduled) {
        app4.commanderReview = buildDemoCommanderReview({
          prisonerId: 'PR-000003',
          caseNumber: app4.caseNumber || 'PMS-2026-000004',
          verifiedAt: '2026-07-14T15:00:00.000Z',
        });
      }
      app4.hearingSchedulingAt = app4.hearingSchedulingAt || '2026-07-14T15:00:00.000Z';
      if (!app4Scheduled) {
        app4.status = 'Pre-Parole Report Prepared';
      } else if (app4Hearing && app4.status === 'Pre-Parole Report Prepared') {
        app4.status = 'Hearing Scheduled';
      }
      app4.submittedAt = app4.submittedAt || '2026-07-15';
      app4.submittedBy = app4.submittedBy || 'USR-000002';
    }

    syncHearingApplicationStatuses();
    preserveScheduledHearings();
    dedupeActiveHearingsPerApplication();

    if (app1 && !data.hearings.some((h) => h.applicationId === 'APP-000001' && !['Cancelled', 'Completed'].includes(h.status))) {
      data.hearings.push({
        id: 'HRG-000001',
        applicationId: 'APP-000001',
        prisonerId: 'PR-000001',
        institutionId: 'INS-000001',
        scheduledDate: '2026-09-18',
        scheduledTime: '14:00',
        location: 'PNG CS HQ Conference Room 3',
        notes: 'Board hearing — Paul Kaupa',
        status: 'Scheduled',
        boardMembers: ['USR-000025', 'USR-000026', 'USR-000027'],
      });
    }

    data.applications.forEach((application) => {
      const review = application.commanderReview;
      if (review && application.prisonerId && review.prisonerId !== application.prisonerId) {
        review.prisonerId = application.prisonerId;
        review.caseNumber = application.caseNumber || application.id;
      }
    });

    data.applications?.forEach((application) => {
      promoteToCommanderReviewIfReady(application);
      reconcileCommanderVerification(application);
    });

    data.prisoners?.forEach((prisoner) => {
      const app = data.applications.find(
        (a) => a.prisonerId === prisoner.id && !isTerminalApplicationStatus(a.status),
      );
      if (app) syncPrisonerParoleStatus(prisoner, app);
    });
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
      const boardRoles = ['Doctor', 'CS Commissioner', 'DJAG Secretary'];
      if (boardRoles.includes(u.role)) {
        const patched = applyBoardMemberContract(u);
        if (patched.contractStartDate !== u.contractStartDate || patched.contractExpiryDate !== u.contractExpiryDate) {
          u.contractStartDate = patched.contractStartDate;
          u.contractExpiryDate = patched.contractExpiryDate;
          u.contractStatus = patched.contractStatus;
          changed = true;
        }
      }
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

  function syncApplicationProgress(appId) {
    const app = getApplicationById(appId);
    if (!app) return null;
    const tracker = getCaseTracker(appId);
    const summary = getFormCompletionSummary(app);
    const current = tracker.find((s) => s.status === 'current') || tracker.find((s) => !s.done);
    app.paroleProgress = {
      stages: tracker,
      formChecks: { ...summary.checks },
      completedStages: tracker.filter((s) => s.done).length,
      totalStages: tracker.length,
      currentStage: current?.label || (tracker.every((s) => s.done) ? 'Complete' : app.status),
      applicationStatus: app.status,
      updatedAt: new Date().toISOString(),
    };
    return app.paroleProgress;
  }

  function syncAllApplicationProgress() {
    if (!data?.applications) return;
    data.applications.forEach((app) => syncApplicationProgress(app.id));
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
      { id: 'form3', label: 'Form 3', done: summary.checks.form3 },
      { id: 'commander', label: 'Institutional Verification', done: isCommanderVerified(app) },
      { id: 'hearing', label: 'Hearing Scheduled', done: getHearingsByApplication(appId).some((h) => !['Cancelled', 'Pending'].includes(h.status)) },
      { id: 'assessment', label: 'Board Assessment', done: requiredBoardAssessmentsComplete(app) },
      { id: 'decision', label: 'Decision', done: score.complete || isForm4Complete(app.formData?.form4) || isForm5Complete(app.formData?.form5) },
      { id: 'approval', label: 'Approval', done: requiredApprovalsComplete(app) || app.status === 'Approved' },
      { id: 'release', label: 'Release', done: app.status === 'Released' || prisoner?.status === 'Released on Parole' },
    ];

    let currentIdx = stageDefs.findIndex((s) => !s.done);
    if (currentIdx < 0) currentIdx = stageDefs.length - 1;
    if (returned) {
      const returnIdx = stageDefs.findIndex((s) => ['form1', 'form2', 'form3'].includes(s.id) && !s.done);
      currentIdx = returnIdx >= 0 ? returnIdx : Math.max(0, stageDefs.findIndex((s) => s.id === 'form2'));
    }
    if (needsCommanderVerification(app)) {
      const commanderIdx = stageDefs.findIndex((s) => s.id === 'commander');
      if (commanderIdx >= 0) currentIdx = commanderIdx;
    }

    return stageDefs.map((s, i) => {
      let status = 'pending';
      if (s.done) status = 'completed';
      else if (i === currentIdx) status = 'current';
      if (returned && ['form1', 'form2', 'form3'].includes(s.id) && !s.done) status = 'returned';
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
      if (['Draft', 'Submitted', 'Pending Commander Review'].includes(app.status) && s.checks.form2 && !s.checks.form3) {
        items.push({ ...base, type: 'form3_pending', message: 'Form 3 institutional report awaiting completion before commander verification', severity: 'medium' });
      }
      if (needsCommanderVerification(app)) {
        const age = now - new Date(app.updatedAt || app.submittedAt || app.createdAt).getTime();
        if (age > 3 * 86400000) {
          items.push({ ...base, type: 'verification_stuck', message: 'Awaiting Jail Commander verification > 3 days', severity: 'medium' });
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
    const submitted = form3.submitted === true || form3.status === 'submitted' || form3.status === 'approved';
    if (!submitted && !form3.checkpointPassed) return false;
    const recommendation = form3.institutionalRecommendation || form3.commanderRecommendation || form3.recommendation;
    if (recommendation && form3.conductDuringSentence && form3.programParticipation) return true;
    if (form3.checkpointPassed && submitted) return true;
    return !!(recommendation && submitted);
  }

  function isForm2Complete(form2) {
    const ddr = form2?.sections?.ddr;
    const ppr = form2?.sections?.ppr;
    return !!(ddr?.submitted && ddr?.confirmed && ppr?.submitted && ppr?.confirmed);
  }

  const FORM2_ATTACHMENT_LABELS = Object.freeze({
    pprInmateDocs: 'Inmate record supporting documents',
    pprSocialCaseDocs: 'Social case study supporting documents',
    pprCommunityDocs: 'Community interview supporting documents',
    pprVictimImpactDocs: 'Victim impact supporting documents',
    pprReintegrationDocs: 'Reintegration plan supporting documents',
    pprBoardInterviewDocs: 'Board interview supporting documents',
    pprSignoffDocs: 'Sign-off and restorative justice supporting documents',
    darConductDocs: 'Conduct and disciplinary supporting documents',
    darTrainingDocs: 'Training and program supporting documents',
    darHealthDocs: 'Health assessment supporting documents',
    darRiskDocs: 'Risk assessment supporting documents',
  });

  const FORM2_ATTACHMENT_VIEW_ROLES = Object.freeze([
    'Doctor', 'CS Commissioner', 'DJAG Secretary', 'DJAG Parole Clerk', 'CS Parole Clerk', 'CS Parole Officer',
    'Jail Commander', 'System Administrator',
  ]);

  function normalizeForm2AttachmentEntry(entry, fieldKey, sectionKey, sectionMeta = {}) {
    if (!entry) return null;
    if (typeof entry === 'string') {
      return {
        id: `F2F-${sectionKey}-${fieldKey}-${entry.replace(/\W+/g, '_').slice(0, 24)}`,
        sectionKey,
        fieldKey,
        fieldLabel: FORM2_ATTACHMENT_LABELS[fieldKey] || fieldKey,
        fileName: entry,
        fileType: '',
        fileSize: 0,
        dataUrl: null,
        uploadedAt: sectionMeta.submittedAt || null,
        uploadedByName: sectionMeta.contributorName || sectionMeta.officerName || sectionMeta.clerkName || '',
      };
    }
    return {
      id: entry.id || `F2F-${sectionKey}-${fieldKey}-${(entry.fileName || 'file').replace(/\W+/g, '_').slice(0, 24)}`,
      sectionKey,
      fieldKey,
      fieldLabel: FORM2_ATTACHMENT_LABELS[fieldKey] || fieldKey,
      fileName: entry.fileName || 'Document',
      fileType: entry.fileType || '',
      fileSize: entry.fileSize || 0,
      dataUrl: entry.dataUrl || null,
      uploadedAt: entry.uploadedAt || sectionMeta.submittedAt || null,
      uploadedByName: entry.uploadedByName || sectionMeta.contributorName || sectionMeta.officerName || sectionMeta.clerkName || '',
    };
  }

  function getForm2AttachmentFiles(app) {
    const sections = app?.formData?.form2?.sections;
    if (!sections) return [];
    const files = [];
    ['ddr', 'ppr'].forEach((sectionKey) => {
      const section = sections[sectionKey];
      if (!section?.attachments) return;
      Object.entries(section.attachments).forEach(([fieldKey, entries]) => {
        (Array.isArray(entries) ? entries : []).forEach((entry) => {
          const normalized = normalizeForm2AttachmentEntry(entry, fieldKey, sectionKey, section);
          if (normalized) files.push(normalized);
        });
      });
    });
    return files;
  }

  function getForm2AttachmentFile(appId, fileId) {
    const app = getApplicationById(appId);
    if (!app || !fileId) return null;
    return getForm2AttachmentFiles(app).find((f) => f.id === fileId) || null;
  }

  function canDownloadForm2Attachments(actor) {
    if (!actor) return false;
    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(actor.role) : actor.role;
    return FORM2_ATTACHMENT_VIEW_ROLES.includes(role);
  }

  function downloadForm2Attachment(appId, fileId) {
    const file = getForm2AttachmentFile(appId, fileId);
    if (!file) throw new Error('Attachment not found.');
    if (!file.dataUrl) throw new Error(`${file.fileName} was saved without file content. Ask the parole clerk to re-upload it.`);
    if (typeof PMSUI !== 'undefined' && PMSUI.downloadDataUrl) {
      PMSUI.downloadDataUrl(file.dataUrl, file.fileName);
      return file;
    }
    const a = document.createElement('a');
    a.href = file.dataUrl;
    a.download = file.fileName || 'document';
    a.click();
    return file;
  }

  /** DAR/DDR submitted by PNGCS — DJAG Parole Clerk must complete PPR (even if app is still Draft). */
  function needsDjagForm2Ppr(app) {
    const f2 = app?.formData?.form2?.sections;
    return !!(f2?.ddr?.submitted && !f2?.ppr?.submitted);
  }

  function getApplicationsForDjagClerk() {
    return getParoleApplications().filter((a) => a.status !== 'Draft' || needsDjagForm2Ppr(a));
  }

  function isForm4Issued(app) {
    const form4 = app?.formData?.form4;
    return form4?.issued === true && (form4?.status === 'Parole Granted' || form4?.decision === 'Parole Granted');
  }

  function isForm4Complete(form4) {
    if (form4?.issued === true) {
      return form4?.status === 'Parole Granted' || form4?.decision === 'Parole Granted';
    }
    return form4?.status === 'Parole Granted' || form4?.decision === 'Parole Granted';
  }

  function getAllParoleApplications(opts = {}) {
    const list = [...(data?.applications || [])];
    if (opts.includeArchived) return list;
    return list.filter((a) => !a.archived);
  }

  function getGrantedParoleCases(opts = {}) {
    const { institutionId } = opts;
    return getAllParoleApplications({ includeArchived: true })
      .filter((a) => isForm4Issued(a))
      .filter((a) => !institutionId || a.institutionId === institutionId)
      .sort((a, b) => new Date(b.formData?.form4?.issuedAt || b.archivedAt || 0) - new Date(a.formData?.form4?.issuedAt || a.archivedAt || 0));
  }

  function countGrantedParole(scopeInstitutionId = null) {
    return getGrantedParoleCases({ institutionId: scopeInstitutionId || undefined }).length;
  }

  function getParoleGrantedArchive(opts = {}) {
    const { institutionId } = opts;
    data.paroleGrantedArchive = data.paroleGrantedArchive || [];
    if (institutionId) {
      return data.paroleGrantedArchive.filter((e) => e.institutionId === institutionId);
    }
    return [...data.paroleGrantedArchive].sort((a, b) => new Date(b.grantedAt || 0) - new Date(a.grantedAt || 0));
  }

  function recordParoleGrantedArchive(app, actor) {
    data.paroleGrantedArchive = data.paroleGrantedArchive || [];
    const prisoner = getPrisonerById(app.prisonerId);
    const form4 = app.formData?.form4 || {};
    const existingIdx = data.paroleGrantedArchive.findIndex((e) => e.applicationId === app.id);
    const entry = {
      id: existingIdx >= 0 ? data.paroleGrantedArchive[existingIdx].id : generateId('PGA'),
      applicationId: app.id,
      caseNumber: app.caseNumber || app.id,
      prisonerId: app.prisonerId,
      prisonerNumber: prisoner?.prisonerNumber || prisoner?.id || '',
      prisonerName: prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : '',
      institutionId: app.institutionId,
      institutionName: getInstitutionById(app.institutionId)?.name || '',
      grantedAt: form4.issuedAt || app.archivedAt || new Date().toISOString(),
      issuedBy: form4.issuedBy || (actor ? `${actor.firstName} ${actor.lastName}` : ''),
      paroleOrderNo: form4.paroleOrderNo || '',
      form4Snapshot: {
        dateIssued: form4.dateIssued || '',
        dateCompleted: form4.dateCompleted || '',
        parolePeriod: form4.parolePeriod || '',
        supervisingCbc: form4.supervisingCbc || '',
        paroleOfficer: form4.paroleOfficer || '',
      },
      archivedAt: app.archivedAt || new Date().toISOString(),
    };
    if (existingIdx >= 0) data.paroleGrantedArchive[existingIdx] = { ...data.paroleGrantedArchive[existingIdx], ...entry };
    else data.paroleGrantedArchive.push(entry);
    return entry;
  }

  function archiveParoleGrantedCase(appId, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    if (!isForm4Issued(app)) throw new Error('Form 4 must be issued before the case can be archived.');
    if (app.archived) {
      recordParoleGrantedArchive(app, actor);
      persist();
      return app;
    }
    const prisoner = getPrisonerById(app.prisonerId);
    app.archived = true;
    app.archivedAt = new Date().toISOString();
    app.archivedBy = actor?.id || null;
    app.archiveReason = 'Parole Granted — Form 4 issued';
    app.updatedAt = app.archivedAt;
    if (prisoner && !['Released on Parole', 'Released'].includes(prisoner.status)) {
      prisoner.status = 'Approved';
    }
    if (!['Approved', 'Released'].includes(app.status)) {
      transitionApplication(appId, 'Approved', actor, 'Parole granted — Form 4 issued and case archived');
    }
    recordParoleGrantedArchive(app, actor);
    logAudit(actor, 'ARCHIVE', 'ParoleApplication', appId, `Parole granted archive — ${app.caseNumber || appId}`, {
      newValues: { archiveReason: app.archiveReason, grantedAt: app.formData?.form4?.issuedAt },
    });
    const pName = prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : app.caseNumber || appId;
    notifyRoles(
      ['CS Parole Clerk', 'DJAG Parole Clerk', 'Jail Commander'],
      'Parole Granted — Case Archived',
      `Form 4 issued for ${pName} (${app.caseNumber || appId}). Record moved to parole granted archive.`,
      { applicationId: appId, institutionId: app.institutionId, prisonerId: app.prisonerId, type: 'approval', linkPanel: 'history' },
    );
    persist();
    return app;
  }

  function isForm5Complete(form5) {
    return form5?.status === 'Parole Refused' || form5?.decision === 'Parole Refused';
  }

  function normalizeCommanderDecision(review) {
    if (!review) return null;
    const decision = review.decision;
    if (decision === 'Verified' || decision === 'Approved') return 'Verified';
    if (decision === 'Rejected') return 'Rejected';
    if (decision === 'Returned for Correction') return 'Returned for Correction';
    if (review.verifiedAt && (review.recommendation === 'Recommended' || review.recommendation === 'Verified')) {
      return 'Verified';
    }
    return decision || null;
  }

  function getPrisonerVerificationEntry(app) {
    if (!app?.prisonerId) return null;
    const prisoner = getPrisonerById(app.prisonerId);
    return prisoner?.verificationHistory?.find((row) => row.applicationId === app.id) || null;
  }

  function resolveVerificationNotifications(appId) {
    if (!data?.notifications) return false;
    let changed = false;
    data.notifications.forEach((n) => {
      if (n.applicationId === appId && n.type === 'verification' && !n.resolved) {
        n.resolved = true;
        n.resolvedAt = n.resolvedAt || new Date().toISOString();
        changed = true;
      }
    });
    return changed;
  }

  function resolveHearingNotifications(appId) {
    if (!data?.notifications) return false;
    let changed = false;
    data.notifications.forEach((n) => {
      if (n.applicationId === appId && ['hearing', 'escalation', 'deadline'].includes(n.type) && !n.resolved) {
        n.resolved = true;
        n.resolvedAt = n.resolvedAt || new Date().toISOString();
        changed = true;
      }
    });
    return changed;
  }

  function syncCommanderVerificationState(appId) {
    const app = getApplicationById(appId);
    if (!app) return null;
    const changed = reconcileCommanderVerification(app);
    if (changed) {
      const prisoner = getPrisonerById(app.prisonerId);
      if (prisoner) syncPrisonerParoleStatus(prisoner, app);
      syncApplicationProgress(appId);
      persist();
    }
    return app;
  }

  function reconcileCommanderVerification(app) {
    if (!app) return false;
    let changed = false;
    let review = app.commanderReview;
    const hist = getPrisonerVerificationEntry(app);

    if (!normalizeCommanderDecision(review) && normalizeCommanderDecision(hist)) {
      app.commanderReview = {
        commanderId: hist.commanderId,
        commanderName: hist.commanderName,
        institutionId: hist.institutionId || app.institutionId,
        prisonerId: app.prisonerId,
        prisonerName: hist.prisonerName,
        caseNumber: app.caseNumber || app.id,
        decision: normalizeCommanderDecision(hist),
        comments: hist.comments || '',
        reviewedAt: hist.reviewedAt,
        verifiedAt: hist.reviewedAt,
        finalized: hist.finalized !== false,
      };
      review = app.commanderReview;
      changed = true;
    }

    const decision = normalizeCommanderDecision(review);
    if (decision === 'Verified') {
      if (['Pending Commander Review', 'Submitted'].includes(app.status)) {
        app.status = 'Pre-Parole Report Prepared';
        changed = true;
      }
      if (!app.hearingSchedulingAt) {
        app.hearingSchedulingAt = review.reviewedAt || review.verifiedAt || new Date().toISOString();
        changed = true;
      }
      if (resolveVerificationNotifications(app.id)) changed = true;
    } else if (decision === 'Rejected' && app.status === 'Pending Commander Review') {
      app.status = 'Refused';
      changed = true;
    }
    return changed;
  }

  function isCommanderVerified(app) {
    if (normalizeCommanderDecision(app?.commanderReview) === 'Verified') return true;
    return normalizeCommanderDecision(getPrisonerVerificationEntry(app)) === 'Verified';
  }

  function isCommanderVerificationLocked(app) {
    const decision = normalizeCommanderDecision(app?.commanderReview)
      || normalizeCommanderDecision(getPrisonerVerificationEntry(app));
    return decision === 'Verified' || decision === 'Rejected';
  }

  function getCommanderVerificationRecord(app) {
    const review = app?.commanderReview;
    const hist = getPrisonerVerificationEntry(app);
    const source = (review?.reviewedAt || review?.verifiedAt) ? review : hist;
    if (!source?.reviewedAt && !source?.verifiedAt) return null;
    const prisoner = getPrisonerById(app.prisonerId);
    const decision = normalizeCommanderDecision(source);
    return {
      applicationId: app.id,
      caseNumber: app.caseNumber || app.id,
      prisonerId: app.prisonerId,
      prisonerName: prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : (source.prisonerName || ''),
      prisonerNumber: prisoner?.prisonerNumber || prisoner?.id || '',
      institutionId: app.institutionId,
      decision,
      comments: source.comments || '',
      commanderId: source.commanderId || source.verifiedBy,
      commanderName: source.commanderName || '',
      reviewedAt: source.reviewedAt || source.verifiedAt,
      finalized: source.finalized !== false,
    };
  }

  function getCommanderVerifiedApplications({ commanderId, institutionId } = {}) {
    return getParoleApplications()
      .filter((app) => isCommanderVerified(app))
      .filter((app) => !institutionId || app.institutionId === institutionId)
      .filter((app) => !commanderId || getCommanderVerificationRecord(app)?.commanderId === commanderId)
      .sort((a, b) => new Date(getCommanderVerificationRecord(b)?.reviewedAt || 0) - new Date(getCommanderVerificationRecord(a)?.reviewedAt || 0));
  }

  function syncPrisonerVerificationHistory(app, review, actor) {
    const prisoner = getPrisonerById(app.prisonerId);
    if (!prisoner) return;
    const entry = {
      applicationId: app.id,
      caseNumber: app.caseNumber || app.id,
      prisonerId: app.prisonerId,
      decision: review.decision,
      comments: review.comments || '',
      commanderId: actor.id,
      commanderName: `${actor.firstName} ${actor.lastName}`,
      institutionId: app.institutionId,
      reviewedAt: review.reviewedAt,
      finalized: true,
    };
    prisoner.verificationHistory = prisoner.verificationHistory || [];
    const idx = prisoner.verificationHistory.findIndex((row) => row.applicationId === app.id);
    if (idx >= 0) {
      const prev = prisoner.verificationHistory[idx];
      if (['Verified', 'Approved'].includes(normalizeCommanderDecision(prev))) {
        throw new Error('This prisoner has already been verified for this case.');
      }
      prisoner.verificationHistory[idx] = entry;
    } else {
      prisoner.verificationHistory.push(entry);
    }
  }

  function isVerificationReady(app) {
    if (!app) return false;
    const summary = getFormCompletionSummary(app);
    return summary.checks.form1 && summary.checks.form2 && summary.checks.form3;
  }

  /** True when Forms 1–3 are complete and commander verification is still required. */
  function needsCommanderVerification(app) {
    if (!app) return false;
    if (isCommanderVerificationLocked(app) || isCommanderVerified(app)) return false;
    if (POST_COMMANDER_VERIFICATION_STATUSES.includes(app.status)) return false;
    return isVerificationReady(app);
  }

  /** Promote cases with Forms 1–3 complete to Pending Commander Review (migration / sync). */
  function promoteToCommanderReviewIfReady(app, { notify = false } = {}) {
    if (!needsCommanderVerification(app)) return false;
    if (app.status === 'Pending Commander Review') return false;
    if (isTerminalApplicationStatus(app.status)) return false;
    const fromStatus = app.status;
    app.status = 'Pending Commander Review';
    app.updatedAt = new Date().toISOString();
    app.lastModifiedLabel = 'Status → Pending Commander Review';
    app.workflowNotes = [
      ...(app.workflowNotes || []),
      {
        status: 'Pending Commander Review',
        notes: 'Forms 1–3 complete — awaiting Jail Commander verification',
        at: new Date().toISOString(),
        by: 'system',
        actorName: 'System',
      },
    ];
    if (notify) {
      const prisoner = getPrisonerById(app.prisonerId);
      const pName = prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : 'prisoner';
      notifyInstitutionRoles(
        app.institutionId,
        ['CS Parole Clerk', 'Jail Commander'],
        'Institutional Verification Required',
        `Forms 1–3 complete — verification required for ${pName} (${app.caseNumber || app.id})`,
        {
          institutionId: app.institutionId,
          prisonerId: app.prisonerId,
          applicationId: app.id,
          type: 'verification',
          linkPanel: 'verification',
        },
      );
    }
    logAudit(
      { id: 'system', firstName: 'System', lastName: 'Sync', role: 'System Administrator' },
      'UPDATE',
      'ParoleApplication',
      app.id,
      `Auto-promoted ${fromStatus} → Pending Commander Review (Forms 1–3 complete)`,
    );
    return true;
  }

  function syncApplicationWorkflowState(app) {
    if (!app) return false;
    let changed = promoteToCommanderReviewIfReady(app);
    if (reconcileCommanderVerification(app)) changed = true;
    syncApplicationProgress(app.id);
    return changed;
  }

  function syncAllApplicationWorkflowStates() {
    if (!data?.applications) return false;
    let changed = false;
    data.applications.forEach((app) => {
      if (syncApplicationWorkflowState(app)) changed = true;
    });
    data.prisoners?.forEach((prisoner) => {
      const app = data.applications.find(
        (a) => a.prisonerId === prisoner.id && !isTerminalApplicationStatus(a.status),
      );
      if (app && syncPrisonerParoleStatus(prisoner, app)) changed = true;
    });
    return changed;
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
    if (normalizedKey === 'ddr' && role !== 'CS Parole Clerk') {
      throw new Error('Only CS Parole Clerk may submit the DAR section.');
    }
    if (normalizedKey === 'ppr' && role !== 'DJAG Parole Clerk') {
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
      notifyRoles(['CS Parole Clerk', 'CS Parole Officer'], 'Form 2 Section Submitted', `PPR section submitted for ${app.caseNumber || appId}`, meta);
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
        ['CS Parole Clerk', 'DJAG Parole Clerk'],
        'Form 2 Complete — Submitted to Board',
        `PPR and DAR submitted for ${pName} (${app.caseNumber || appId}) — ready for board workflow`,
        boardMeta
      );
      notifyInstitutionRoles(
        app.institutionId,
        ['Jail Commander', 'CS Parole Clerk'],
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
    if (!['Jail Commander', 'CS Parole Clerk'].includes(role)) {
      throw new Error('Only a Jail Commander or CS Parole Clerk may record case verification.');
    }
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    if (actor.institutionId && app.institutionId !== actor.institutionId) {
      throw new Error('You may only review prisoners at your assigned institution.');
    }
    if (isCommanderVerificationLocked(app)) {
      const prisoner = getPrisonerById(app.prisonerId);
      const name = prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : 'This prisoner';
      throw new Error(`${name} has already been verified for this case. Verification is recorded once and cannot be resubmitted.`);
    }
    const inst = getInstitutionById(app.institutionId);
    const reviewedAt = new Date().toISOString();
    const prisoner = getPrisonerById(app.prisonerId);
    const targetStatus = review.decision === 'Verified' || review.decision === 'Approved'
      ? 'Pre-Parole Report Prepared'
      : review.decision === 'Returned for Correction'
        ? 'Returned for Correction'
        : review.decision === 'Rejected'
          ? 'Refused'
          : null;
    if (targetStatus && typeof PMSWorkflow !== 'undefined') {
      if (!PMSWorkflow.canTransition(actor, app.status, targetStatus)) {
        throw new Error(`You are not permitted to change status from ${app.status} to ${targetStatus}.`);
      }
      const recordingVerification = review.decision === 'Verified' || review.decision === 'Approved';
      if (!recordingVerification) {
        const advance = PMSWorkflow.canAdvanceApplication(app, targetStatus);
        if (!advance.allowed) {
          throw new Error(`Cannot record verification: ${advance.blockers.join(' ')}`);
        }
      }
    }
    if ((review.decision === 'Verified' || review.decision === 'Approved')) {
      const summary = getFormCompletionSummary(app);
      if (!summary.checks.form1 || !summary.checks.form2 || !summary.checks.form3) {
        throw new Error('Forms 1–3 must be completed before institutional verification can be recorded.');
      }
    }
    const reviewRecord = {
      commanderId: actor.id,
      commanderName: `${actor.firstName} ${actor.lastName}`,
      institutionId: app.institutionId,
      institutionName: inst?.name || '',
      prisonerId: app.prisonerId,
      prisonerName: prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : '',
      prisonerNumber: prisoner?.prisonerNumber || prisoner?.id || '',
      caseNumber: app.caseNumber || app.id,
      decision: review.decision,
      comments: review.comments || '',
      reviewedAt,
      verifiedAt: review.decision === 'Verified' || review.decision === 'Approved' ? reviewedAt : review.verifiedAt || null,
      finalized: true,
    };
    app.commanderReview = reviewRecord;
    syncPrisonerVerificationHistory(app, reviewRecord, actor);
    logAudit(actor, 'VERIFY', 'ParoleApplication', appId, `Commander ${review.decision}: ${review.comments || ''}`, {
      newValues: { prisonerId: app.prisonerId, decision: review.decision, reviewedAt },
    });
    if (review.decision === 'Verified' || review.decision === 'Approved') {
      app.hearingSchedulingAt = new Date().toISOString();
      transitionApplication(appId, 'Pre-Parole Report Prepared', actor, `Institutional verification complete — ready for hearing scheduling (${review.comments || ''})`);
      notifyRole('DJAG Secretary', 'Schedule Hearing Required', `Case ${app.caseNumber || app.id} requires hearing within ${HEARING_DEADLINE_DAYS} days`, app.institutionId, app.prisonerId, null, { applicationId: appId, type: 'hearing', linkPanel: 'hearings' });
      notifyRoles(['CS Parole Clerk', 'DJAG Parole Clerk'], 'Case Verified', `Case verified ${app.caseNumber || appId}`, { applicationId: appId, institutionId: app.institutionId, prisonerId: app.prisonerId, type: 'verification' });
    } else if (review.decision === 'Returned for Correction') {
      transitionApplication(appId, 'Returned for Correction', actor, review.comments || 'Returned for correction');
    } else if (review.decision === 'Rejected') {
      transitionApplication(appId, 'Refused', actor, review.comments || 'Rejected during institutional verification');
    }
    app.commanderVerificationDraft = null;
    resolveVerificationNotifications(appId);
    reconcileCommanderVerification(app);
    syncApplicationWorkflowState(app);
    persist();
    return app;
  }

  function saveCommanderVerificationDraft(appId, draft, actor) {
    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(actor.role) : actor.role;
    if (!['Jail Commander', 'CS Parole Clerk'].includes(role)) {
      throw new Error('Only a Jail Commander or CS Parole Clerk may save verification drafts.');
    }
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    if (actor.institutionId && app.institutionId !== actor.institutionId) {
      throw new Error('You may only review prisoners at your assigned institution.');
    }
    app.commanderVerificationDraft = {
      decision: draft.decision || '',
      comments: draft.comments || '',
      savedAt: new Date().toISOString(),
      savedBy: actor.id,
      savedByName: `${actor.firstName} ${actor.lastName}`,
    };
    logAudit(actor, 'SAVE', 'ParoleApplication', appId, 'Commander verification draft saved');
    persist();
    return app.commanderVerificationDraft;
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
    const required = ['DJAG Secretary', 'CS Parole Clerk'];
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
      notifyRole('CS Parole Clerk', 'Release Authorized — Pending Action', `Approvals complete for ${app.caseNumber || appId} — authorize release`, app.institutionId, app.prisonerId, null, meta);
    } else if (step.decision === 'Rejected') {
      transitionApplication(appId, 'Refused', actor, step.comments || 'Approval rejected');
    } else if (step.decision === 'Returned for Correction') {
      transitionApplication(appId, 'Returned for Correction', actor, step.comments || 'Returned during approval');
    } else {
      app.status = 'Pending Approval';
      notifyRole('DJAG Secretary', 'Approval Required', `Approval pending for ${app.caseNumber || appId}`, app.institutionId, app.prisonerId, null, meta);
      notifyRole('CS Parole Clerk', 'Approval Required', `Approval pending for ${app.caseNumber || appId}`, app.institutionId, app.prisonerId, null, meta);
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
    archiveParoleGrantedCase(appId, actor);
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
    if (['Parole Refused', 'Pending Board Review', 'Hearing Scheduled', 'Hearing In Progress'].includes(updated.status)) {
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

  function formatBoardObservationsText(role, assessment) {
    const psych = assessment?.psychiatricObservation;
    const claims = assessment?.claimVerification;
    const parts = [];
    if (psych) {
      if (psych.clinicianName) parts.push(`Clinician: ${psych.clinicianName}`);
      if (psych.demeanor) parts.push(`Demeanor: ${psych.demeanor}`);
      if (psych.indicators && typeof psych.indicators === 'object') {
        parts.push(`Behavioral indicators: ${Object.entries(psych.indicators).map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }
      if (psych.clinicalNotes) parts.push(`Clinical notes: ${psych.clinicalNotes}`);
    }
    if (claims?.length) {
      const summary = claims
        .filter((c) => c.status)
        .map((c) => `${c.label || c.id}: ${c.status}${c.notes ? ` (${c.notes})` : ''}`)
        .join('; ');
      if (summary) parts.push(`Claim verification: ${summary}`);
    }
    if (assessment?.observations) parts.push(assessment.observations);
    if (assessment?.feedback && role === 'Doctor') parts.push(assessment.feedback);
    return parts.join('\n') || assessment?.feedback || '';
  }

  function syncHearingInterviewNotes(appId, notes) {
    if (!notes || !appId) return;
    const hearing = findActiveHearingRecord(appId);
    if (!hearing) return;
    hearing.interviewNotes = notes;
    hearing.interview_notes = notes;
  }

  function saveInterviewSessionMeta(appId, meta, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    app.interviewSession = {
      ...(app.interviewSession || {}),
      ...meta,
      status: meta.status || app.interviewSession?.status || 'in_progress',
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: actor?.id || null,
      lastUpdatedByName: actor ? `${actor.firstName} ${actor.lastName}` : '',
    };
    if (meta.interviewNotes) syncHearingInterviewNotes(appId, meta.interviewNotes);
    persist();
    return app.interviewSession;
  }

  function saveBoardAssessment(appId, assessment, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(actor.role) : actor.role;
    const allowed = {
      Doctor: 'Doctor',
      'CS Commissioner': 'CS Commissioner',
      'DJAG Secretary': 'DJAG Secretary',
    };
    if (!allowed[role]) throw new Error('Your role is not authorized to submit board votes.');
    if (!['Hearing In Progress', 'Pending Board Review'].includes(app.status)) {
      throw new Error('Board votes can only be submitted after the hearing session has started.');
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
    const idx = app.boardAssessments.findIndex((a) => a.role === role && a.assessorId === actor.id);
    const prev = idx >= 0 ? app.boardAssessments[idx] : null;

    function mergeField(key) {
      if (Object.prototype.hasOwnProperty.call(assessment, key)) {
        const val = assessment[key];
        if (val !== undefined && val !== null) {
          if (key === 'claimVerification' && Array.isArray(val) && !val.some((c) => c?.status) && prev?.claimVerificationSavedAt) {
            return prev.claimVerification;
          }
          return val;
        }
      }
      return prev?.[key] ?? null;
    }

    const mergedVote = vote || (prev?.vote ? normalizeBoardVote(prev.vote) : null);
    const mergedScore = assessment.score == null || assessment.score === ''
      ? (prev?.score ?? null)
      : Number(assessment.score);
    const observationsText = formatBoardObservationsText(role, {
      ...prev,
      ...assessment,
      psychiatricObservation: mergeField('psychiatricObservation'),
      claimVerification: mergeField('claimVerification'),
    });

    const entry = {
      id: assessment.id || prev?.id || `ASM-${String(app.boardAssessments.length + 1).padStart(6, '0')}`,
      role,
      boardPosition: assessment.boardPosition || actor.boardPosition || prev?.boardPosition,
      assessorId: actor.id,
      assessorName: `${actor.firstName} ${actor.lastName}`,
      vote: mergedVote,
      score: mergedScore,
      feedback: assessment.feedback !== undefined ? (assessment.feedback || '') : (prev?.feedback || ''),
      conditions: assessment.conditions !== undefined ? (assessment.conditions || '') : (prev?.conditions || ''),
      denialReason: assessment.denialReason !== undefined ? (assessment.denialReason || '') : (prev?.denialReason || ''),
      recommendation: mergedVote === 'Approved' ? 'Recommend parole' : mergedVote === 'Refused' ? 'Do not recommend' : 'Defer decision',
      submissionStatus: isDraft ? 'Draft' : 'Submitted',
      submittedAt: isDraft ? (prev?.submittedAt || null) : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      claimVerification: mergeField('claimVerification'),
      claimVerificationSavedAt: mergeField('claimVerificationSavedAt'),
      psychiatricObservation: mergeField('psychiatricObservation'),
      psychiatricObservationSavedAt: mergeField('psychiatricObservationSavedAt'),
      psychDigitalSignature: mergeField('psychDigitalSignature'),
      digitalSignature: mergeField('digitalSignature'),
      observations: assessment.observations || observationsText || prev?.observations || '',
      doctor_behavioral_observations: role === 'Doctor' ? (observationsText || assessment.doctor_behavioral_observations || prev?.doctor_behavioral_observations || '') : undefined,
      chairman_observations: role === 'DJAG Secretary' ? (observationsText || assessment.chairman_observations || prev?.chairman_observations || '') : undefined,
      commissioner_correctional_review: role === 'CS Commissioner' ? (observationsText || assessment.commissioner_correctional_review || prev?.commissioner_correctional_review || '') : undefined,
    };
    Object.keys(entry).forEach((k) => { if (entry[k] === undefined) delete entry[k]; });
    const interviewNotes = assessment.interviewNotes || observationsText || prev?.interviewNotes;
    if (interviewNotes) {
      syncHearingInterviewNotes(appId, interviewNotes);
      saveInterviewSessionMeta(appId, { interviewNotes }, actor);
    }
    if (idx >= 0) app.boardAssessments[idx] = entry;
    else app.boardAssessments.push(entry);
    if (!isDraft) {
      ensureBoardReviewStarted(app, actor, `${role} submitted board vote (${vote})`);
      logAudit(actor, 'SAVE', 'BoardAssessment', appId, `${role} vote submitted (${vote})`);
    } else {
      logAudit(actor, 'SAVE', 'BoardAssessment', appId, `${role} decision saved as draft`);
    }
    syncApplicationProgress(appId);
    const assessMeta = { applicationId: appId, institutionId: app.institutionId, prisonerId: app.prisonerId, type: 'board_review', linkPanel: 'decisions', linkHref: `forms/board-decisions.html?appId=${encodeURIComponent(appId)}` };
    const progress = getBoardAssessmentProgress(app);
    app.paroleScore = { ...calculateParoleScore(app), locked: progress.complete };
    if (!isDraft) {
      if (!progress.complete) {
        progress.pendingRoles.forEach((r) => notifyRole(r, 'Board Vote Required', `Your vote is required for ${app.caseNumber || appId}. Other members may have already voted.`, app.institutionId, app.prisonerId, null, assessMeta));
      } else {
        maybeCompleteHearingOnVoteTally(appId, actor);
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
    const approvedVotes = (updated.boardAssessments || []).filter((a) => a.vote === 'Approved' && a.submissionStatus === 'Submitted');
    const refusedVotes = (updated.boardAssessments || []).filter((a) => a.vote === 'Refused' && a.submissionStatus === 'Submitted');
    const mergedConditions = approvedVotes.map((a) => a.conditions).filter(Boolean).join('\n');
    const mergedDenial = refusedVotes.map((a) => a.denialReason || a.feedback).filter(Boolean).join('\n');
    updated.boardDecision = {
      outcome: tally.outcome,
      deliberationNotes: tally.calculation,
      conditions: mergedConditions || updated.boardDecision?.conditions || '',
      denialReason: mergedDenial || updated.boardDecision?.denialReason || '',
      decidedBy: actor.id,
      decidedByName: `${actor.firstName} ${actor.lastName}`,
      decidedAt: new Date().toISOString(),
      boardPosition: actor.boardPosition || actor.position || '',
      votes: tally.votes,
      paroleScore: updated.paroleScore?.percent,
      calculation: tally.calculation,
    };
    syncApplicationProgress(appId);
    persist();
    notifyRoles(['CS Parole Clerk', 'DJAG Parole Clerk'], 'Board Decision Finalized', `${updated.caseNumber || appId}: ${tally.outcome}`, { applicationId: appId, institutionId: updated.institutionId, prisonerId: updated.prisonerId, type: 'board_review', linkPanel: 'decisions', linkHref: tally.outcome === 'Parole Granted' ? `forms/form4.html?appId=${encodeURIComponent(appId)}` : `forms/form5.html?appId=${encodeURIComponent(appId)}` });
    return updated;
  }

  function getBoardAssessments(appId) {
    return getApplicationById(appId)?.boardAssessments || [];
  }

  function getBoardAssessmentForRole(app, role) {
    return (app?.boardAssessments || []).find((a) => a.role === role && a.submissionStatus !== 'Draft' && a.vote) || null;
  }

  /** Latest board record for a role — includes drafts (interview eval, claim verification, etc.). */
  function getBoardAssessmentEntryForRole(app, role) {
    const items = (app?.boardAssessments || []).filter((a) => a.role === role);
    if (!items.length) return null;
    const submitted = items.find((a) => a.submissionStatus === 'Submitted' && a.vote);
    if (submitted) return submitted;
    return items.slice().sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0];
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
    if (!app || app.status !== 'Hearing In Progress') return;
    app.workflowNotes = [...(app.workflowNotes || []), {
      status: app.status,
      notes: note || 'Board vote recorded during hearing session',
      at: new Date().toISOString(),
      by: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
    }];
  }

  /** When calculateBoardVotes reports a complete tally, close an active hearing session. */
  function maybeCompleteHearingOnVoteTally(appId, actor) {
    const app = getApplicationById(appId);
    if (!app || app.status !== 'Hearing In Progress') return app;
    const tally = calculateBoardVotes(app);
    if (!tally.complete) return app;
    const hearing = findActiveHearingRecord(appId);
    if (hearing && hearing.status !== 'Completed') {
      hearing.status = 'Completed';
      hearing.completedAt = new Date().toISOString();
    }
    return transitionApplication(
      appId,
      'Pending Board Review',
      actor,
      `All board members voted (${tally.calculation}) — hearing complete`,
    );
  }

  function startHearing(appId, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    const hearing = findActiveHearingRecord(appId);
    if (!hearing) throw new Error('A hearing must be scheduled before the session can start.');
    const updated = transitionApplication(appId, 'Hearing In Progress', actor, 'Hearing session started');
    hearing.status = 'In Progress';
    hearing.startedAt = new Date().toISOString();
    hearing.startedBy = actor.id;
    hearing.startedByName = `${actor.firstName} ${actor.lastName}`;
    persist();
    notifyDataChange();
    return updated;
  }

  function requiredBoardAssessmentsComplete(app) {
    return getBoardAssessmentProgress(app).complete;
  }

  function isParoleGrantedForRelease(app) {
    if (!app) return false;
    if (['Refused', 'Parole Refused'].includes(app.status)) return false;
    if (isForm4Issued(app)) return true;
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
    if (!['Jail Commander', 'CS Parole Clerk'].includes(role)) {
      return ['You do not have permission to authorize release.'];
    }
    if (app.status === 'Released') return ['Prisoner has already been released.'];
    if (actor?.institutionId && app.institutionId !== actor.institutionId) {
      blockers.push('This case belongs to another institution.');
    }
    if (!requiredBoardAssessmentsComplete(app)) {
      blockers.push('All board members must submit their vote (Approve, Deny, or Defer) before release.');
    }
    if (!isParoleGrantedForRelease(app)) {
      blockers.push('Parole must be granted before release can be authorized.');
    }
    if (role === 'CS Parole Clerk' && !requiredApprovalsComplete(app) && app.status !== 'Approved') {
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
    notifyRoles(['CS Parole Clerk', 'DJAG Parole Clerk'], 'Release Authorized', `${pName} released on parole from ${inst?.name || 'institution'}`, meta);
    notifyRole('Jail Commander', 'Release Completed', `${pName} — release on parole recorded`, app.institutionId, app.prisonerId, actor.id, meta);
    notifyRole('CS Parole Clerk', 'Release Completed', `${pName} — release on parole recorded`, app.institutionId, app.prisonerId, actor.id, meta);
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
      (u) => ['commander@cs.gov.pg', 'pkoroma@cs.gov.pg'].includes(u.username?.toLowerCase()),
    );
    if (legacyCommander && legacyCommander.username?.toLowerCase() !== 'p.koroma@cs.gov.pg') {
      if (DEMO_PASSWORDS[legacyCommander.username] && !DEMO_PASSWORDS['p.koroma@cs.gov.pg']) {
        DEMO_PASSWORDS['p.koroma@cs.gov.pg'] = DEMO_PASSWORDS[legacyCommander.username];
      }
      legacyCommander.username = 'p.koroma@cs.gov.pg';
      legacyCommander.email = 'p.koroma@cs.gov.pg';
      changed = true;
    }

    const commanderSeed = {
      id: 'USR-000028', officerId: 'OFF-000028', employeeNumber: 'EMP-000028',
      username: 'p.koroma@cs.gov.pg', email: 'p.koroma@cs.gov.pg',
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
    const commander = data.users.find((u) => u.username === 'p.koroma@cs.gov.pg');
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
      const err = new Error('You do not have permission to modify prisoner records. Only CS Parole Clerks may create, update, or delete prisoner data.');
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

  /** Gate for optional Act 1991 parole API mirror calls. Server routes remain for future migration. */
  function isAct1991ParoleSyncEnabled() {
    if (typeof window !== 'undefined' && typeof window.PMS_ENABLE_ACT1991_SYNC === 'boolean') {
      return window.PMS_ENABLE_ACT1991_SYNC;
    }
    return getSettings().act1991ParoleSyncEnabled === true;
  }

  function saveSettings(settings, actor) {
    data.settings = { ...data.settings, ...settings };
    logAudit(actor, 'UPDATE', 'Settings', 'system', 'Updated system settings');
    const label = data.settings.paroleEligibilityLabel || 'configuration';
    notifyRole('System Administrator', 'System Announcement', `System settings updated: ${label}`, null, null, null, {
      type: 'system', linkPanel: 'settings',
    });
    notifyRoles(['CS Parole Clerk', 'DJAG Parole Clerk'], 'System Announcement', `System settings updated: ${label}`, { type: 'system' });
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
    let payload = { ...user };
    if (!payload.id) {
      if (!payload.username?.trim() && payload.firstName && payload.lastName && payload.role) {
        payload.username = formatAgencyUsername(payload.firstName, payload.lastName, payload.role);
      }
      payload.email = payload.email?.trim() || payload.username;
    }
    payload = applyBoardMemberContract(payload);

    if (payload.id) {
      const idx = data.users.findIndex((u) => u.id === payload.id);
      if (idx < 0) throw new Error('User not found');
      const existing = data.users[idx];
      const { id: _id, officerId: _oid, employeeNumber: _emp, ...updates } = payload;
      data.users[idx] = { ...existing, ...updates, id: existing.id, officerId: existing.officerId, employeeNumber: existing.employeeNumber };
      if (payload.password) setUserPassword(data.users[idx].username, payload.password);
    } else {
      const username = payload.username.trim();
      if (data.users.some((u) => u.username.toLowerCase() === username.toLowerCase()))
        throw new Error('Username already exists');
      const id = generateId('user');
      const role = payload.role;
      const officerId = PMSIdGenerator.isOfficerRole(role) ? generateId('officer') : null;
      const employeeNumber = PMSIdGenerator.isOfficerRole(role) ? generateId('employee') : null;
      data.users.push({
        ...payload,
        id,
        officerId,
        employeeNumber,
        username,
        email: payload.email || username,
        status: payload.status || 'Active',
      });
      if (payload.password) setUserPassword(username, payload.password);
    }
    const saved = payload.id ? getUserById(payload.id) : data.users.at(-1);
    logAudit(actor, payload.id ? 'UPDATE' : 'CREATE', 'User', saved.id, saved.username);
    const userAction = payload.id ? 'updated' : 'created';
    notifyRole('System Administrator', 'User Account Change', `User account ${userAction}: ${saved.username} (${saved.role})`, null, null, null, {
      type: 'user', linkPanel: 'users',
    });
    if (saved.id !== actor?.id) {
      notifyRole(saved.role, 'Account Update', `Your account was ${userAction} by an administrator`, saved.institutionId, null, saved.id, {
        type: 'user', linkPanel: 'profile',
      });
    }
    ensureUserSigningPin(saved);
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
    let user = data.users.find((u) =>
      u.status === 'Active' && (u.username.toLowerCase() === login || u.email.toLowerCase() === login));
    if (!user && LEGACY_USERNAME_MAP[login]) {
      const mapped = LEGACY_USERNAME_MAP[login].toLowerCase();
      user = data.users.find((u) =>
        u.status === 'Active' && (u.username.toLowerCase() === mapped || u.email.toLowerCase() === mapped));
    }
    if (!user) {
      recordLoginFailure(login);
      return null;
    }
    if (user.employmentStatus === 'Inactive' || user.accountStatus === 'Suspended' || user.accountStatus === 'Expired') return null;
    if (user.contractExpiryDate && user.contractExpiryDate < new Date().toISOString().slice(0, 10)) return null;
    const expected = DEMO_PASSWORDS[user.username] || DEMO_PASSWORDS[login] || DEMO_PASSWORDS[LEGACY_USERNAME_MAP[login]];
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
    if (!p?.sentenceStartDate) return null;
    const start = parseDate(p.sentenceStartDate);
    if (isLifeSentence(p)) {
      const eligibility = new Date(start);
      eligibility.setFullYear(eligibility.getFullYear() + LIFE_ELIGIBILITY_YEARS);
      return eligibility;
    }
    const total = getSentenceDurationMonths(p);
    if (total <= 0) return null;
    return addMonths(start, total * getSettings().paroleEligibilityFraction);
  }

  function hasMetEligibilityThreshold(p) {
    if (!p?.sentenceStartDate) return false;
    const eligibilityDate = getParoleEligibilityDate(p);
    if (!eligibilityDate) return false;
    const today = parseDate(new Date().toISOString());
    return today >= parseDate(eligibilityDate);
  }

  function getApplicationsForPrisoner(prisonerId, apps = data?.applications || []) {
    return apps.filter((a) => a.prisonerId === prisonerId);
  }

  function isParoleGrantComplete(prisoner, apps = data?.applications || []) {
    if (!prisoner) return false;
    if (['Released on Parole', 'Released', 'Approved'].includes(prisoner.status)) return true;
    return getApplicationsForPrisoner(prisoner.id, apps).some(
      (a) => isForm4Issued(a) || ['Parole Granted', 'Approved', 'Released', 'Pending Approval'].includes(a.status),
    );
  }

  function isParoleApplicationRefused(prisoner, apps = data?.applications || []) {
    if (!prisoner) return false;
    if (prisoner.status === 'Rejected') return true;
    return getApplicationsForPrisoner(prisoner.id, apps).some(
      (a) => ['Refused', 'Parole Refused'].includes(a.status) || isForm5Complete(a.formData?.form5),
    );
  }

  function isEligibleParoleApplicant(prisoner, apps = null) {
    if (!prisoner) return false;
    const allApps = apps || getParoleApplications();
    if (isParoleGrantComplete(prisoner, allApps)) return false;
    if (isParoleApplicationRefused(prisoner, allApps)) return false;
    const hasActiveApplication = allApps.some(
      (a) => a.prisonerId === prisoner.id && isActiveParoleApplication(a),
    );
    return hasMetEligibilityThreshold(prisoner) || hasActiveApplication;
  }

  function getEligibleParoleApplicants(scopeInstitutionId = null) {
    let prisoners = getPrisoners();
    const apps = getParoleApplications();
    if (scopeInstitutionId) {
      prisoners = prisoners.filter((p) => p.institutionId === scopeInstitutionId);
    }
    return prisoners.filter((p) => isEligibleParoleApplicant(p, apps));
  }

  function countEligibleParoleApplicants(scopeInstitutionId = null) {
    return getEligibleParoleApplicants(scopeInstitutionId).length;
  }

  function getPrisonerProgress(p) {
    if (!p?.sentenceStartDate) {
      return { totalMonths: 0, servedMonths: 0, percent: 0, eligibilityDate: null, meetsThreshold: false, eligible: false };
    }
    const life = isLifeSentence(p);
    const totalMonths = life ? LIFE_ELIGIBILITY_YEARS * 12 : getSentenceDurationMonths(p);
    if (!life && totalMonths <= 0) {
      return { totalMonths: 0, servedMonths: 0, percent: 0, eligibilityDate: null, meetsThreshold: false, eligible: false };
    }
    const start = parseDate(p.sentenceStartDate);
    const today = parseDate(new Date().toISOString());
    const servedMonths = Math.max(0, diffMonths(start, today));
    const percent = Math.min(100, (servedMonths / totalMonths) * 100);
    const eligibilityDate = getParoleEligibilityDate(p);
    const meetsThreshold = hasMetEligibilityThreshold(p);
    const eligible = isEligibleParoleApplicant(p);
    return { totalMonths, servedMonths, percent, eligibilityDate, meetsThreshold, eligible };
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
      const pName = `${saved.firstName} ${saved.lastName}`;
      const actorName = actor ? `${actor.firstName} ${actor.lastName}` : 'System';
      const changeMeta = {
        type: 'prisoner_change',
        prisonerId: saved.id,
        institutionId: saved.institutionId,
        linkPanel: 'prisoners',
        linkHref: `prisoner-profile.html?id=${encodeURIComponent(saved.id)}`,
      };
      notifyInstitutionRoles(
        saved.institutionId,
        ['CS Parole Clerk', 'CS Parole Officer', 'Jail Commander'],
        'Parolee Record Updated',
        `${pName} (${saved.prisonerNumber}) — record updated by ${actorName}`,
        changeMeta,
      );
      notifyRoles(
        ['DJAG Parole Clerk', 'DJAG Secretary', 'Doctor', 'CS Commissioner'],
        'Parolee Record Updated',
        `${pName} (${saved.prisonerNumber}) — record updated by ${actorName}`,
        changeMeta,
      );
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

  function getParoleApplications(opts = {}) {
    const list = [...(data?.applications || [])];
    if (opts.includeArchived) return list;
    return list.filter((a) => !a.archived);
  }
  function getApplicationById(id) { return data.applications.find((a) => a.id === id); }
  function isArchivedApplication(app) { return !!app?.archived; }

  function canAccessApplicationInstitution(app, actor) {
    if (!app || !actor) return false;
    if (typeof PMSRBAC !== 'undefined') {
      if (PMSRBAC.can(actor, 'applications', 'delete')) return true;
      const perms = PMSRBAC.getPermissions?.(actor);
      const scope = perms?.applications?.scope;
      if (scope === 'all') return true;
      if (scope === 'institution' && actor.institutionId) {
        return app.institutionId === actor.institutionId;
      }
    }
    return !actor.institutionId || app.institutionId === actor.institutionId;
  }

  function getApplicationModificationPoints(app) {
    if (!app) return [];
    const points = [];
    if (app.createdAt) {
      points.push({ at: app.createdAt, kind: 'form', formN: 1, label: 'Form 1 — Parole Application' });
    }
    ['form1', 'form2', 'form3', 'form4', 'form5'].forEach((key, i) => {
      const fd = app.formData?.[key];
      if (!fd || !Object.keys(fd).length) return;
      const at = fd.submittedAt || fd.approvedAt || fd.issuedAt || fd.recordedAt || fd.updatedAt;
      if (at) {
        points.push({ at, kind: 'form', formN: i + 1, label: PAROLE_FORMS[i]?.name || `Form ${i + 1}` });
      }
    });
    (app.workflowNotes || []).forEach((n) => {
      if (n.at) points.push({ at: n.at, kind: 'status', status: n.status, label: n.status || 'Status update' });
    });
    if (app.commanderReview?.verifiedAt) {
      points.push({ at: app.commanderReview.verifiedAt, kind: 'verification', label: 'Institutional Verification' });
    }
    getHearingsByApplication(app.id).forEach((h) => {
      const at = h.updatedAt || h.scheduledDate;
      if (at) points.push({ at, kind: 'hearing', label: 'Parole Hearing' });
    });
    if (app.boardDecision?.decidedAt) {
      points.push({ at: app.boardDecision.decidedAt, kind: 'board', label: 'Board Decision' });
    }
    if (app.updatedAt) {
      points.push({
        at: app.updatedAt,
        kind: app.lastModifiedForm ? 'form' : 'update',
        formN: app.lastModifiedForm ? Number(String(app.lastModifiedForm).replace('form', '')) || null : null,
        label: app.lastModifiedLabel || 'Application updated',
      });
    }
    return points.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  }

  function resolveApplicationEditTarget(app, actor) {
    if (!app) return null;
    const appId = encodeURIComponent(app.id);
    const summary = getFormCompletionSummary(app);
    const status = app.status;

    if (['Hearing Scheduled', 'Hearing In Progress', 'Pending Board Review'].includes(status)) {
      return { href: `forms/board-decisions.html?appId=${appId}`, label: 'Board Vote', kind: 'hearing' };
    }
    if (needsCommanderVerification(app) && typeof PMSRBAC !== 'undefined' && PMSRBAC.normalizeRole(actor?.role) === 'Jail Commander') {
      return { href: `dashboard-commander.html?panel=verification&app=${app.id}`, label: 'Record Verification', kind: 'verification' };
    }
    if (needsDjagForm2Ppr(app) && typeof PMSRBAC !== 'undefined' && PMSRBAC.canAccessForm(actor, 2, 'edit')) {
      return { href: `forms/form2.html?appId=${appId}`, label: 'Form 2 — PPR section', kind: 'form', formN: 2 };
    }
    if (['Pre-Parole Report Prepared'].includes(status) && actor?.role === 'DJAG Secretary') {
      return { href: `forms/hearing-schedule.html?appId=${appId}`, label: 'Schedule Hearing', kind: 'hearing' };
    }
    if (isBoardDecisionFinalized(app)) {
      const outcome = getBoardDecisionOutcome(app);
      const formN = outcome === 'Parole Refused' ? 5 : 4;
      if (typeof PMSRBAC !== 'undefined' && PMSRBAC.canAccessForm(actor, formN, 'view')) {
        return { href: `forms/form${formN}.html?appId=${appId}`, label: `Form ${formN}`, kind: 'form', formN };
      }
    }

    const latest = getApplicationModificationPoints(app)[0];
    if (latest?.kind === 'form' && latest.formN) {
      const canView = typeof PMSRBAC === 'undefined' || PMSRBAC.canAccessForm(actor, latest.formN, 'view');
      const canEdit = typeof PMSRBAC === 'undefined' || PMSRBAC.canAccessForm(actor, latest.formN, 'edit');
      if (canView || canEdit) {
        return { href: `forms/form${latest.formN}.html?appId=${appId}`, label: latest.label, kind: 'form', formN: latest.formN };
      }
    }
    if (latest && ['hearing', 'board', 'status'].includes(latest.kind)) {
      if (typeof PMSRBAC === 'undefined' || ['DJAG Secretary', 'DJAG Parole Clerk', 'Doctor', 'CS Commissioner'].includes(actor?.role)) {
        return { href: `forms/board-decisions.html?appId=${appId}`, label: 'Board Vote', kind: 'hearing' };
      }
    }
    if (latest?.kind === 'verification' && actor?.role === 'Jail Commander') {
      return { href: `dashboard-commander.html?panel=verification&app=${app.id}`, label: 'Verification', kind: 'verification' };
    }

    for (let n = 1; n <= 5; n += 1) {
      const key = `form${n}`;
      if (summary.checks[key]) continue;
      if (typeof PMSRBAC !== 'undefined' && !PMSRBAC.canAccessForm(actor, n, 'edit')) continue;
      if (typeof PMSFormWorkflow !== 'undefined' && !PMSFormWorkflow.canAccess(app.id, n)) continue;
      return { href: `forms/form${n}.html?appId=${appId}`, label: PAROLE_FORMS[n - 1]?.name || `Form ${n}`, kind: 'form', formN: n };
    }

    for (let n = 5; n >= 1; n -= 1) {
      if (!summary.checks[`form${n}`]) continue;
      if (typeof PMSRBAC !== 'undefined' && !PMSRBAC.canAccessForm(actor, n, 'view')) continue;
      return { href: `forms/form${n}.html?appId=${appId}`, label: PAROLE_FORMS[n - 1]?.name || `Form ${n}`, kind: 'form', formN: n };
    }

    return { href: `forms/board-decisions.html?appId=${appId}`, label: 'Case overview', kind: 'hearing' };
  }

  function canDeleteApplication(app, actor) {
    if (!app || app.archived || !actor) return false;
    if (!['Draft', 'Returned for Correction'].includes(app.status)) return false;
    if (getHearingsByApplication(app.id).length) return false;
    if (app.boardDecision?.outcome) return false;
    if (typeof PMSRBAC !== 'undefined') {
      if (PMSRBAC.can(actor, 'applications', 'delete')) return canAccessApplicationInstitution(app, actor);
      if (actor.role === 'CS Parole Clerk' && canAccessApplicationInstitution(app, actor)) return true;
    }
    return actor.role === 'System Administrator';
  }

  function canArchiveApplication(app, actor) {
    if (!app || app.archived || !actor) return false;
    if (!isTerminalApplicationStatus(app.status) && !['Draft'].includes(app.status)) return false;
    if (app.status === 'Draft') return false;
    if (typeof PMSRBAC !== 'undefined') {
      return (PMSRBAC.can(actor, 'applications', 'update') || PMSRBAC.can(actor, 'applications', 'delete'))
        && canAccessApplicationInstitution(app, actor);
    }
    return ['System Administrator', 'CS Parole Clerk'].includes(actor.role);
  }

  function deleteApplication(appId, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    if (!canDeleteApplication(app, actor)) {
      throw new Error('You may only delete draft or returned applications with no hearings.');
    }
    const prisoner = getPrisonerById(app.prisonerId);
    data.applications = data.applications.filter((a) => a.id !== appId);
    data.hearings = (data.hearings || []).filter((h) => h.applicationId !== appId);
    if (data.notifications) {
      data.notifications.forEach((n) => {
        if (n.applicationId === appId && !n.resolved) n.resolved = true;
      });
    }
    logAudit(actor, 'DELETE', 'ParoleApplication', appId, prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : app.caseNumber || appId);
    persist();
  }

  function archiveApplication(appId, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    if (!canArchiveApplication(app, actor)) {
      throw new Error('You may only archive completed or closed parole cases.');
    }
    app.archived = true;
    app.archivedAt = new Date().toISOString();
    app.archivedBy = actor.id;
    app.updatedAt = app.archivedAt;
    logAudit(actor, 'ARCHIVE', 'ParoleApplication', appId, app.caseNumber || appId);
    persist();
    return app;
  }

  function createEmptyForms() {
    return PAROLE_FORMS.map((f) => ({
      formNumber: f.number, formName: f.name, fileName: null, dataUrl: null,
      uploadedAt: null, verified: false, verifiedBy: null,
    }));
  }
  function createEmptyFormData() { return { form1: {}, form2: {}, form3: {}, form4: {}, form5: {} }; }

  function isForm1Complete(form1) {
    if (!form1) return false;
    if (typeof PMSForm1Validation !== 'undefined') return PMSForm1Validation.isForm1Complete(form1);
    if (form1.status === 'submitted' || form1.status === 'verified') return true;
    if (form1.sections?.E?.prisoner_consent && (form1.submittedAt || form1.status === 'submitted')) return true;
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

    const existingSecE = existing.sections?.E || existing.sectionE;
    const paroleAppComplete = !!(existingSecE?.prisoner_consent && (existingSecE?.consent_date || existingSecE?.consentDate));
    if (existing.status === 'submitted' && !supervisorReview && paroleAppComplete) {
      throw new Error('Submitted Form 1 cannot be modified.');
    }

    let merged = { ...existing, ...form1Data, prisonerId: prisoner.id, applicationId: appId };

    if (supervisorReview) {
      const role = PMSRBAC.normalizeRole(actor.role);
      if (role !== 'CS Parole Clerk') {
        throw new Error('Only a CS Parole Clerk may record supervisory review.');
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
      notifyRoles(['CS Parole Clerk', 'DJAG Parole Clerk'], 'Form 1 Submitted', `Form 1 submitted for ${prisoner.firstName} ${prisoner.lastName}`, {
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
      data.applications[idx] = {
        ...data.applications[idx],
        ...payload,
        updatedAt: new Date().toISOString(),
      };
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
    if (!data) throw new Error('Storage is not ready. Refresh the page and try again.');
    app.formData = app.formData || createEmptyFormData();
    const merged = PMSIdGenerator.assignFormId(data, formKey, { ...app.formData[formKey], ...formData });
    merged.savedAt = formData.savedAt || merged.savedAt || new Date().toISOString();
    if (formData.saveSource === 'autosave') merged.lastAutoSavedAt = new Date().toISOString();
    app.formData[formKey] = merged;
    app.updatedAt = new Date().toISOString();
    app.lastModifiedForm = formKey;
    app.lastModifiedLabel = PAROLE_FORMS.find((f) => `form${f.number}` === formKey)?.name || formKey;
    logAudit(actor, 'SAVE', 'Form', merged.formId || `${appId}-${formKey}`, PAROLE_FORMS.find((f) => `form${f.number}` === formKey)?.name || formKey);
    if (formKey === 'form3' && isForm3Complete(app.formData.form3) && needsCommanderVerification(app)) {
      if (app.status !== 'Pending Commander Review') {
        try {
          transitionApplication(appId, 'Pending Commander Review', actor, 'Form 3 submitted — awaiting Jail Commander verification');
        } catch (err) {
          promoteToCommanderReviewIfReady(app, { notify: true });
        }
      }
    }
    syncApplicationWorkflowState(app);
    persist();
    return app;
  }

  function transitionApplication(appId, toStatus, actor, notes = '') {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    const fromStatus = app.status;
    if (typeof PMSWorkflow !== 'undefined') {
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
    app.updatedAt = new Date().toISOString();
    app.lastModifiedLabel = `Status → ${toStatus}`;
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
        ['CS Parole Clerk', 'Jail Commander'],
        'Institutional Verification Required',
        `Form 3 and case verification required for ${pName}`,
        { ...appMeta, type: 'verification', linkPanel: 'verification' }
      );
    }
    if (toStatus === 'Returned for Correction') {
      notifyInstitutionRoles(
        app.institutionId,
        ['CS Parole Clerk', 'CS Parole Officer'],
        'Application Returned',
        notes || 'Application returned for correction',
        { ...appMeta, type: 'returned' }
      );
    }
    if (toStatus === 'Under DJAG Review') {
      notifyRole('CS Parole Clerk', 'Application Under Review', `Application for ${pName} is under DJAG review`, app.institutionId, app.prisonerId, null, appMeta);
    }
    if (toStatus === 'Pre-Parole Report Prepared') {
      notifyRoles(['Doctor', 'CS Commissioner', 'DJAG Secretary'], 'Pre-Parole Report Ready', `Pre-parole report prepared for ${pName}`, appMeta);
    }
    if (toStatus === 'Hearing Scheduled') {
      notifyRoles(['Doctor', 'CS Commissioner', 'DJAG Secretary', 'CS Parole Clerk', 'DJAG Parole Clerk'], 'Hearing Scheduled',
        `Parole hearing scheduled for ${pName}`, { ...appMeta, type: 'hearing', linkPanel: 'hearings' });
    }
    if (toStatus === 'Hearing In Progress') {
      notifyRoles(['Doctor', 'CS Commissioner', 'DJAG Secretary'], 'Hearing In Progress',
        `Parole hearing session started for ${pName}`, { ...appMeta, type: 'hearing', linkPanel: 'hearings' });
    }
    if (toStatus === 'Pending Board Review') {
      notifyRoles(['Doctor', 'CS Commissioner', 'DJAG Secretary'], 'Application Ready for Board', `Application ready for board review: ${pName}`, appMeta);
    }
    if (toStatus === 'Approved') {
      notifyRoles(['CS Parole Clerk', 'DJAG Parole Clerk'], 'Application Approved', `Parole application approved for ${pName}`, appMeta);
      notifyInstitutionRoles(
        app.institutionId,
        ['Jail Commander'],
        'Release Authorization Required',
        `Parole approved for ${pName} — authorize release after board interviews are complete`,
        { ...appMeta, type: 'release', linkPanel: 'release' },
      );
    }
    if (toStatus === 'Refused') {
      notifyRoles(['CS Parole Clerk', 'DJAG Parole Clerk'], 'Application Refused', notes || `Parole application refused for ${pName}`, appMeta);
    }
    if (toStatus === 'Pending Approval') {
      notifyRoles(['DJAG Secretary', 'CS Parole Clerk'], 'Approval Required', `Final approval required for ${pName}`, { ...appMeta, type: 'approval' });
    }
    if (toStatus === 'Parole Granted') {
      notifyRoles(['CS Parole Clerk', 'DJAG Parole Clerk'], 'Decision Available', `Parole granted for ${pName}`, appMeta);
    }
    if (toStatus === 'Released') {
      notifyRoles(['System Administrator', 'CS Parole Clerk'], 'Release Recorded', `${pName} release on parole recorded`, appMeta);
    }
    if (toStatus === 'Deferred') {
      notifyRoles(['CS Parole Clerk', 'DJAG Parole Clerk'], 'Decision Deferred', notes || `Parole decision deferred for ${pName}`, appMeta);
    }
    if (prisoner) applyPrisonerEligibility(prisoner, actor);
    syncApplicationProgress(appId);
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
    if (!['Hearing In Progress', 'Hearing Scheduled', 'Pending Board Review', 'Parole Granted', 'Parole Refused'].includes(app.status)) {
      throw new Error('Application must be in an active hearing or board review status.');
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
    const payload = { ...hearing };
    if (!payload.id && payload.applicationId) {
      const existing = findActiveHearingRecord(payload.applicationId);
      if (existing) payload.id = existing.id;
    }
    const isUpdate = !!payload.id;
    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(actor.role) : actor.role;
    const prev = isUpdate ? getHearingById(payload.id) : null;
    const schedulingAction = !isUpdate
      || payload.status === 'Cancelled'
      || (payload.scheduledDate !== undefined && payload.scheduledDate !== prev?.scheduledDate)
      || (payload.scheduledTime !== undefined && payload.scheduledTime !== prev?.scheduledTime)
      || (payload.location !== undefined && payload.location !== prev?.location);
    const canSchedule = typeof PMSRBAC !== 'undefined'
      ? PMSRBAC.canScheduleHearing(actor)
      : role === 'DJAG Secretary';
    if (schedulingAction && !canSchedule) {
      throw new Error('Only the DJAG Secretary may set or change hearing dates.');
    }
    if (payload.applicationId && payload.scheduledDate && !payload.deadlineException) {
      const app = getApplicationById(payload.applicationId);
      if (app && typeof PMSWorkflow !== 'undefined') {
        const blockers = PMSWorkflow.getAdvanceBlockers(app, 'Hearing Scheduled');
        if (blockers.length) throw new Error(`Cannot schedule hearing: ${blockers.join(' ')}`);
      }
      const info = app ? getHearingDeadlineInfo(app) : null;
      if (info?.deadlineAt && new Date(payload.scheduledDate) > new Date(info.deadlineAt)) {
        throw new Error(`Hearing date exceeds the ${HEARING_DEADLINE_DAYS}-day deadline (${info.deadlineAt}). Record an authorized exception to proceed.`);
      }
    }
    if (payload.id) {
      const idx = data.hearings.findIndex((h) => h.id === payload.id);
      if (idx < 0) throw new Error('Hearing not found');
      const prevRecord = data.hearings[idx];
      const sched = payload.scheduledDate ? new Date(payload.scheduledDate) : null;
      let status = payload.status || prevRecord.status || 'Scheduled';
      if (sched && sched > new Date() && status !== 'Cancelled') status = 'Upcoming';
      data.hearings[idx] = {
        ...prevRecord,
        ...payload,
        caseNumber: payload.caseNumber || prevRecord.caseNumber || getApplicationById(prevRecord.applicationId)?.caseNumber,
        status,
        updatedAt: new Date().toISOString(),
      };
    } else {
      const app = payload.applicationId ? getApplicationById(payload.applicationId) : null;
      const id = generateId('hearing');
      const sched = new Date(payload.scheduledDate);
      const now = new Date();
      let status = payload.status || 'Scheduled';
      if (sched > now) status = 'Upcoming';
      data.hearings.push({
        ...payload,
        id,
        caseNumber: app?.caseNumber || payload.caseNumber,
        status,
        boardMembers: payload.boardMembers || [],
        meetingNotes: payload.meetingNotes || '',
        attendance: payload.attendance || [],
        outcome: payload.outcome || null,
        createdAt: new Date().toISOString(),
      });
    }
    const saved = payload.id ? getHearingById(payload.id) : data.hearings.at(-1);
    if (saved?.applicationId) {
      data.hearings.forEach((h) => {
        if (h.id === saved.id) return;
        if (h.applicationId === saved.applicationId && !['Cancelled', 'Completed'].includes(h.status)) {
          h.status = 'Cancelled';
          h.supersededAt = new Date().toISOString();
          h.supersededReason = 'Superseded by rescheduled hearing';
        }
      });
    }
    dedupeActiveHearingsPerApplication();
    logAudit(actor, isUpdate ? 'UPDATE' : 'CREATE', 'Hearing', saved.id, payload.location || '');
    const p = getPrisonerById(saved.prisonerId);
    const pName = p ? `${p.firstName} ${p.lastName}` : 'prisoner';
    const title = isUpdate ? 'Hearing Date Updated' : 'Hearing Scheduled';
    const dateLabel = saved.scheduledDate || 'TBD';
    const timeLabel = saved.scheduledTime ? ` at ${saved.scheduledTime}` : '';
    const venueLabel = saved.location || 'TBD';
    const msg = `Parole hearing for ${pName} on ${dateLabel}${timeLabel} · ${venueLabel}. Panel members (Doctor, CS Commissioner, DJAG Secretary) may submit assessments independently when ready.`;
    const portalLink = saved.applicationId
      ? `forms/board-decisions.html?appId=${encodeURIComponent(saved.applicationId)}`
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
        ['DJAG Parole Clerk', 'Doctor', 'CS Commissioner', 'DJAG Secretary'],
        title,
        msg,
        hearingMeta,
      );
      if (p?.institutionId) {
        notifyInstitutionRoles(
          p.institutionId,
          ['CS Parole Clerk', 'Jail Commander', 'CS Parole Officer'],
          title,
          msg,
          hearingMeta,
        );
      }
    } else if (saved.status === 'Cancelled') {
      notifyRoles(
        ['DJAG Parole Clerk', 'Doctor', 'CS Commissioner', 'DJAG Secretary'],
        'Hearing Cancelled',
        `Parole hearing for ${pName} on ${dateLabel} was cancelled.`,
        hearingMeta,
      );
      if (p?.institutionId) {
        notifyInstitutionRoles(
          p.institutionId,
          ['CS Parole Clerk', 'Jail Commander'],
          'Hearing Cancelled',
          `Parole hearing for ${pName} on ${dateLabel} was cancelled.`,
          hearingMeta,
        );
      }
    }
    if (saved.applicationId && saved.status !== 'Cancelled') {
      const app = getApplicationById(saved.applicationId);
      if (app && !isUpdate) {
        const eligibleFrom = new Date(app.submittedAt || app.createdAt);
        const deadline = new Date(eligibleFrom);
        deadline.setDate(deadline.getDate() + HEARING_DEADLINE_DAYS);
        const hearingDate = new Date(saved.scheduledDate);
        if (hearingDate > deadline) {
          notifyRole('DJAG Secretary', 'Hearing Deadline Warning', `Hearing for ${app.caseNumber || app.id} is scheduled beyond the ${HEARING_DEADLINE_DAYS}-day requirement`, app.institutionId, app.prisonerId, null, { applicationId: app.id, type: 'deadline' });
        }
      }
      if (app && !POST_HEARING_SCHEDULE_STATUSES.includes(app.status)) {
        try {
          transitionApplication(saved.applicationId, 'Hearing Scheduled', actor, `${isUpdate ? 'Hearing updated' : 'Hearing scheduled'} for ${saved.scheduledDate || 'TBD'}`);
        } catch (err) {
          app.status = 'Hearing Scheduled';
          app.updatedAt = new Date().toISOString();
          app.workflowNotes = [...(app.workflowNotes || []), {
            status: 'Hearing Scheduled',
            notes: err.message || 'Hearing recorded — status synced locally',
            at: new Date().toISOString(),
            by: actor.id,
            actorName: `${actor.firstName} ${actor.lastName}`,
          }];
        }
      }
    }
    if (saved.applicationId) {
      resolveHearingNotifications(saved.applicationId);
      syncApplicationProgress(saved.applicationId);
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

  const ALLOWED_NOTIFICATION_TYPES = new Set([
    'eligibility',
    'parole_eligibility',
    'deadline',
    'escalation',
    'board_review',
    'prisoner_change',
    'verification',
    'hearing',
    'application',
    'returned',
    'release',
    'approval',
    'system',
    'form1',
    'form2',
    'form3',
  ]);

  function isAllowedNotificationType(type) {
    return ALLOWED_NOTIFICATION_TYPES.has(type);
  }

  function migrateNotifications() {
    if (!data.notifications) data.notifications = [];
    const secretaryNotifs = [
      { id: 'NOT-000005', type: 'escalation', title: 'Hearing Overdue', message: 'Case PMS-2026-000004 (Sarah Tekate) is overdue for hearing scheduling.', recipientRole: 'DJAG Secretary', recipientUserId: 'USR-000025', institutionId: 'INS-000001', prisonerId: 'PR-000003', applicationId: 'APP-000004', linkPanel: 'hearings', read: false, resolved: false, createdAt: '2026-07-15T08:00:00.000Z', dedupeKey: 'escalation:APP-000004:DJAG Secretary:Hearing Overdue' },
      { id: 'NOT-000006', type: 'board_review', title: 'Submit Board Assessment', message: 'Parole hearing scheduled for Paul Kaupa (PMS-2026-000001) — submit your Approve, Deny, or Defer vote when ready.', recipientRole: 'DJAG Secretary', recipientUserId: 'USR-000025', institutionId: 'INS-000001', prisonerId: 'PR-000001', applicationId: 'APP-000001', linkPanel: 'decisions', read: false, resolved: false, createdAt: '2026-06-20T09:00:00.000Z', dedupeKey: 'board_review:APP-000001:DJAG Secretary:Submit Board Assessment' },
      { id: 'NOT-000007', type: 'verification', title: 'Institutional Verification Required', message: 'Peter Wama (PMS-2026-000002) — Forms 1–3 complete. Review and verify the case package.', recipientRole: 'Jail Commander', recipientUserId: 'USR-000028', institutionId: 'INS-000001', prisonerId: 'PR-000002', applicationId: 'APP-000002', linkPanel: 'verification', read: false, resolved: false, createdAt: '2026-08-10T15:00:00.000Z', dedupeKey: 'verification:APP-000002:Jail Commander:Institutional Verification Required' },
    ];
    secretaryNotifs.forEach((seed) => {
      if (!data.notifications.some((n) => n.id === seed.id || n.dedupeKey === seed.dedupeKey)) {
        data.notifications.push(seed);
      }
    });
    const seen = new Set();
    data.notifications = data.notifications.filter((n) => {
      if (!isAllowedNotificationType(n.type)) {
        if (n.type === 'parole_eligibility') n.type = 'eligibility';
        else return n.resolved === true;
      }
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
    if (!isAllowedNotificationType(type)) return null;
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
        ['CS Parole Clerk', 'CS Parole Officer'],
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
      if (h.applicationId) return `forms/board-decisions.html?appId=${encodeURIComponent(h.applicationId)}`;
      return `?panel=hearings&hearing=${encodeURIComponent(h.id)}`;
    }

    const boardRoles = ['Doctor', 'CS Commissioner', 'DJAG Secretary'];
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

    const scopeInst = ['CS Parole Clerk', 'CS Parole Officer'].includes(role) ? user.institutionId : null;
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
    const INSTITUTION_SCOPED = ['CS Parole Clerk', 'CS Parole Officer', 'Jail Commander'];
    return data.notifications.filter((n) => {
      if (!isAllowedNotificationType(n.type)) return false;
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

  function countUpcomingHearings() {
    return getScheduledHearings().length;
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
    const users = data.users || [];
    const boardRoles = ['Doctor', 'CS Commissioner', 'DJAG Secretary'];
    const allApps = getAllParoleApplications({ includeArchived: true });
    const scopedAll = scopeInstitutionId
      ? allApps.filter((a) => a.institutionId === scopeInstitutionId)
      : allApps;
    const granted = scopedAll.filter((a) => isForm4Issued(a)).length;
    const refused = apps.filter((a) => ['Refused', 'Parole Refused'].includes(a.status) || a.formData?.form5?.status === 'Parole Refused').length;
    return {
      totalUsers: data.users.length,
      totalStaff: data.users.filter((u) => u.role !== 'System Administrator').length,
      totalOfficers: data.users.filter((u) => ['CS Parole Clerk', 'CS Parole Officer', 'Jail Commander'].includes(u.role)).length,
      totalPrisoners: prisoners.length,
      totalInstitutions: data.institutions.length,
      totalParoleCases: apps.length,
      activeParoleApplications: apps.filter((a) => isActiveParoleApplication(a)).length,
      completedCases: apps.filter((a) => isTerminalApplicationStatus(a.status)).length,
      eligiblePrisoners: countEligibleParoleApplicants(scopeInstitutionId),
      pendingAssessments: apps.filter((a) => a.status === 'Pending Board Review' && !requiredBoardAssessmentsComplete(a)).length,
      upcomingHearings: countUpcomingHearings(),
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
    getSettings, saveSettings, isAct1991ParoleSyncEnabled, getAuditLogs, logAudit, validatePrisonerDates, applyPrisonerEligibility,
    getUsers, getUserById, getUserByUsername, saveUser, deleteUser, resetPassword, authenticate,
    verifySigningPin, getSigningPinForUser, ensureSigningPins, DEMO_SIGNING_PINS,
    getInstitutions, getInstitutionById, getActiveInstitutions: () => getInstitutions(true),
    getJailCommanderForInstitution, getJailCommanders, getCommanderProfile, saveCommanderProfile, getCommanderDetailBundle,
    getPrisonersByInstitution, getInstitutionStats,
    assignJailCommander, saveInstitution, deleteInstitution, getOfficersByInstitution,
    getPrisoners, getPrisonerById, getSentenceDurationMonths, getParoleEligibilityDate, getPrisonerProgress,
    hasMetEligibilityThreshold, isEligibleParoleApplicant, getEligibleParoleApplicants, countEligibleParoleApplicants,
    isParoleGrantComplete, isParoleApplicationRefused, notifyDataChange,
    savePrisoner, deletePrisoner, addPrisonerDocument, removePrisonerDocument, addCaseDocument, getCaseDocuments,
    formatAgencyUsername, agencyDomainForRole, applyBoardMemberContract, BOARD_CONTRACT_YEARS,
    getParoleApplications, getApplicationById, isArchivedApplication,
    getApplicationModificationPoints, resolveApplicationEditTarget,
    canDeleteApplication, canArchiveApplication, deleteApplication, archiveApplication,
    saveParoleApplication, uploadApplicationForm,
    verifyApplicationForm, submitApplicationToDJAG, createEmptyForms, createEmptyFormData,
    saveFormData, saveForm1Screening, saveForm2Section, getOrCreateDraftApplication, isForm1Complete, isForm2Complete,
    FORM2_ATTACHMENT_LABELS, getForm2AttachmentFiles, getForm2AttachmentFile, canDownloadForm2Attachments, downloadForm2Attachment,
    isForm4Issued, getAllParoleApplications, getGrantedParoleCases, countGrantedParole, getParoleGrantedArchive, archiveParoleGrantedCase,
    needsDjagForm2Ppr, getApplicationsForDjagClerk, isForm3Complete, isForm4Complete, isForm5Complete,
    transitionApplication, recordBoardDecision, routeParoleOutcome, issueForm4Grant, issueForm5Refusal,
    getBoardDecisionOutcome, isBoardDecisionFinalized, canProceedToForm4, canProceedToForm5,
    getFormCompletionSummary, calculateParoleScore, getHearingDeadlineInfo,
    getCaseTimeline, getCaseTracker, syncApplicationProgress, syncAllApplicationProgress, getReleaseRequirements, getEscalations, runEscalationChecks,
    getOffenses, saveOffense, deleteOffense,
    startHearing, maybeCompleteHearingOnVoteTally, saveBoardAssessment, saveInterviewSessionMeta, getBoardAssessments, getBoardAssessmentProgress, getBoardAssessmentForActor,
    getBoardAssessmentEntryForRole,
    hasSubmittedBoardAssessment, requiredBoardAssessmentsComplete, calculateBoardVotes, finalizeBoardVotes,
    saveMedicalEvaluation, getMedicalEvaluations, isVerificationReady, needsCommanderVerification,
    promoteToCommanderReviewIfReady, syncApplicationWorkflowState, syncAllApplicationWorkflowStates,
    isParoleGrantedForRelease,
    BOARD_ASSESSOR_ROLES, BOARD_VOTING_ROLES,
    getReleaseBlockers, canAuthorizeRelease, authorizeRelease, overrideEligibility, saveCommanderCaseReview, saveCommanderVerificationDraft,
    reconcileCommanderVerification, syncCommanderVerificationState, resolveVerificationNotifications, resolveHearingNotifications,
    saveApprovalStep, getGuarantors, saveGuarantor, deleteGuarantor, requiredApprovalsComplete,
    generateCaseNumber, syncBoardContracts, isCommanderVerified, isCommanderVerificationLocked,
    getCommanderVerificationRecord, getCommanderVerifiedApplications, isForm1Verified, isVerificationReady,
    getHearings, getHearingById, getHearingsByPrisoner, getHearingsByApplication, getScheduledHearings, saveHearing, HEARING_STATUSES,
    getReports, createReport, previewNextId,
    getNotifications, getNotificationsForUser, getCalendarEventsForUser, syncParoleNotifications,
    markNotificationRead, resolveNotification, markAllNotificationsRead,
    getUnreadCount, getUnreadCountForUser,
    setSession, getSession, clearSession, getDashboardStats,
    TERMINAL_APPLICATION_STATUSES, isTerminalApplicationStatus, isActiveParoleApplication,
    countUpcomingHearings, countOverdueCaseEscalations,
  };
})();
