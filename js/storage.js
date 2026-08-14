/**
 * PMS Storage — in-memory data layer with MySQL sync via /api/bootstrap.
 * Falls back to localStorage when the API server is unavailable.
 */
const PMSStorage = (() => {
  const LS_KEY = 'pms_mock_data_v4';
  const SESSION_KEY = 'pms_session';
  const API_BASE_KEY = 'pms_api_base';
  const API_TOKEN_KEY = 'pms_api_token';

  const DEMO_PASSWORDS = {
    admin: 'admin123',
    'john.dole@cs.gov.pg': 'Password123!',
    'mary.kila@djag.gov.pg': 'Password123!',
    'commander@cs.gov.pg': 'Password123!',
    'judge.kakaraya@justice.gov.pg': 'Password123!',
  };

  function registerCommanderPassword(username) {
    DEMO_PASSWORDS[username] = 'Password123!';
  }

  function buildDefaultCommanders(institutions) {
    const rows = typeof PNGCS_JAIL_COMMANDERS !== 'undefined' && PNGCS_JAIL_COMMANDERS.length
      ? PNGCS_JAIL_COMMANDERS
      : [{ instIndex: 1, firstName: 'James', lastName: 'Wari', employeeNumber: 'EMP-10001', phone: '+675 7345 6789', username: 'commander@cs.gov.pg', dateAppointed: '2019-03-15' }];

    return rows.map((c) => {
      const instId = `INS-${String(c.instIndex).padStart(6, '0')}`;
      const inst = institutions.find((i) => i.id === instId);
      const usrNum = c.instIndex === 1 ? 4 : 4 + c.instIndex;
      const id = `USR-${String(usrNum).padStart(6, '0')}`;
      const officerNum = c.instIndex === 1 ? 3 : 3 + c.instIndex;
      registerCommanderPassword(c.username);
      const lastLoginDay = 10 + (c.instIndex % 18);
      return {
        id,
        officerId: `OFF-${String(officerNum).padStart(6, '0')}`,
        employeeNumber: `EMP-${String(usrNum).padStart(6, '0')}`,
        username: c.username,
        email: c.username,
        firstName: c.firstName,
        lastName: c.lastName,
        role: 'Jail Commander',
        rank: 'Jail Commander',
        position: 'Jail Commander',
        institutionId: instId,
        province: inst?.province || '',
        phone: c.phone,
        employmentStatus: 'Active',
        accountStatus: 'Active',
        status: 'Active',
        dateAppointed: c.dateAppointed,
        lastLogin: `2026-07-${String(lastLoginDay).padStart(2, '0')}T0${8 + (c.instIndex % 2)}:30:00.000Z`,
        profilePhoto: null,
        boardPosition: null,
      };
    });
  }

  const USER_ROLES = [
    'System Administrator', 'PNGCS Parole Clerk', 'DJAG Parole Clerk',
    'Jail Commander', 'Parole Board Member',
  ];
  const OFFICER_ROLES = USER_ROLES.filter((r) => r !== 'System Administrator');
  const BOARD_POSITIONS = ['Chairperson', 'Commissioner PNGCS', 'Medical Member'];
  const PAROLE_FORMS = [
    { number: 1, name: 'Form 1 — Parole Eligibility Screening' },
    { number: 2, name: 'Form 2 — Personal Particulars of Offender' },
    { number: 3, name: 'Form 3 — Institutional Report' },
    { number: 4, name: 'Form 4 — Pre-Parole Investigation Report' },
    { number: 5, name: 'Form 5 — Parole Board Decision Record' },
  ];
  const APPLICATION_STATUSES = [
    'Draft', 'Submitted', 'Under DJAG Review', 'Returned for Correction',
    'Pre-Parole Report Prepared', 'Hearing Scheduled', 'Pending Board Review',
    'Approved', 'Deferred', 'Refused',
  ];
  const PRISONER_STATUSES = [
    'Awaiting Eligibility',
    'Eligible for Parole Application',
    'Assessment in Progress',
    'Hearing Scheduled',
    'Approved',
    'Rejected',
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

  async function pushSnapshotToDatabase(snapshot, passwords = DEMO_PASSWORDS) {
    const res = await fetch(`${getApiBaseUrl()}/api/bootstrap`, {
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
    const res = await fetch(`${getApiBaseUrl()}/api/bootstrap`, {
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
      : [
          { name: 'Bomana Correctional Institution', province: 'National Capital District', address: 'Port Moresby' },
          { name: 'Buimo Correctional Service Facility', province: 'Morobe', address: 'Lae' },
          { name: 'Baisu Correctional Service Facility', province: 'Western Highlands', address: 'Mount Hagen' },
          { name: 'Kerevat Correctional Service Facility', province: 'East New Britain', address: 'Kerevat' },
          { name: 'Boram Jail', province: 'East Sepik', address: 'Wewak' },
          { name: 'Bihute Correctional Service Facility', province: 'Eastern Highlands', address: 'Goroka' },
          { name: 'Barawagi Correctional Service Facility', province: 'Chimbu', address: 'Kundiawa' },
          { name: 'Bundaira Correctional Service Facility', province: 'Eastern Highlands', address: 'Kainantu' },
          { name: 'Bui-Iebi Correctional Service Facility', province: 'Southern Highlands', address: 'Mendi' },
          { name: 'Kavieng Correctional Service Facility', province: 'New Ireland', address: 'Kavieng' },
          { name: 'Manus Correctional Service Facility', province: 'Manus', address: 'Lorengau' },
          { name: 'Lakiemata Correctional Service Facility', province: 'West New Britain', address: 'Kimbe' },
          { name: 'Daru Correctional Service Facility', province: 'Western', address: 'Daru' },
          { name: 'Giligili Correctional Service Facility', province: 'Milne Bay', address: 'Alotau' },
          { name: 'Beon Correctional Service Facility', province: 'Madang', address: 'Madang' },
          { name: 'Vanimo Correctional Service Facility', province: 'West Sepik', address: 'Vanimo' },
          { name: 'Biru Correctional Service Facility', province: 'Northern', address: 'Popondetta' },
          { name: 'Mukurumanda Correctional Service Facility', province: 'Enga', address: 'Wabag' },
          { name: 'Hawa Correctional Service Facility', province: 'Hela', address: 'Tari' },
        ];
    return rows.map((row, i) => {
      const id = `INS-${String(i + 1).padStart(6, '0')}`;
      const commanderUsr = i === 0 ? 4 : 4 + i + 1;
      return {
      id,
      code: id,
      name: row.name,
      province: row.province,
      address: row.address,
      location: row.address,
      status: 'Active',
      commanderId: `USR-${String(commanderUsr).padStart(6, '0')}`,
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
    const commanders = buildDefaultCommanders(institutions);
    const seed = {
      settings: { ...DEFAULT_SETTINGS },
      institutions,
      users: [
        { id: 'USR-000001', officerId: null, employeeNumber: null, username: 'admin', email: 'admin@pms.gov.pg', firstName: 'System', lastName: 'Administrator', role: 'System Administrator', rank: 'Administrator', institutionId: null, province: '', position: 'Administrator', phone: '', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2018-01-01', lastLogin: '2026-07-30T09:00:00.000Z', profilePhoto: null },
        { id: 'USR-000002', officerId: 'OFF-000001', employeeNumber: 'EMP-000002', username: 'john.dole@cs.gov.pg', email: 'john.dole@cs.gov.pg', firstName: 'John', lastName: 'Dole', role: 'PNGCS Parole Clerk', rank: 'Parole Clerk', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Clerk', phone: '+675 7123 4567', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2020-05-10', lastLogin: '2026-07-29T14:00:00.000Z', profilePhoto: null },
        { id: 'USR-000003', officerId: 'OFF-000002', employeeNumber: 'EMP-000003', username: 'mary.kila@djag.gov.pg', email: 'mary.kila@djag.gov.pg', firstName: 'Mary', lastName: 'Kila', role: 'DJAG Parole Clerk', rank: 'Parole Clerk', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Clerk', phone: '+675 7234 5678', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2021-03-22', lastLogin: '2026-07-28T11:00:00.000Z', profilePhoto: null },
        commanders[0],
        { id: 'USR-000005', officerId: 'OFF-000004', employeeNumber: 'EMP-000005', username: 'judge.kakaraya@justice.gov.pg', email: 'judge.kakaraya@justice.gov.pg', firstName: 'Francis', lastName: 'Kakaraya', role: 'Parole Board Member', rank: 'Board Member', institutionId: 'INS-000001', province: 'National Capital District', position: 'Board Member', phone: '+675 7456 7890', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'Chairperson', status: 'Active', dateAppointed: '2016-11-05', lastLogin: '2026-07-27T10:00:00.000Z', profilePhoto: null },
        ...commanders.slice(1),
      ],
      prisoners: [
        { id: 'PR-000001', prisonerNumber: 'PR-000001', institutionId: 'INS-000001', firstName: 'Paul', lastName: 'Kaupa', dateOfBirth: '1992-04-10', gender: 'Male', offense: 'Armed Robbery', sentenceStartDate: '2020-01-15', sentenceEndDate: '2030-01-15', status: 'Eligible for Parole', documents: [] },
        { id: 'PR-000002', prisonerNumber: 'PR-000002', institutionId: 'INS-000001', firstName: 'Peter', lastName: 'Wama', dateOfBirth: '1988-09-18', gender: 'Male', offense: 'Unlawful Wounding', sentenceStartDate: '2019-06-01', sentenceEndDate: '2027-06-01', status: 'In Custody', documents: [] },
        { id: 'PR-000003', prisonerNumber: 'PR-000003', institutionId: 'INS-000003', firstName: 'Sarah', lastName: 'Tekate', dateOfBirth: '1995-12-01', gender: 'Female', offense: 'Grand Larceny', sentenceStartDate: '2022-03-10', sentenceEndDate: '2028-03-10', status: 'In Custody', documents: [] },
      ],
      applications: [
        {
          id: 'APP-000001', prisonerId: 'PR-000001', institutionId: 'INS-000001', status: 'Submitted',
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
            form3: {}, form4: {}, form5: {},
          },
          boardDecision: null, workflowNotes: [], createdAt: now,
        },
        {
          id: 'APP-000002', prisonerId: 'PR-000002', institutionId: 'INS-000001', status: 'Draft',
          submittedAt: null, submittedBy: null,
          formData: { form1: {}, form2: {}, form3: {}, form4: {}, form5: {} },
          boardDecision: null, workflowNotes: [], createdAt: now,
        },
        {
          id: 'APP-000003', prisonerId: 'PR-000002', institutionId: 'INS-000001', status: 'Approved',
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
      ],
      hearings: [
        { id: 'HRG-000001', applicationId: 'APP-000001', prisonerId: 'PR-000001', institutionId: 'INS-000001', scheduledDate: '2026-08-15', scheduledTime: '10:00', location: 'Bomana Hearing Room A', notes: 'Initial board hearing', status: 'Scheduled' },
      ],
      notifications: [
        { id: 'NOT-000001', type: 'parole_eligibility', title: 'Parole Eligibility Alert', message: 'Paul Kaupa (PR-000001) has reached parole eligibility threshold.', recipientRole: 'PNGCS Parole Clerk', recipientUserId: null, institutionId: 'INS-000001', prisonerId: 'PR-000001', eligibleDate: '2025-01-15', read: false, resolved: false, createdAt: '2026-01-15T08:00:00.000Z' },
        { id: 'NOT-000002', type: 'system', title: 'New Parole Application', message: 'PNGCS submitted application for Paul Kaupa — pending DJAG review.', recipientRole: 'DJAG Parole Clerk', recipientUserId: null, institutionId: 'INS-000001', prisonerId: 'PR-000001', read: false, resolved: false, createdAt: '2026-06-15T10:30:00.000Z' },
        { id: 'NOT-000003', type: 'parole_eligibility', title: 'Parole Eligibility Alert', message: 'Paul Kaupa (PR-000001) reached eligibility: One-third (1/3) of total sentence.', recipientRole: 'System Administrator', recipientUserId: null, institutionId: 'INS-000001', prisonerId: 'PR-000001', eligibleDate: '2025-01-15', read: false, resolved: false, createdAt: '2026-01-15T08:00:00.000Z' },
        { id: 'NOT-000004', type: 'parole_eligibility', title: 'Parole Eligibility Alert', message: 'Paul Kaupa (PR-000001) reached eligibility at Bomana Correctional Institution.', recipientRole: 'Jail Commander', recipientUserId: 'USR-000004', institutionId: 'INS-000001', prisonerId: 'PR-000001', eligibleDate: '2025-01-15', read: true, resolved: false, createdAt: '2026-01-15T08:00:00.000Z' },
      ],
      auditLogs: [
        { id: 'AUD-000001', userId: 'USR-000002', userName: 'John Dole', role: 'PNGCS Parole Clerk', action: 'CREATE', entity: 'ParoleApplication', entityId: 'APP-000001', details: 'Submitted parole application for Paul Kaupa', timestamp: '2026-06-15T10:30:00.000Z' },
        { id: 'AUD-000002', userId: 'USR-000001', userName: 'System Administrator', role: 'System Administrator', action: 'LOGIN', entity: 'Session', entityId: 'USR-000001', details: 'Administrator signed in', timestamp: '2026-07-30T09:00:00.000Z' },
        { id: 'AUD-000003', userId: 'USR-000004', userName: 'James Wari', role: 'Jail Commander', action: 'APPROVE', entity: 'InstitutionReport', entityId: 'INS-000001', details: 'Approved institutional report for Bomana', timestamp: '2026-06-20T14:00:00.000Z' },
        { id: 'AUD-000004', userId: 'USR-000005', userName: 'Francis Kakaraya', role: 'Parole Board Member', action: 'DECISION', entity: 'ParoleApplication', entityId: 'APP-000003', details: 'Board Approved — Peter Wama', timestamp: '2026-01-20T11:00:00.000Z' },
      ],
      reports: [
        { id: 'RPT-000001', institutionId: 'INS-000001', type: 'institutional', title: 'Institutional Report — Bomana', status: 'Approved', createdBy: 'USR-000004', createdAt: '2026-06-20T14:00:00.000Z' },
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

  async function ensureLoaded() {
    if (loaded) return;
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
        data = store;
        if (demoPasswords) Object.assign(DEMO_PASSWORDS, demoPasswords);
      } else {
        data = seedData();
        try { await pushSnapshotToDatabase(data); } catch (_) { /* server may seed on next request */ }
      }
    } else {
      try {
        const raw = localStorage.getItem(LS_KEY);
        data = raw ? JSON.parse(raw) : seedData();
      } catch {
        data = seedData();
      }
    }

    if (!data.reports) data.reports = [];
    PMSIdGenerator.ensureCounters(data);
    migrateLegacyStatuses();
    if (typeof PMSEligibility !== 'undefined') {
      PMSEligibility.syncAllPrisoners(null, data.applications);
      persist();
    }
    loaded = true;
  }

  function migrateLegacyStatuses() {
    if (!data.prisoners) return;
    data.prisoners.forEach((p) => {
      if (typeof PMSEligibility !== 'undefined') {
        p.status = PMSEligibility.normalizeStatus(p.status);
      }
    });
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
    if (typeof PMSEligibility !== 'undefined') PMSEligibility.syncAllPrisoners(actor, data.applications);
    persist();
    return getSettings();
  }

  function getAuditLogs() { return [...data.auditLogs]; }

  function getUsers() { return [...data.users]; }
  function getUserById(id) { return data.users.find((u) => u.id === id); }
  function getUserByUsername(u) { return data.users.find((x) => x.username.toLowerCase() === u.toLowerCase()); }

  function saveUser(user, actor) {
    if (user.id) {
      const idx = data.users.findIndex((u) => u.id === user.id);
      if (idx < 0) throw new Error('User not found');
      const existing = data.users[idx];
      const { id: _id, officerId: _oid, employeeNumber: _emp, ...updates } = user;
      data.users[idx] = { ...existing, ...updates, id: existing.id, officerId: existing.officerId, employeeNumber: existing.employeeNumber };
      if (user.password) DEMO_PASSWORDS[data.users[idx].username] = user.password;
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
      if (user.password) DEMO_PASSWORDS[username] = user.password;
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
    DEMO_PASSWORDS[u.username] = newPassword;
    logAudit(actor, 'UPDATE', 'User', userId, `Password reset for ${u.username}`);
    return u;
  }

  function authenticate(identifier, password) {
    if (!data) throw new Error('Storage not loaded');
    const login = identifier.trim().toLowerCase();
    const user = data.users.find((u) =>
      u.status === 'Active' && (u.username.toLowerCase() === login || u.email.toLowerCase() === login));
    if (!user) return null;
    if (user.employmentStatus === 'Inactive' || user.accountStatus === 'Suspended') return null;
    const expected = DEMO_PASSWORDS[user.username];
    if (!expected || password !== expected) return null;
    const { password: _p, ...safe } = user;
    saveSession(safe);
    const u = data.users.find((x) => x.id === safe.id);
    if (u) u.lastLogin = new Date().toISOString();
    persist();
    logAudit(safe, 'LOGIN', 'Session', safe.id, `${safe.username} signed in`);
    return safe;
  }

  function getInstitutions(activeOnly = false) {
    let list = [...data.institutions];
    if (activeOnly) list = list.filter((i) => i.status === 'Active');
    return list;
  }
  function getInstitutionById(id) { return data.institutions.find((i) => i.id === id); }

  function getJailCommanderForInstitution(institutionId) {
    const inst = getInstitutionById(institutionId);
    if (!inst) return null;
    if (inst.commanderId) {
      const u = getUserById(inst.commanderId);
      if (u && u.role === 'Jail Commander') return u;
    }
    return data.users.find((u) =>
      u.institutionId === institutionId && u.role === 'Jail Commander') || null;
  }

  function getJailCommanders() {
    return data.users.filter((u) => u.role === 'Jail Commander');
  }

  function getCommanderProfile(userId) {
    const u = getUserById(userId);
    if (!u || u.role !== 'Jail Commander') return null;
    const inst = u.institutionId ? getInstitutionById(u.institutionId) : null;
    return {
      ...u,
      fullName: `${u.firstName} ${u.lastName}`,
      assignedInstitution: inst?.name || '—',
      assignedInstitutionId: u.institutionId,
      province: u.province || inst?.province || '',
    };
  }

  function saveCommanderProfile(profile, actor) {
    const user = getUserById(profile.id);
    if (!user || user.role !== 'Jail Commander') throw new Error('Jail Commander not found');
    Object.assign(user, {
      firstName: profile.firstName ?? user.firstName,
      lastName: profile.lastName ?? user.lastName,
      email: profile.email ?? user.email,
      username: profile.username ?? user.username,
      phone: profile.phone ?? user.phone,
      rank: profile.rank ?? user.rank ?? 'Jail Commander',
      position: profile.position ?? user.position ?? 'Jail Commander',
      province: profile.province ?? user.province,
      employmentStatus: profile.employmentStatus ?? user.employmentStatus,
      accountStatus: profile.accountStatus ?? user.accountStatus,
      status: profile.status ?? (profile.employmentStatus === 'Inactive' ? 'Inactive' : user.status),
      dateAppointed: profile.dateAppointed ?? user.dateAppointed,
      institutionId: profile.institutionId ?? user.institutionId,
    });
    if (profile.institutionId && profile.institutionId !== user.institutionId) {
      assignJailCommander(profile.institutionId, user.id, actor);
    }
    if (profile.password) DEMO_PASSWORDS[user.username] = profile.password;
    logAudit(actor, 'UPDATE', 'JailCommander', user.id, `Updated profile: ${user.firstName} ${user.lastName}`);
    persist();
    return getCommanderProfile(user.id);
  }

  function getCommanderDetailBundle(commanderId) {
    const commander = getCommanderProfile(commanderId);
    if (!commander) return null;
    const instId = commander.institutionId;
    if (!instId) return { commander, institution: null, stats: {}, officers: [], prisoners: [], applications: [], eligible: [], notifications: [], auditLogs: [] };

    const institution = getInstitutionById(instId);
    const officers = getOfficersByInstitution(instId);
    const prisoners = getPrisonersByInstitution(instId);
    const applications = getParoleApplications().filter((a) => a.institutionId === instId);
    const eligible = prisoners.filter((p) => getPrisonerProgress(p).eligible);
    const activeApps = applications.filter((a) => !['Approved', 'Refused', 'Deferred', 'Draft'].includes(a.status));
    const notifications = getNotifications().filter((n) =>
      n.institutionId === instId && (n.recipientRole === 'Jail Commander' || n.recipientUserId === commanderId));
    const auditLogs = getAuditLogs().filter((l) =>
      l.entityId === instId || l.userId === commanderId || l.details?.includes(institution?.name || ''));

    return {
      commander,
      institution,
      stats: {
        officerCount: officers.length,
        prisonerCount: prisoners.length,
        activeApplications: activeApps.length,
        eligibleCount: eligible.length,
        unreadNotifications: notifications.filter((n) => !n.read).length,
      },
      officers,
      prisoners,
      applications: activeApps,
      eligible,
      notifications: notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      auditLogs: auditLogs.slice(0, 12),
    };
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

  function assignJailCommander(institutionId, userId, actor) {
    const inst = getInstitutionById(institutionId);
    if (!inst) throw new Error('Institution not found');
    if (inst.commanderId && inst.commanderId !== userId) {
      const prev = getUserById(inst.commanderId);
      if (prev && prev.institutionId === institutionId && prev.role === 'Jail Commander') {
        prev.institutionId = null;
      }
    }
    if (userId) {
      const user = getUserById(userId);
      if (!user) throw new Error('Commander user not found');
      user.role = 'Jail Commander';
      user.institutionId = institutionId;
      user.rank = 'Jail Commander';
      user.position = user.position || 'Jail Commander';
      user.province = inst.province || user.province;
      user.employmentStatus = user.employmentStatus || 'Active';
      user.accountStatus = user.accountStatus || 'Active';
      inst.commanderId = userId;
      logAudit(actor, 'ASSIGN', 'Institution', institutionId, `Assigned Jail Commander: ${user.firstName} ${user.lastName}`);
    } else {
      inst.commanderId = null;
      logAudit(actor, 'UPDATE', 'Institution', institutionId, 'Removed Jail Commander assignment');
    }
    persist();
    return getInstitutionById(institutionId);
  }

  function saveInstitution(inst, actor) {
    const payload = normalizeInstitution(inst);
    if (payload.id) {
      const idx = data.institutions.findIndex((i) => i.id === payload.id);
      if (idx < 0) throw new Error('Institution not found');
      const existing = data.institutions[idx];
      data.institutions[idx] = { ...existing, ...payload, id: existing.id, code: existing.code };
      if (inst.commanderId !== undefined) assignJailCommander(payload.id, inst.commanderId || null, actor);
    } else {
      const id = generateId('institution');
      data.institutions.push({
        ...payload,
        id,
        code: id,
        status: payload.status || 'Active',
        commanderId: null,
      });
      if (inst.commanderId) assignJailCommander(id, inst.commanderId, actor);
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

  function getPrisoners() { return [...data.prisoners]; }
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
    const entry = { ...doc, id: doc.id || generateId('document') };
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

  function getParoleApplications() { return [...data.applications]; }
  function getApplicationById(id) { return data.applications.find((a) => a.id === id); }

  function createEmptyForms() {
    return PAROLE_FORMS.map((f) => ({
      formNumber: f.number, formName: f.name, fileName: null, dataUrl: null,
      uploadedAt: null, verified: false, verifiedBy: null,
    }));
  }
  function createEmptyFormData() { return { form1: {}, form2: {}, form3: {}, form4: {}, form5: {} }; }

  function isForm1Complete(form1) {
    if (typeof PMSForm1Validation !== 'undefined') return PMSForm1Validation.isForm1Complete(form1);
    return !!(form1?.status === 'submitted' && form1?.eligibilityOutcome && form1?.officerName);
  }

  function getOrCreateDraftApplication(prisonerId, actor) {
    const prisoner = getPrisonerById(prisonerId);
    if (!prisoner) throw new Error('Prisoner record not found.');
    const existing = data.applications.find(
      (a) => a.prisonerId === prisonerId && !['Approved', 'Refused'].includes(a.status)
    );
    if (existing) return existing;
    return saveParoleApplication({
      prisonerId,
      institutionId: prisoner.institutionId,
      status: 'Draft',
      formData: createEmptyFormData(),
    }, actor);
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
      if (!['Jail Commander', 'System Administrator'].includes(role)) {
        throw new Error('Only a Jail Commander or System Administrator may record supervisory review.');
      }
      if (existing.status !== 'submitted') {
        throw new Error('Supervisory review requires a submitted Form 1.');
      }
      merged.supervisorReview = {
        ...(existing.supervisorReview || {}),
        ...(form1Data.supervisorReview || {}),
      };
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
    const checks = {
      form1: isForm1Complete(fd.form1),
      form2: !!fd.form2?.nextOfKinName,
      form3: !!fd.form3?.commanderRecommendation,
      form4: !!fd.form4?.investigationSummary,
      form5: !!fd.form5?.boardDecision,
    };
    return { completed: Object.values(checks).filter(Boolean).length, total: 5, checks };
  }

  function saveParoleApplication(app, actor) {
    const prisoner = getPrisonerById(app.prisonerId);
    if (!prisoner) throw new Error('Prisoner not found');
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
      data.applications.push({ ...payload, id, status: payload.status || 'Draft', createdAt: new Date().toISOString() });
    }
    const saved = app.id ? getApplicationById(app.id) : data.applications.at(-1);
    logAudit(actor, app.id ? 'UPDATE' : 'CREATE', 'ParoleApplication', saved.id, saved.status);
    persist();
    return saved;
  }

  function saveFormData(appId, formKey, formData, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    app.formData = app.formData || createEmptyFormData();
    const merged = PMSIdGenerator.assignFormId(data, formKey, { ...app.formData[formKey], ...formData });
    app.formData[formKey] = merged;
    logAudit(actor, 'SAVE', 'Form', merged.formId || `${appId}-${formKey}`, PAROLE_FORMS.find((f) => `form${f.number}` === formKey)?.name || formKey);
    persist();
    return app;
  }

  function transitionApplication(appId, toStatus, actor, notes = '') {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    app.status = toStatus;
    if (toStatus === 'Submitted') {
      app.submittedAt = new Date().toISOString().split('T')[0];
      app.submittedBy = actor.id;
    }
    if (notes) app.workflowNotes = [...(app.workflowNotes || []), { status: toStatus, notes, at: new Date().toISOString(), by: actor.id }];
    logAudit(actor, 'UPDATE', 'ParoleApplication', appId, `Status → ${toStatus}. ${notes}`);
    const prisoner = getPrisonerById(app.prisonerId);
    const pName = prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : 'prisoner';
    const appMeta = { institutionId: app.institutionId, prisonerId: app.prisonerId, applicationId: appId, type: 'application', linkPanel: 'applications' };
    if (toStatus === 'Submitted') {
      notifyRole('DJAG Parole Clerk', 'New Parole Application', `PNGCS submitted application for ${pName}`, app.institutionId, app.prisonerId, null, appMeta);
    }
    if (toStatus === 'Returned for Correction') {
      notifyRole('PNGCS Parole Clerk', 'Application Returned', notes || 'Application returned for correction', app.institutionId, app.prisonerId, null, appMeta);
    }
    if (toStatus === 'Under DJAG Review') {
      notifyRole('PNGCS Parole Clerk', 'Application Under Review', `Application for ${pName} is under DJAG review`, app.institutionId, app.prisonerId, null, appMeta);
    }
    if (toStatus === 'Pre-Parole Report Prepared') {
      notifyRole('Parole Board Member', 'Pre-Parole Report Ready', `Pre-parole report prepared for ${pName}`, app.institutionId, app.prisonerId, null, appMeta);
    }
    if (toStatus === 'Hearing Scheduled') {
      notifyRoles(['Parole Board Member', 'PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'Hearing Scheduled',
        `Parole hearing scheduled for ${pName}`, { ...appMeta, type: 'hearing', linkPanel: 'hearings' });
      getOfficersByInstitution(app.institutionId).filter((o) => o.role === 'Jail Commander').forEach((o) =>
        notifyRole('Jail Commander', 'Hearing Scheduled', `Parole hearing scheduled for ${pName}`, app.institutionId, app.prisonerId, o.id, { ...appMeta, type: 'hearing', linkPanel: 'applications' }));
    }
    if (toStatus === 'Pending Board Review') {
      notifyRole('Parole Board Member', 'Application Ready for Board', `Application ready for board review: ${pName}`, app.institutionId, app.prisonerId, null, appMeta);
    }
    if (toStatus === 'Approved') {
      notifyRoles(['PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'Application Approved', `Parole application approved for ${pName}`, appMeta);
    }
    if (toStatus === 'Refused') {
      notifyRoles(['PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'Application Refused', notes || `Parole application refused for ${pName}`, appMeta);
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
    return transitionApplication(appId, 'Submitted', actor, 'Submitted to DJAG for review');
  }

  function recordBoardDecision(appId, decision, actor) {
    const app = getApplicationById(appId);
    if (!app) throw new Error('Application not found');
    const outcome = decision.outcome || decision.boardDecision;
    app.boardDecision = {
      outcome,
      conditions: decision.conditions || '',
      deliberationNotes: decision.deliberationNotes || '',
      decidedBy: actor.id,
      decidedAt: new Date().toISOString(),
    };
    app.formData = app.formData || createEmptyFormData();
    app.formData.form5 = { ...app.formData.form5, boardDecision: outcome, conditions: decision.conditions, deliberationNotes: decision.deliberationNotes };
    app.status = outcome;
    const prisoner = getPrisonerById(app.prisonerId);
    if (prisoner) applyPrisonerEligibility(prisoner, actor);
    logAudit(actor, 'DECISION', 'ParoleApplication', appId, `Board ${outcome}`);
    const pName = prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : 'prisoner';
    const appMeta = { institutionId: app.institutionId, prisonerId: app.prisonerId, applicationId: appId, type: 'application', linkPanel: 'applications' };
    if (outcome === 'Approved') {
      notifyRoles(['PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'Application Approved', `Board approved parole for ${pName}`, appMeta);
    } else if (outcome === 'Refused') {
      notifyRoles(['PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'Application Refused', `Board refused parole for ${pName}`, appMeta);
    } else if (outcome === 'Deferred') {
      notifyRoles(['PNGCS Parole Clerk', 'DJAG Parole Clerk'], 'Decision Deferred', `Board deferred decision for ${pName}`, appMeta);
    }
    notifyRole('Parole Board Member', 'Decision Recorded', `${outcome} recorded for ${pName}`, app.institutionId, app.prisonerId, null, appMeta);
    persist();
    return app;
  }

  function uploadApplicationForm() { throw new Error('Use saveFormData for form completion'); }
  function verifyApplicationForm(appId) { return getApplicationById(appId); }

  function getHearings() { return [...data.hearings]; }
  function getHearingById(id) { return data.hearings.find((h) => h.id === id); }

  function saveHearing(hearing, actor) {
    const isUpdate = !!hearing.id;
    if (hearing.id) {
      const idx = data.hearings.findIndex((h) => h.id === hearing.id);
      if (idx < 0) throw new Error('Hearing not found');
      data.hearings[idx] = { ...data.hearings[idx], ...hearing };
    } else {
      const id = generateId('hearing');
      data.hearings.push({ ...hearing, id, status: hearing.status || 'Scheduled' });
    }
    const saved = isUpdate ? getHearingById(hearing.id) : data.hearings.at(-1);
    logAudit(actor, isUpdate ? 'UPDATE' : 'CREATE', 'Hearing', saved.id, hearing.location || '');
    const p = getPrisonerById(saved.prisonerId);
    const pName = p ? `${p.firstName} ${p.lastName}` : 'prisoner';
    const title = isUpdate ? 'Hearing Updated' : 'Hearing Scheduled';
    const msg = `${title}: ${pName} — ${saved.location || 'TBD'} on ${saved.scheduledDate || 'TBD'}`;
    const hearingMeta = { institutionId: p?.institutionId, prisonerId: saved.prisonerId, hearingId: saved.id, type: 'hearing', linkPanel: 'hearings' };
    notifyRoles(['DJAG Parole Clerk', 'Parole Board Member'], title, msg, hearingMeta);
    notifyRole('PNGCS Parole Clerk', title, msg, p?.institutionId, saved.prisonerId, null, hearingMeta);
    if (p?.institutionId) {
      getOfficersByInstitution(p.institutionId).filter((o) => o.role === 'Jail Commander').forEach((o) =>
        notifyRole('Jail Commander', title, msg, p.institutionId, saved.prisonerId, o.id, { ...hearingMeta, linkPanel: 'applications' }));
    }
    persist();
    return saved;
  }

  function createNotification(opts) {
    const {
      role, title, message, type = 'system',
      institutionId = null, prisonerId = null, applicationId = null, hearingId = null,
      userId = null, linkPanel = null, linkHref = null, eligibleDate = null,
    } = opts;
    data.notifications.unshift({
      id: generateId('notification'),
      type, title, message,
      recipientRole: role,
      recipientUserId: userId,
      institutionId, prisonerId, applicationId, hearingId,
      linkPanel, linkHref, eligibleDate,
      read: false, resolved: false,
      createdAt: new Date().toISOString(),
    });
  }

  function notifyRole(role, title, message, institutionId, prisonerId, userId = null, extra = {}) {
    createNotification({ role, title, message, institutionId, prisonerId, userId, ...extra });
  }

  function notifyRoles(roles, title, message, meta = {}) {
    roles.forEach((role) => createNotification({ role, title, message, ...meta }));
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

  function syncParoleNotifications(actor) {
    const settings = getSettings();
    const fraction = settings.paroleEligibilityFraction;
    const label = settings.paroleEligibilityLabel;
    const existing = new Set(data.notifications.filter((n) => n.type === 'eligibility').map((n) => n.prisonerId));

    data.prisoners.forEach((p) => {
      const prog = getPrisonerProgress(p);
      if (!prog.eligible || existing.has(p.id)) return;
      const msg = `${p.firstName} ${p.lastName} (${p.prisonerNumber}) reached eligibility: ${label}.`;
      const eligMeta = { type: 'eligibility', eligibleDate: prog.eligibilityDate, linkPanel: 'eligibility', prisonerId: p.id, institutionId: p.institutionId };
      notifyRole('System Administrator', 'Parole Eligibility Alert', msg, p.institutionId, p.id, null, eligMeta);
      notifyRole('PNGCS Parole Clerk', 'Parole Eligibility Alert', msg, p.institutionId, p.id, null, eligMeta);
      getOfficersByInstitution(p.institutionId).filter((o) => o.role === 'Jail Commander').forEach((o) =>
        notifyRole('Jail Commander', 'Parole Eligibility Alert', msg, p.institutionId, p.id, o.id, eligMeta));
      if (p.status === 'Awaiting Eligibility') applyPrisonerEligibility(p, actor);
      existing.add(p.id);
    });
    persist();
    return getNotifications();
  }

  function getNotifications() { return [...data.notifications]; }
  function getNotificationsForUser(user) {
    return data.notifications.filter((n) =>
      n.recipientRole === user.role && (!n.recipientUserId || n.recipientUserId === user.id));
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
    saveSession(user);
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
    return {
      totalUsers: data.users.length,
      totalOfficers: data.users.filter((u) => u.role !== 'System Administrator').length,
      totalPrisoners: prisoners.length,
      totalInstitutions: data.institutions.length,
      activeParoleApplications: apps.filter((a) => !['Approved', 'Refused', 'Deferred', 'Draft'].includes(a.status)).length,
      eligiblePrisoners: prisoners.filter((p) => getPrisonerProgress(p).eligible).length,
      pendingNotifications,
      applicationsByStatus: APPLICATION_STATUSES.reduce((acc, s) => {
        acc[s] = apps.filter((a) => a.status === s).length;
        return acc;
      }, {}),
    };
  }

  function reloadAll() {
    loaded = false;
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
    savePrisoner, deletePrisoner, addPrisonerDocument, removePrisonerDocument,
    getParoleApplications, getApplicationById, saveParoleApplication, uploadApplicationForm,
    verifyApplicationForm, submitApplicationToDJAG, createEmptyForms, createEmptyFormData,
    saveFormData, saveForm1Screening, getOrCreateDraftApplication, isForm1Complete,
    transitionApplication, recordBoardDecision, getFormCompletionSummary,
    getHearings, getHearingById, saveHearing,
    getReports, createReport, previewNextId,
    getNotifications, getNotificationsForUser, syncParoleNotifications,
    markNotificationRead, resolveNotification, markAllNotificationsRead,
    getUnreadCount, getUnreadCountForUser,
    setSession, getSession, clearSession, getDashboardStats,
  };
})();
